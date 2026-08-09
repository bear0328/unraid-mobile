// 【阶段 P2-1 - 2026-06-16 续 13】vmApi 端到端测试
// 覆盖:列表(extract vmUuid) / 5 个动作 / getVmLogs(unraid API 不支持 VM 日志) / getVmDetails(按 uuid 找)
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
// 用 namespace import 走 vmApi[fn] 动态分发(it.each 简化 5 个动作的重复断言)
import * as vmApi from './vmApi';
import { clearAllGraphqlCache, getCache, getCacheKey, setCache } from './cache';

function mockFetchOnce(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE = 'https://nas.local';
const KEY = 'k';
const PROXY = true;

describe('vmApi', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearAllGraphqlCache();
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getVMs', () => {
    it('把 serverId:vmUUID 拆出 vmUuid 部分', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            vms: {
              domains: [
                { id: 'srv-1:uuid-aaa', name: 'win11', state: 'RUNNING' },
                { id: 'srv-1:uuid-bbb', name: 'ubuntu', state: 'SHUTOFF' },
              ],
            },
          },
        })
      );
      const list = (await vmApi.getVMs(BASE, KEY, PROXY))!;
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: 'srv-1:uuid-aaa',
        vmUuid: 'uuid-aaa',
        name: 'win11',
        state: 'RUNNING',
      });
    });

    it('空列表返 [](真空合法)', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { vms: { domains: [] } } }));
      expect(await vmApi.getVMs(BASE, KEY, PROXY)).toEqual([]);
    });

    it('【续 91 A1】失败响应返 null(区别于真空 [];调用方保留旧列表)', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'boom' }] }));
      expect(await vmApi.getVMs(BASE, KEY, PROXY)).toBeNull();
    });
  });

  describe('VM 动作', () => {
    it.each(['startVm', 'stopVm', 'pauseVm', 'resumeVm', 'rebootVm'])(
      '%s 失败时 error 透传 graphql 的 message',
      async (fn) => {
        fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'domain busy' }] }));
        // @ts-expect-error 动态调用同形式函数
        const r = await vmApi[fn](BASE, KEY, PROXY, 'uuid-x');
        expect(r).toEqual({ success: false, error: 'domain busy' });
      }
    );

    it.each(['startVm', 'stopVm', 'pauseVm', 'resumeVm', 'rebootVm'])(
      '%s 自动加 vm: 前缀',
      async (fn) => {
        fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
        // @ts-expect-error 动态调用
        await vmApi[fn](BASE, KEY, PROXY, 'uuid-x');
        const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.variables.id).toBe('vm:uuid-x');
      }
    );
  });

  // 【续 50 B1】VM mutation 成功后必须失效 vms cache(30min TTL),containers 不受影响
  describe('mutation 后 cache 失效(续 50 B1)', () => {
    it.each(['startVm', 'stopVm', 'pauseVm', 'resumeVm', 'rebootVm'])(
      '%s 成功 → vms + vmDetails cache 清除,containers cache 不受影响',
      async (fn) => {
        setCache(getCacheKey('vms'), { stale: true });
        setCache(getCacheKey('vmDetails'), { stale: true });
        setCache(getCacheKey('containers'), { stale: true });
        fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
        // @ts-expect-error 动态调用同形式函数
        const r = await vmApi[fn](BASE, KEY, PROXY, 'uuid-x');
        expect(r.success).toBe(true);
        expect(getCache(getCacheKey('vms'))).toBeNull();
        // 【续 88】详情独立 namespace 也随 mutation 失效(state 是详情字段)
        expect(getCache(getCacheKey('vmDetails'))).toBeNull();
        expect(getCache(getCacheKey('containers'))).not.toBeNull();
      }
    );

    it('VM mutation 失败 → vms cache 保留(不清)', async () => {
      setCache(getCacheKey('vms'), { stale: true });
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'boom' }] }));
      const r = await vmApi.stopVm(BASE, KEY, PROXY, 'uuid-x');
      expect(r.success).toBe(false);
      expect(getCache(getCacheKey('vms'))).not.toBeNull();
    });
  });

  describe('getVmLogs', () => {
    // 【续 50 P2】如实返回失败,不再返 success:true + 占位文案的假数据
    it('unRAID API 不支持 VM 日志 → 返 success:false,且不发请求', async () => {
      const r = await vmApi.getVmLogs(BASE, KEY, PROXY);
      expect(r.success).toBe(false);
      expect(r.error).toContain('不支持 VM 日志');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('getVmDetails', () => {
    it('按 uuid 匹配返 details', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            vms: {
              domains: [
                { name: 'win11', uuid: 'uuid-aaa', state: 'RUNNING' },
                { name: 'ubuntu', uuid: 'uuid-bbb', state: 'SHUTOFF' },
              ],
            },
          },
        })
      );
      const r = await vmApi.getVmDetails(BASE, KEY, PROXY, 'uuid-bbb');
      expect(r.success).toBe(true);
      expect(r.data).toEqual({ name: 'ubuntu', uuid: 'uuid-bbb', state: 'SHUTOFF' });
    });

    it('找不到返 "虚拟机不存在"', async () => {
      clearAllGraphqlCache();
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({ data: { vms: { domains: [{ uuid: 'aaa' }] } } })
      );
      const r = await vmApi.getVmDetails(BASE, KEY, PROXY, 'xxx');
      expect(r).toEqual({ success: false, error: '虚拟机不存在' });
    });

    // 【续 88 2026-08-08】回归:getVmDetails 用独立 'vmDetails' namespace,
    // 不再与 getVMs 的 'vms' 缓存串形(列表 domains 含 id 无 uuid,
    // 旧实现先列表后详情必返「虚拟机不存在」)
    it('先 getVMs 后 getVmDetails 不串缓存(独立 namespace)', async () => {
      // getVMs 写入 'vms' 缓存:domains 只有 id,无 uuid 字段
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            vms: { domains: [{ id: 'srv-1:uuid-aaa', name: 'win11', state: 'RUNNING' }] },
          },
        })
      );
      await vmApi.getVMs(BASE, KEY, PROXY);

      // getVmDetails 应绕过 'vms' 缓存真实发请求,按 uuid 命中详情
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: { vms: { domains: [{ name: 'win11', uuid: 'uuid-aaa', state: 'RUNNING' }] } },
        })
      );
      const r = await vmApi.getVmDetails(BASE, KEY, PROXY, 'uuid-aaa');
      expect(r.success).toBe(true);
      expect(r.data).toMatchObject({ uuid: 'uuid-aaa' });
      expect(fetchSpy).toHaveBeenCalledTimes(2); // 详情没吃列表的旧缓存
    });
  });

  // 【续 101】VM 详情增强(compose-api vminfo 端点,同源相对路径 + X-Api-Key)
  describe('getVmInfo', () => {
    const vmInfoPayload = {
      ok: true,
      data: {
        name: 'win11',
        uuid: 'uuid-aaa',
        vcpus: 8,
        memory: { current: 8388608, max: 16777216, unit: 'KiB' },
        autostart: true,
        disks: [
          {
            type: 'file',
            path: '/mnt/user/domains/win11/vdisk1.img',
            bus: 'virtio',
            dev: 'vda',
            format: 'qcow2',
            size: 68719476736,
          },
        ],
        interfaces: [{ type: 'bridge', bridge: 'br0', mac: '52:54:00:aa:bb:cc', model: 'virtio' }],
        graphics: { type: 'vnc', port: '5900', autoport: true, listen: '0.0.0.0' },
        hostDevices: [{ type: 'pci', domain: '0x0000', bus: '0x03', slot: '0x00', function: '0x0' }],
        snapshots: ['before-upgrade', 'clean'],
      },
    };

    it('成功:请求 /compose-api/?action=vminfo&vm=X 带 X-Api-Key,返回 data', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce(vmInfoPayload));
      const r = await vmApi.getVmInfo(BASE, KEY, PROXY, 'win11');
      expect(r.success).toBe(true);
      expect(r.data?.vcpus).toBe(8);
      expect(r.data?.disks[0]?.size).toBe(68719476736);
      expect(r.data?.snapshots).toEqual(['before-upgrade', 'clean']);
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/compose-api/?action=vminfo&vm=win11');
      expect((init.headers as Record<string, string>)['X-Api-Key']).toBe(KEY);
    });

    it('vm 名含特殊字符 → encodeURIComponent 编码', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ ok: true, data: { name: 'a b' } }));
      await vmApi.getVmInfo(BASE, KEY, PROXY, 'a b');
      const [url] = fetchSpy.mock.calls[0] as unknown as [string];
      expect(url).toBe('/compose-api/?action=vminfo&vm=a%20b');
    });

    it('后端 404(virsh 不可用)→ success:false 透传 error', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({ ok: false, error: '无法读取 VM XML(virsh 不可用且无配置文件): ghost' }, 404)
      );
      const r = await vmApi.getVmInfo(BASE, KEY, PROXY, 'ghost');
      expect(r.success).toBe(false);
      expect(r.error).toContain('无法读取 VM XML');
    });

    it('非 JSON 响应(nginx 错误页)→ success:false HTTP 状态码', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
      const r = await vmApi.getVmInfo(BASE, KEY, PROXY, 'win11');
      expect(r.success).toBe(false);
      expect(r.error).toBe('HTTP 502');
    });

    it('网络异常 → success:false', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
      const r = await vmApi.getVmInfo(BASE, KEY, PROXY, 'win11');
      expect(r.success).toBe(false);
      expect(r.error).toBe('fetch failed');
    });
  });
});
