// 【阶段 P2-1 - 2026-06-16 续 13】dockerApi 端到端测试
// 覆盖:CRUD 6 个动作 + 列表名字清理 + 状态归一 + 容器详情 + 日志合并 + 统计查找 + restart 串联
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import {
  getDockerContainers,
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  resumeContainer,
  getContainerLogs,
  getContainerStats,
  getAllContainerStats,
  getContainerDetails,
} from './dockerApi';
import { clearAllGraphqlCache, getCache, getCacheKey, setCache } from './cache';
import {
  updateContainerIndex,
  __setStatsForTest,
  __resetStatsStreamForTest,
  __setClientFactoryForTest,
} from './containerStatsStream';
import type { createClient } from 'graphql-ws';

// graphql-ws 假 client:iterate 返回永不产出的 async iterable(避免 jsdom 真连 ws)
const fakeClientFactory = vi.fn(() => ({
  iterate: () => ({
    [Symbol.asyncIterator]() {
      return { next: () => new Promise(() => {}) };
    },
  }),
  dispose: vi.fn(),
}));

// 通用 fetch mock 工厂
function mockFetchOnce(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE = 'https://nas.local';
const KEY = 'k';
const PROXY = true;

describe('dockerApi', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearAllGraphqlCache();
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getDockerContainers', () => {
    it('列表返 UnraidDockerContainer[]:名字去 / 斜杠 + 状态归一', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            docker: {
              containers: [
                {
                  id: 'abc:123',
                  names: ['/nginx'],
                  image: 'nginx:1.27',
                  state: 'running',
                  status: 'Up 2 hours',
                },
                {
                  id: 'def:456',
                  names: 'redis',
                  image: 'redis:7',
                  state: 'exited',
                  status: 'Exited (0) 3 minutes ago',
                },
              ],
            },
          },
        })
      );
      const list = await getDockerContainers(BASE, KEY, PROXY);
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({
        id: 'abc:123',
        name: 'nginx',
        containerId: 'container:123',
        image: 'nginx:1.27',
        state: 'running',
        status: 'Up 2 hours',
      });
      expect(list[1].state).toBe('stopped'); // exited → stopped
    });

    it('空列表返 []', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { docker: { containers: [] } } }));
      const list = await getDockerContainers(BASE, KEY, PROXY);
      expect(list).toEqual([]);
    });

    it('失败响应返 []', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: '鉴权失败' }] }));
      const list = await getDockerContainers(BASE, KEY, PROXY);
      expect(list).toEqual([]);
    });

    it('【续 50 P2】names 为空数组 → 名归为 Unknown,不再抛 TypeError 拒掉整个列表', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            docker: {
              containers: [
                { id: 'abc:123', names: [], image: 'img', state: 'running', status: 'Up' },
              ],
            },
          },
        })
      );
      const list = await getDockerContainers(BASE, KEY, PROXY);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Unknown');
    });
  });

  // 【续 50 B1】mutation 成功后必须失效 containers cache(30min TTL),
  // 否则操作后 getDockerContainers 命中旧 cache,UI 显示旧状态
  describe('mutation 后 cache 失效(续 50 B1)', () => {
    it('startContainer 成功 → containers cache 清除,vms cache 不受影响', async () => {
      setCache(getCacheKey('containers'), { stale: true });
      setCache(getCacheKey('vms'), { stale: true });
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
      const r = await startContainer(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(true);
      expect(getCache(getCacheKey('containers'))).toBeNull();
      expect(getCache(getCacheKey('vms'))).not.toBeNull();
    });

    it('stopContainer 成功 → containers cache 清除', async () => {
      setCache(getCacheKey('containers'), { stale: true });
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
      const r = await stopContainer(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(true);
      expect(getCache(getCacheKey('containers'))).toBeNull();
    });

    it('mutation 失败 → cache 保留(不清)', async () => {
      setCache(getCacheKey('containers'), { stale: true });
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'boom' }] }));
      const r = await pauseContainer(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(false);
      expect(getCache(getCacheKey('containers'))).not.toBeNull();
    });
  });

  describe('容器动作', () => {
    it('startContainer 成功返 { success: true }', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({ data: { docker: { start: { id: 'c:1', state: 'running' } } } })
      );
      const r = await startContainer(BASE, KEY, PROXY, 'c:1');
      expect(r).toEqual({ success: true });
    });

    it('stopContainer 失败返 { success: false, error }', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'not running' }] }));
      const r = await stopContainer(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(false);
      expect(r.error).toBe('not running');
    });

    it('stopContainer 自动补 "container:" 前缀', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
      await stopContainer(BASE, KEY, PROXY, 'abc'); // 不带前缀
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.variables.id).toBe('container:abc');
    });

    it('pauseContainer 失败时 error 透传 graphql 的 message', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'Already paused' }] }));
      const r = await pauseContainer(BASE, KEY, PROXY, 'c:1');
      expect(r).toEqual({ success: false, error: 'Already paused' });
    });

    it('resumeContainer 成功', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: {} }));
      const r = await resumeContainer(BASE, KEY, PROXY, 'c:1');
      expect(r).toEqual({ success: true });
    });

    it('restartContainer:stop 失败直接返错,不调 start', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'boom' }] }));
      const r = await restartContainer(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // 没走到 start
    });

    it('restartContainer:stop 成功后等 1s 再 start', async () => {
      // fakeTimers 才能 mock setTimeout
      vi.useFakeTimers();
      fetchSpy
        .mockResolvedValueOnce(mockFetchOnce({ data: {} })) // stop
        .mockResolvedValueOnce(mockFetchOnce({ data: {} })); // start
      const p = restartContainer(BASE, KEY, PROXY, 'c:1');
      await vi.advanceTimersByTimeAsync(1000);
      const r = await p;
      expect(r.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe('getContainerLogs', () => {
    it('把 lines 数组合并成字符串,带 [timestamp] 前缀', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            docker: {
              logs: {
                lines: [
                  { timestamp: '12:00:00', message: 'hello' },
                  { timestamp: '12:00:01', message: 'world' },
                ],
              },
            },
          },
        })
      );
      const r = await getContainerLogs(BASE, KEY, PROXY, 'c:1', 100);
      expect(r.success).toBe(true);
      expect(r.logs).toBe('[12:00:00] hello\n[12:00:01] world');
    });

    it('GraphQL errors 返 { success: false, error }', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({ errors: [{ message: '权限不足' }], data: null })
      );
      const r = await getContainerLogs(BASE, KEY, PROXY, 'c:1');
      expect(r).toEqual({ success: false, error: '权限不足' });
    });

    it('无 logs 字段返 "未找到日志"', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { docker: {} } }));
      const r = await getContainerLogs(BASE, KEY, PROXY, 'c:1');
      expect(r).toEqual({ success: false, error: '未找到日志' });
    });

    it('fetch 抛错 catch 返 { success: false, error }', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('NetworkError'));
      const r = await getContainerLogs(BASE, KEY, PROXY, 'c:1');
      expect(r.success).toBe(false);
      expect(r.error).toBe('NetworkError');
    });
  });

  describe('getContainerStats(续 46.4 订阅源)', () => {
    beforeEach(() => {
      __resetStatsStreamForTest();
      __setClientFactoryForTest(fakeClientFactory as unknown as typeof createClient);
      fakeClientFactory.mockClear();
    });
    afterEach(() => {
      __resetStatsStreamForTest();
    });

    it('按 docker hash 直查(container: 前缀可去)', async () => {
      __setStatsForTest('abc123', { cpuPercent: 12.5, memPercent: 30, memUsageText: '100MiB / 1GiB' });
      const r = await getContainerStats(BASE, KEY, PROXY, 'container:abc123');
      expect(r.success).toBe(true);
      expect(r.data?.cpuPercent).toBe(12.5);
      expect(r.data?.memUsageText).toBe('100MiB / 1GiB');
    });

    it('【续 54】stats id 混有 ANSI 转义(ESC[H)也能查到(unraid-mobile-dev 实锤案例)', async () => {
      __setStatsForTest('node1:\x1b[H544d50fff', {
        cpuPercent: 0.5,
        memPercent: 0.1,
        memUsageText: '31MiB / 31.1GiB',
      });
      const r = await getContainerStats(BASE, KEY, PROXY, 'container:544d50fff');
      expect(r.success).toBe(true);
      expect(r.data?.memUsageText).toBe('31MiB / 31.1GiB');
    });

    it('按名字经 hash→name 索引查找', async () => {
      updateContainerIndex([{ id: 'container:abc123', name: 'nginx' }]);
      __setStatsForTest('abc123', { cpuPercent: 5, memPercent: 10, memUsageText: '50MiB / 1GiB' });
      const r = await getContainerStats(BASE, KEY, PROXY, 'nginx');
      expect(r.success).toBe(true);
      expect(r.data?.cpuPercent).toBe(5);
    });

    it('无数据 → 返订阅未推送提示(不再发 HTTP)', async () => {
      const r = await getContainerStats(BASE, KEY, PROXY, 'nobody');
      expect(r.success).toBe(false);
      expect(r.error).toContain('订阅');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('调用即启动订阅流,重复调用幂等', async () => {
      await getContainerStats(BASE, KEY, PROXY, 'nginx');
      await getContainerStats(BASE, KEY, PROXY, 'nginx');
      expect(fakeClientFactory).toHaveBeenCalledTimes(1);
    });

    // 【续 50 B5】可控 iterate:每次 next() 挂起,测试手动 enders[i]() 结束对应代循环,
    // 模拟真实时序"dispose 后旧循环异步退出"
    function makeControllableFactory() {
      const enders: Array<() => void> = [];
      const factory = vi.fn(() => ({
        iterate: () => ({
          [Symbol.asyncIterator]() {
            return {
              next: () =>
                new Promise<IteratorResult<unknown>>((resolve) => {
                  enders.push(() => resolve({ done: true, value: undefined }));
                }),
            };
          },
        }),
        dispose: vi.fn(),
      }));
      return { enders, factory };
    }

    it('key 变更后旧循环异步退出不清新 key(不再每次 getStats 重建 client)', async () => {
      const { enders, factory } = makeControllableFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      await getContainerStats('http://a', KEY, PROXY, 'nginx'); // start A → client 1
      await getContainerStats('http://b', KEY, PROXY, 'nginx'); // stop A + start B → client 2
      expect(factory).toHaveBeenCalledTimes(2);

      // 旧 A 循环在 dispose 后异步退出:finally 不得清掉 B 的 startedKey
      enders[0]!();
      await new Promise((r) => setTimeout(r, 0)); // 等 for-await/finally 微任务跑完

      await getContainerStats('http://b', KEY, PROXY, 'nginx'); // key 匹配 → 不新建
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('订阅循环自行结束后清掉自己的 key,允许后续重建', async () => {
      const { enders, factory } = makeControllableFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      await getContainerStats(BASE, KEY, PROXY, 'nginx'); // client 1
      enders[0]!(); // 当前代循环自行结束(无新 start)
      await new Promise((r) => setTimeout(r, 0));

      await getContainerStats(BASE, KEY, PROXY, 'nginx'); // key 已清 → 重建 client 2
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllContainerStats(续 46.4 订阅源)', () => {
    beforeEach(() => {
      __resetStatsStreamForTest();
      __setClientFactoryForTest(fakeClientFactory as unknown as typeof createClient);
    });
    afterEach(() => {
      __resetStatsStreamForTest();
    });

    it('索引翻译:以容器名为 key 输出全部 stats', async () => {
      updateContainerIndex([
        { id: 'container:abc', name: 'nginx' },
        { id: 'container:def', name: 'redis' },
      ]);
      __setStatsForTest('abc', { cpuPercent: 12.5, memPercent: 30, memUsageText: 'x' });
      __setStatsForTest('def', { cpuPercent: 1, memPercent: 2, memUsageText: 'y' });
      const r = await getAllContainerStats(BASE, KEY, PROXY);
      expect(r.success).toBe(true);
      expect(r.data).toHaveLength(2);
      expect(r.data).toEqual(
        expect.arrayContaining([
          { containerId: 'nginx', cpuPercent: 12.5, memPercent: 30 },
          { containerId: 'redis', cpuPercent: 1, memPercent: 2 },
        ])
      );
    });

    it('无索引时返空数组(订阅流刚启动)', async () => {
      const r = await getAllContainerStats(BASE, KEY, PROXY);
      expect(r.success).toBe(true);
      expect(r.data).toEqual([]);
    });
  });

  describe('getContainerDetails', () => {
    // 【续 52】返回改为映射后的 ContainerDetailInfo
    it('按名字找容器(支持数组/字符串/带斜杠),返回映射详情', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            docker: {
              containers: [
                { id: 'a', names: ['/nginx'], image: 'nginx:latest', command: 'nginx -g' },
                { id: 'b', names: 'redis' },
              ],
            },
          },
        })
      );
      const r = await getContainerDetails(BASE, KEY, PROXY, 'nginx');
      expect(r.success).toBe(true);
      expect(r.data).toMatchObject({ image: 'nginx:latest', command: 'nginx -g' });

      // 字符串 names 也行
      const r2 = await getContainerDetails(BASE, KEY, PROXY, 'redis');
      // 但 cache 命中,不再调 fetch
      expect(r2.success).toBe(true);
      expect(r2.data).toMatchObject({ image: '' });
    });

    it('【续 52】字段映射:ports/mounts/networks/size 容错 + null 保持', async () => {
      clearAllGraphqlCache();
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            docker: {
              containers: [
                {
                  id: 'a',
                  names: ['/nginx'],
                  image: 'nginx:latest',
                  status: 'Up 2 hours',
                  created: 1767225600,
                  command: 'nginx',
                  ports: [
                    { ip: null, privatePort: 80, publicPort: 3998, type: 'TCP' },
                    { ip: '0.0.0.0', privatePort: 5432, publicPort: null, type: 'TCP' },
                  ],
                  lanIpPorts: ['192.168.6.140:3998'],
                  mounts: [
                    { Type: 'bind', Source: '/mnt/user/x', Destination: '/data', RW: true },
                    { Type: 'bind', Source: '/boot', Destination: '/boot', RW: false },
                  ],
                  networkSettings: {
                    Networks: {
                      bridge: { IPAddress: '172.17.0.2', Gateway: '172.17.0.1', MacAddress: 'm' },
                    },
                  },
                  hostConfig: { networkMode: 'bridge' },
                  // BigInt scalar 可能以字符串形式返回
                  sizeRootFs: '62517714',
                  sizeRw: 11791,
                  sizeLog: null,
                  webUiUrl: 'http://192.168.6.140:3998',
                  projectUrl: null,
                  supportUrl: null,
                  isUpdateAvailable: false,
                  autoStartOrder: 10,
                  autoStartWait: null,
                },
              ],
            },
          },
        })
      );
      const r = await getContainerDetails(BASE, KEY, PROXY, 'nginx');
      expect(r.success).toBe(true);
      expect(r.data).toEqual({
        image: 'nginx:latest',
        status: 'Up 2 hours',
        created: 1767225600,
        command: 'nginx',
        ports: [
          { ip: null, privatePort: 80, publicPort: 3998, type: 'TCP' },
          { ip: '0.0.0.0', privatePort: 5432, publicPort: null, type: 'TCP' },
        ],
        lanIpPorts: ['192.168.6.140:3998'],
        mounts: [
          { type: 'bind', source: '/mnt/user/x', destination: '/data', rw: true },
          { type: 'bind', source: '/boot', destination: '/boot', rw: false },
        ],
        networks: [{ name: 'bridge', ip: '172.17.0.2', gateway: '172.17.0.1', mac: 'm' }],
        networkMode: 'bridge',
        sizeRootFs: 62517714,
        sizeRw: 11791,
        sizeLog: null,
        webUiUrl: 'http://192.168.6.140:3998',
        projectUrl: null,
        supportUrl: null,
        isUpdateAvailable: false,
        autoStartOrder: 10,
        autoStartWait: null,
      });
    });

    it('找不到返 "容器不存在"', async () => {
      clearAllGraphqlCache();
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({ data: { docker: { containers: [{ id: 'a', names: ['/nginx'] }] } } })
      );
      const r = await getContainerDetails(BASE, KEY, PROXY, 'mysql');
      expect(r).toEqual({ success: false, error: '容器不存在' });
    });
  });
});
