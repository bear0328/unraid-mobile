// 【续 59 2026-07-22】licenseBinding 测试:flashGuid 绑机检查 + 设备计数(上限/放行)
// mock 掉 GraphQL 与 DAV IO,license 状态用 __setLicenseStateForTest 注入
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkServerBinding,
  registerDevice,
  unregisterDevice,
  getServerFlashGuid,
} from './licenseBinding';
import {
  getLicenseState,
  isPro,
  __setLicenseStateForTest,
  __resetLicenseForTest,
  type LicenseInfo,
} from './license';
import { getApiConfig } from './unraidApi/config';
import { graphqlRequest } from './unraidApi/graphql';
import { davFetch } from '../components/shares/davAuth';

vi.mock('./unraidApi/config', () => ({ getApiConfig: vi.fn() }));
vi.mock('./unraidApi/graphql', () => ({
  graphqlRequest: vi.fn(),
  buildGraphqlEndpoint: vi.fn(() => 'http://x/graphql'),
}));
vi.mock('../components/shares/davAuth', () => ({ davFetch: vi.fn() }));

const mockGetApiConfig = vi.mocked(getApiConfig);
const mockGraphql = vi.mocked(graphqlRequest);
const mockDavFetch = vi.mocked(davFetch);

const GUID = '346D-5678-4681-113486419445';
const boundInfo: LicenseInfo = { email: 'u@e.com', tier: 'pro', iat: 1, exp: null, guid: GUID, maxDev: 3 };

function makeResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function guidResult(guid: string | null) {
  return { success: true as const, data: { vars: { flashGuid: guid } } };
}

beforeEach(() => {
  localStorage.clear();
  mockGetApiConfig.mockReturnValue({ serverUrl: 'http://x', apiKey: 'k' } as ReturnType<
    typeof getApiConfig
  >);
  mockGraphql.mockReset();
  mockDavFetch.mockReset();
});

afterEach(() => {
  __resetLicenseForTest();
});

describe('getServerFlashGuid', () => {
  it('查询成功 → 返回 flashGuid', async () => {
    mockGraphql.mockResolvedValue(guidResult(GUID) as never);
    expect(await getServerFlashGuid()).toBe(GUID);
  });

  it('未配置 API → null,不发请求', async () => {
    mockGetApiConfig.mockReturnValue(null);
    expect(await getServerFlashGuid()).toBeNull();
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it('查询失败 → null', async () => {
    mockGraphql.mockResolvedValue({ success: false, error: 'x' } as never);
    expect(await getServerFlashGuid()).toBeNull();
  });
});

describe('checkServerBinding', () => {
  it('状态 none → true,不发请求', async () => {
    expect(await checkServerBinding()).toBe(true);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it('不绑机 key(无 guid)→ true,不发请求', async () => {
    __setLicenseStateForTest({ status: 'active', info: { ...boundInfo, guid: null } });
    expect(await checkServerBinding()).toBe(true);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it('guid 匹配 → true,保持 active', async () => {
    __setLicenseStateForTest({ status: 'active', info: boundInfo });
    mockGraphql.mockResolvedValue(guidResult(GUID) as never);
    expect(await checkServerBinding()).toBe(true);
    expect(getLicenseState().status).toBe('active');
    expect(isPro()).toBe(true);
  });

  it('guid 不匹配 → false,状态 mismatch,isPro()=false', async () => {
    __setLicenseStateForTest({ status: 'active', info: boundInfo });
    mockGraphql.mockResolvedValue(guidResult('AAAA-BBBB-CCCC') as never);
    expect(await checkServerBinding()).toBe(false);
    expect(getLicenseState().status).toBe('mismatch');
    expect(isPro()).toBe(false);
  });

  it('mismatch 态复查匹配 → 翻回 active', async () => {
    __setLicenseStateForTest({ status: 'mismatch', info: boundInfo });
    mockGraphql.mockResolvedValue(guidResult(GUID) as never);
    expect(await checkServerBinding()).toBe(true);
    expect(getLicenseState().status).toBe('active');
  });

  it('查不到服务器 guid(离线)→ 放行 true,不翻转状态', async () => {
    __setLicenseStateForTest({ status: 'active', info: boundInfo });
    mockGraphql.mockResolvedValue({ success: false, error: 'offline' } as never);
    expect(await checkServerBinding()).toBe(true);
    expect(getLicenseState().status).toBe('active');
  });
});

describe('registerDevice', () => {
  const devFile = (devices: object[]) => makeResponse(200, { devices });

  it('文件 404 → 建文件注册第 1 台,count=1', async () => {
    mockDavFetch
      .mockResolvedValueOnce(makeResponse(404)) // GET
      .mockResolvedValueOnce(makeResponse(204)); // PUT
    const r = await registerDevice(boundInfo);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.maxDev).toBe(3);
    // PUT body 含本机 deviceId
    const putBody = JSON.parse(mockDavFetch.mock.calls[1][1]?.body as string);
    expect(putBody.devices).toHaveLength(1);
    expect(putBody.devices[0].id).toBe(localStorage.getItem('unraid-mobile-device-id'));
  });

  it('本机已注册 → 只更新 lastSeen,count 不变', async () => {
    localStorage.setItem('unraid-mobile-device-id', 'dev-1');
    mockDavFetch
      .mockResolvedValueOnce(devFile([{ id: 'dev-1', firstSeen: 1, lastSeen: 1 }]))
      .mockResolvedValueOnce(makeResponse(204));
    const r = await registerDevice(boundInfo);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    const putBody = JSON.parse(mockDavFetch.mock.calls[1][1]?.body as string);
    expect(putBody.devices).toHaveLength(1);
    expect(putBody.devices[0].lastSeen).toBeGreaterThan(1);
  });

  it('已满 3 台且本机是新设备 → 拒绝,错误含上限提示', async () => {
    localStorage.setItem('unraid-mobile-device-id', 'dev-new');
    mockDavFetch.mockResolvedValueOnce(
      devFile([
        { id: 'd1', firstSeen: 1, lastSeen: 1 },
        { id: 'd2', firstSeen: 1, lastSeen: 1 },
        { id: 'd3', firstSeen: 1, lastSeen: 1 },
      ])
    );
    const r = await registerDevice(boundInfo);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('3 台设备上限');
    // 拒绝时不应发 PUT
    expect(mockDavFetch).toHaveBeenCalledTimes(1);
  });

  it('文件不可读(403 未配 DAV 密码)→ 放行 ok(防君子)', async () => {
    mockDavFetch.mockResolvedValueOnce(makeResponse(403));
    const r = await registerDevice(boundInfo);
    expect(r.ok).toBe(true);
  });

  it('PUT 失败 → 仍放行 ok', async () => {
    mockDavFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(500));
    const r = await registerDevice(boundInfo);
    expect(r.ok).toBe(true);
  });

  it('info.maxDev 缺省 → 按 3 计', async () => {
    localStorage.setItem('unraid-mobile-device-id', 'dev-new');
    mockDavFetch.mockResolvedValueOnce(
      devFile([
        { id: 'd1', firstSeen: 1, lastSeen: 1 },
        { id: 'd2', firstSeen: 1, lastSeen: 1 },
        { id: 'd3', firstSeen: 1, lastSeen: 1 },
      ])
    );
    const r = await registerDevice({ ...boundInfo, maxDev: undefined });
    expect(r.ok).toBe(false);
  });
});

describe('unregisterDevice', () => {
  it('从文件删除本机 deviceId 并 PUT 回', async () => {
    localStorage.setItem('unraid-mobile-device-id', 'dev-1');
    mockDavFetch
      .mockResolvedValueOnce(
        makeResponse(200, {
          devices: [
            { id: 'dev-1', firstSeen: 1, lastSeen: 1 },
            { id: 'dev-2', firstSeen: 1, lastSeen: 1 },
          ],
        })
      )
      .mockResolvedValueOnce(makeResponse(204));
    await unregisterDevice();
    const putBody = JSON.parse(mockDavFetch.mock.calls[1][1]?.body as string);
    expect(putBody.devices).toEqual([{ id: 'dev-2', firstSeen: 1, lastSeen: 1 }]);
  });

  it('本机不在文件里 → 不发 PUT', async () => {
    localStorage.setItem('unraid-mobile-device-id', 'dev-x');
    mockDavFetch.mockResolvedValueOnce(makeResponse(200, { devices: [] }));
    await unregisterDevice();
    expect(mockDavFetch).toHaveBeenCalledTimes(1);
  });

  it('文件不可读 → 静默返回', async () => {
    mockDavFetch.mockResolvedValueOnce(makeResponse(403));
    await expect(unregisterDevice()).resolves.toBeUndefined();
  });
});
