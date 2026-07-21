// 【阶段 P2-1 - 2026-06-16 续 13】systemApi + diskApi + networkApi + shareApi 测试
// 覆盖:字段映射 / 归一化 / 容量计算 / 共享过滤
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { getSystemInfo } from './systemApi';
import { getDisks } from './diskApi';
import { getNetworkInfo } from './networkApi';
import { getShares } from './shareApi';
import { clearAllGraphqlCache } from './cache';
import { getCpuTemp } from '../composeApi';
// 【续 57 2026-07-22】CPU 温度归 Pro:测试直接置 license 状态(pro 态才调 compose-api)
import { __setLicenseStateForTest, __resetLicenseForTest } from '../license';

// 【续 51】CPU 温度改由 compose-api 提供(systemApi 内部调用),mock 掉以便独立控制
vi.mock('../composeApi', () => ({ getCpuTemp: vi.fn() }));
const mockGetCpuTemp = vi.mocked(getCpuTemp);

function mockFetchOnce(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE = 'https://nas.local';
const KEY = 'k';
const PROXY = true;

describe('systemApi / diskApi / networkApi / shareApi', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearAllGraphqlCache();
    fetchSpy = vi.spyOn(global, 'fetch');
    // 【续 57】默认 pro 态(温度已解锁,续 51 温度用例不受影响);门控用例内置回 none
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
    // 默认:compose-api 无 CPU 传感器 → cpuTemp 回退 0
    mockGetCpuTemp.mockReset().mockResolvedValue({ celsius: null, sensor: null });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    __resetLicenseForTest();
  });

  describe('getSystemInfo', () => {
    it('字段映射:CPU / 内存 / 阵列 / uptime / cpuInfo / cpus / swap', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: {
              os: { hostname: 'tower', uptime: '2026-06-14T07:00:00Z' },
              cpu: { cores: 8, threads: 16, brand: 'AMD Ryzen' },
            },
            metrics: {
              cpu: {
                percentTotal: 35,
                cpus: [{ percentTotal: 50, percentUser: 40, percentSystem: 10, percentIdle: 50 }],
              },
              memory: {
                used: 8e9,
                total: 16e9,
                free: 8e9,
                percentTotal: 50,
                swapTotal: 4e9,
                swapUsed: 1e9,
                swapFree: 3e9,
                percentSwapTotal: 25,
              },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      const info = await getSystemInfo(BASE, KEY, PROXY);
      expect(info).toMatchObject({
        name: 'tower',
        cpu: 35,
        cpuTemp: 0,
        memory: 50,
        memoryUsage: 50,
        arrayStatus: 'STARTED',
        cpuInfo: { cores: 8, threads: 16, brand: 'AMD Ryzen' },
        cpus: [{ percentTotal: 50, percentUser: 40 }],
        swap: { total: 4e9, used: 1e9, free: 3e9, percentTotal: 25 },
      });
    });

    it('失败响应返 null', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'x' }] }));
      expect(await getSystemInfo(BASE, KEY, PROXY)).toBeNull();
    });

    it('【续 46.5】响应带 temperature.sensors 也忽略(standby 下该查询唤盘,GraphQL 永禁)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { os: { hostname: 'tower' }, cpu: { cores: 8, threads: 16, brand: 'AMD' } },
            metrics: {
              cpu: { percentTotal: 35, cpus: [] },
              memory: { used: 8e9, total: 16e9, free: 8e9, percentTotal: 50, swapTotal: 0, swapUsed: 0, swapFree: 0, percentSwapTotal: 0 },
              temperature: {
                sensors: [
                  { name: 'coretemp-isa-0000 CPU Temp', type: 'CPU_CORE', current: { value: 45 } },
                  { name: 'Samsung SSD', type: 'DISK', current: { value: 32 } },
                ],
              },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      const info = await getSystemInfo(BASE, KEY, PROXY);
      expect(info?.cpuTemp).toBe(0);
    });

    // 【续 51】温度改由 compose-api(sysfs,不唤盘)提供
    it('【续 51】compose-api 返回温度 → cpuTemp 取该值', async () => {
      mockGetCpuTemp.mockResolvedValue({ celsius: 47.0, sensor: 'coretemp/package id 0' });
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { os: { hostname: 'tower' }, cpu: { cores: 8, threads: 16, brand: 'AMD' } },
            metrics: {
              cpu: { percentTotal: 35, cpus: [] },
              memory: { used: 8e9, total: 16e9, free: 8e9, percentTotal: 50, swapTotal: 0, swapUsed: 0, swapFree: 0, percentSwapTotal: 0 },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      const info = await getSystemInfo(BASE, KEY, PROXY);
      expect(info?.cpuTemp).toBe(47.0);
    });

    it('【续 51】compose-api 失败(未装/超时) → cpuTemp 回退 0,其余字段不受影响', async () => {
      mockGetCpuTemp.mockRejectedValue(new Error('compose-api 不可达'));
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { os: { hostname: 'tower' }, cpu: { cores: 8, threads: 16, brand: 'AMD' } },
            metrics: {
              cpu: { percentTotal: 35, cpus: [] },
              memory: { used: 8e9, total: 16e9, free: 8e9, percentTotal: 50, swapTotal: 0, swapUsed: 0, swapFree: 0, percentSwapTotal: 0 },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      const info = await getSystemInfo(BASE, KEY, PROXY);
      expect(info).toMatchObject({ name: 'tower', cpu: 35, cpuTemp: 0, memory: 50 });
    });

    it('【续 57】非 Pro → 不调 compose-api 取温度,cpuTemp=0(免费版零宿主依赖)', async () => {
      __setLicenseStateForTest({ status: 'none' });
      mockGetCpuTemp.mockResolvedValue({ celsius: 47.0, sensor: 'coretemp/package id 0' });
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { os: { hostname: 'tower' }, cpu: { cores: 8, threads: 16, brand: 'AMD' } },
            metrics: {
              cpu: { percentTotal: 35, cpus: [] },
              memory: { used: 8e9, total: 16e9, free: 8e9, percentTotal: 50, swapTotal: 0, swapUsed: 0, swapFree: 0, percentSwapTotal: 0 },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      const info = await getSystemInfo(BASE, KEY, PROXY);
      expect(info?.cpuTemp).toBe(0);
      expect(mockGetCpuTemp).not.toHaveBeenCalled();
    });

    it('【续 46.5】SYSTEM_INFO_QUERY 不含 temperature 字段(防回归:任何人加回都会唤醒休眠硬盘)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { os: { hostname: 'tower' }, cpu: { cores: 8, threads: 16, brand: 'AMD' } },
            metrics: {
              cpu: { percentTotal: 35, cpus: [] },
              memory: { used: 8e9, total: 16e9, free: 8e9, percentTotal: 50, swapTotal: 0, swapUsed: 0, swapFree: 0, percentSwapTotal: 0 },
            },
            array: { state: 'STARTED' },
          },
        })
      );
      await getSystemInfo(BASE, KEY, PROXY);
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.query).not.toMatch(/temperature/);
    });
  });

  describe('getDisks', () => {
    it('parity / data / cache / boot 各种类型 + 容量 KB 转字节', async () => {
      // 【续 50 C9b】capacity 死分支已删(真实 schema 无 per-disk capacity),
      // size/used 统一走 disk.size/fsUsed(KB 转字节)
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              disks: [
                {
                  name: 'disk1',
                  type: 'Data',
                  status: 'DISK_OK',
                  size: 1000000,
                  fsUsed: 900000,
                  temp: 35,
                  numReads: 100,
                  numWrites: 50,
                },
                {
                  name: 'disk2',
                  type: 'Parity',
                  status: 'DISK_OK',
                  size: 800000,
                  temp: 36,
                  numReads: 50,
                  numWrites: 30,
                },
              ],
              caches: [{ name: 'cache', type: 'Cache', status: 'DISK_OK', size: 500000, temp: 33 }],
            },
          },
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      expect(list).toHaveLength(3);
      const d1 = list.find((d) => d.name === 'disk1')!;
      expect(d1.type).toBe('data');
      expect(d1.status).toBe('normal');
      expect(d1.size).toBe(1000000 * 1024); // disk.size 是 KB,转字节
      expect(d1.used).toBe(900000 * 1024); // fsUsed 是 KB,转字节
      expect(d1.reads).toBe(100);
      expect(d1.writes).toBe(50);

      const d2 = list.find((d) => d.name === 'disk2')!;
      expect(d2.type).toBe('parity');
      expect(d2.size).toBe(800000 * 1024); // disk.size 是 KB
      expect(d2.used).toBe(0); // 无 fsUsed → 0
    });

    it('同名 disk 不会重复添加', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              disks: [
                { name: 'disk1', type: 'Data', status: 'DISK_OK', size: 1000 },
                { name: 'disk1', type: 'Data', status: 'DISK_OK', size: 1000 }, // 重复
              ],
            },
          },
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      expect(list).toHaveLength(1);
    });
  });

  describe('getNetworkInfo', () => {
    it('【续 50 C9】按真实 schema 形状解析 info.networkInterfaces,rxSec/txSec 暂为 0', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            // mock 与 NETWORK_INFO_QUERY 一致的真实形状(unraid-api: Info.networkInterfaces)
            info: {
              networkInterfaces: [
                { name: 'eth0', status: 'up' },
                { name: 'eth1', status: 'down' },
              ],
            },
            metrics: {
              network: [{ name: 'eth0', received: 1000, sent: 500 }],
            },
          },
        })
      );
      const list = await getNetworkInfo(BASE, KEY, PROXY);
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        name: 'eth0',
        status: 'up',
        bytesReceived: 1000,
        bytesSent: 500,
        rxSec: 0,
        txSec: 0,
      });
      expect(list[1].bytesReceived).toBe(0); // eth1 无 metrics
    });

    it('【续 50 C9】请求 query 必须含 networkInterfaces(防 mock 再贴合错误实现)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { networkInterfaces: [{ name: 'eth0', status: 'up' }] },
          },
        })
      );
      const list = await getNetworkInfo(BASE, KEY, PROXY);
      expect(list).toHaveLength(1);
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.query).toMatch(/networkInterfaces/);
      // query 与解析同源:若哪天 query 改了字段名,mock 形状也必须跟着改
      expect(body.query).not.toMatch(/info\s*\{\s*network\s*\{/);
    });
  });

  describe('getShares', () => {
    it('过滤掉 disk1/disk2/disk3(裸盘)只留 user share', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            shares: [
              { name: 'appdata', size: 1000, used: 500, free: 500, comment: '' },
              { name: 'disk1', size: 0, used: 0, free: 0, comment: '' },
              { name: 'disk2', size: 0, used: 0, free: 0, comment: '' },
              { name: 'movies', size: 5000, used: 2000, free: 3000, comment: '' },
            ],
          },
        })
      );
      const list = await getShares(BASE, KEY, PROXY);
      expect(list.map((s) => s.name)).toEqual(['appdata', 'movies']);
    });

    it('失败返 []', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'x' }] }));
      expect(await getShares(BASE, KEY, PROXY)).toEqual([]);
    });
  });
});
