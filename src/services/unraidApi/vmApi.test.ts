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
      const list = await vmApi.getVMs(BASE, KEY, PROXY);
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: 'srv-1:uuid-aaa',
        vmUuid: 'uuid-aaa',
        name: 'win11',
        state: 'RUNNING',
      });
    });

    it('空列表返 []', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { vms: { domains: [] } } }));
      expect(await vmApi.getVMs(BASE, KEY, PROXY)).toEqual([]);
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
      '%s 成功 → vms cache 清除,containers cache 不受影响',
      async (fn) => {
        setCache(getCacheKey('vms'), { stale: true });
        setCache(getCacheKey('containers'), { stale: true });
        fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
        // @ts-expect-error 动态调用同形式函数
        const r = await vmApi[fn](BASE, KEY, PROXY, 'uuid-x');
        expect(r.success).toBe(true);
        expect(getCache(getCacheKey('vms'))).toBeNull();
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
  });
});
