// 【阶段 P2-1 - 2026-06-16 续 13】systemApi + diskApi + networkApi + shareApi 测试
// 覆盖:字段映射 / 归一化 / 容量计算 / 共享过滤
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { getSystemInfo } from './systemApi';
import { getDisks, getSpinStatus } from './diskApi';
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
    it('parity / data / cache / boot 各种类型 + 容量单位换算', async () => {
      // 【续 89】unraid-api 单位分裂:size=KiB(1024),fs*=十进制 kB(1000);
      // 优先 fs 口径,fsSize 缺时回退 disk.size(KiB),used=fsUsed×1000
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
      expect(d1.size).toBe(1000000 * 1024); // 无 fsSize → 回退 disk.size(KiB 转字节)
      expect(d1.used).toBe(900000 * 1000); // fsUsed 是十进制 kB,×1000 转字节
      expect(d1.reads).toBe(100);
      expect(d1.writes).toBe(50);

      const d2 = list.find((d) => d.name === 'disk2')!;
      expect(d2.type).toBe('parity');
      expect(d2.size).toBe(800000 * 1024); // disk.size 是 KiB
      expect(d2.used).toBe(0); // 无 fsUsed → 0
    });

    it('【续 89】fsSize 优先:fs 口径(十进制 kB)与 df/webGui 一致', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              disks: [
                {
                  name: 'disk1',
                  type: 'Data',
                  status: 'DISK_OK',
                  size: 3907018584, // KiB 设备容量
                  fsSize: 4000762032, // 十进制 kB 文件系统容量
                  fsUsed: 2272663820, // 十进制 kB
                  fsFree: 1728098212,
                },
              ],
            },
          },
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      const d1 = list[0];
      expect(d1.size).toBe(4000762032 * 1000); // 优先 fsSize,不取 size×1024
      expect(d1.used).toBe(2272663820 * 1000);
    });

    it('【续 89】专属启动池过滤:caches 中与 boot 同设备的条目跳过', async () => {
      // unRAID 7.3 专属启动池(bootPool="dedicated"):caches 多出与 flash 同设备的
      // 'boot' 池(size/fs 数值无意义),与 array.boot 的真实 flash 重复 → 去重
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              caches: [
                { name: 'boot', device: 'nvme1n1', status: 'DISK_OK', size: 1004, fsSize: 0, fsUsed: 0 },
                { name: 'cache', device: 'nvme0n1', status: 'DISK_OK', size: 2000397656, fsSize: 2048407200, fsUsed: 414690603 },
              ],
              boot: { name: 'flash', device: 'nvme1n1', status: 'DISK_OK', size: 14064640, fsSize: 12998337, fsUsed: 1634107 },
            },
          },
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      expect(list.map((d) => d.name)).toEqual(['cache', 'flash']);
      expect(list.find((d) => d.name === 'flash')!.type).toBe('boot');
      expect(list.find((d) => d.name === 'cache')!.size).toBe(2048407200 * 1000);
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

    it('【续 67】isSpinning 校验失败(unraid-api<4.20)→ 降级重试不含该字段的查询', async () => {
      // 第一次:老版本 schema 无 isSpinning → GraphQL 校验错误
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          errors: [{ message: 'Cannot query field "isSpinning" on type "ArrayDisk".' }],
        })
      );
      // 第二次:降级查询(无 isSpinning)成功
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              disks: [{ name: 'disk1', type: 'Data', status: 'DISK_OK', size: 1000 }],
            },
          },
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
      expect(retryBody.query).not.toMatch(/isSpinning/);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('disk1');
      expect(list[0].isSpinning).toBeUndefined(); // 降级路径无休眠数据
    });

    it('【续 67】非校验类错误(如鉴权失败)不触发降级重试', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          errors: [
            { message: 'Invalid API key', extensions: { code: 'UNAUTHENTICATED' } },
          ],
        })
      );
      const list = await getDisks(BASE, KEY, PROXY);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // 不重试
      expect(list).toHaveLength(0);
    });
  });

  describe('getSpinStatus', () => {
    it('【续 66】解析 disks+caches 的 isSpinning → name Map', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              disks: [
                { name: 'disk1', isSpinning: false },
                { name: 'disk2', isSpinning: true },
              ],
              caches: [{ name: 'cache', isSpinning: true }],
            },
          },
        })
      );
      const map = await getSpinStatus(BASE, KEY, PROXY);
      expect(map.get('disk1')).toBe(false);
      expect(map.get('disk2')).toBe(true);
      expect(map.get('cache')).toBe(true);
      expect(map.size).toBe(3);
    });

    it('【续 66】失败/空响应 → 空 Map,不抛错阻塞 dashboard', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { array: {} } }));
      const map = await getSpinStatus(BASE, KEY, PROXY);
      expect(map.size).toBe(0);
    });
  });

  describe('getNetworkInfo', () => {
    it('【续 50 C9】按真实 schema 形状解析 info.networkInterfaces + metrics.network 累积字节', async () => {
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
              // BigInt 在 JSON 里是字符串
              network: [{ name: 'eth0', bytesReceived: '1000', bytesSent: '500' }],
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
        rxSec: 0, // 首次采样无差分基准
        txSec: 0,
      });
      expect(list[1].bytesReceived).toBe(0); // eth1 无 metrics
    });

    it('【续 66】速率差分:两次采样的累积字节 delta/dt → rxSec/txSec', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      try {
        nowSpy.mockReturnValue(10_000);
        fetchSpy.mockResolvedValueOnce(
          mockFetchOnce({
            data: {
              info: { networkInterfaces: [{ name: 'eth0', status: 'up' }] },
              metrics: { network: [{ name: 'eth0', bytesReceived: '1000', bytesSent: '500' }] },
            },
          })
        );
        await getNetworkInfo(BASE, KEY, PROXY);

        nowSpy.mockReturnValue(12_000); // +2s
        fetchSpy.mockResolvedValueOnce(
          mockFetchOnce({
            data: {
              info: { networkInterfaces: [{ name: 'eth0', status: 'up' }] },
              metrics: { network: [{ name: 'eth0', bytesReceived: '3000', bytesSent: '700' }] },
            },
          })
        );
        const list = await getNetworkInfo(BASE, KEY, PROXY);
        expect(list[0].rxSec).toBe(1000); // (3000-1000)/2s
        expect(list[0].txSec).toBe(100); // (700-500)/2s
      } finally {
        nowSpy.mockRestore();
      }
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

    it('【续 67】metrics.network 校验失败 → 降级重试只查 networkInterfaces,速率归零', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          errors: [{ message: 'Cannot query field "network" on type "Metrics".' }],
        })
      );
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            info: { networkInterfaces: [{ name: 'eth0', status: 'up' }] },
          },
        })
      );
      const list = await getNetworkInfo(BASE, KEY, PROXY);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
      expect(retryBody.query).not.toMatch(/metrics/);
      expect(retryBody.query).toMatch(/networkInterfaces/);
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        name: 'eth0',
        status: 'up',
        bytesReceived: 0,
        bytesSent: 0,
        rxSec: 0,
        txSec: 0,
      });
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
