// 【续 91 D/G】parityApi + upsApi 测试
// 覆盖:正常归一化 / schema 校验失败降级 null / 请求失败返 null / 无 UPS 返 null
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { getParityCheckStatus } from './parityApi';
import { getUpsDevices } from './upsApi';
import { clearAllGraphqlCache, getCache, getCacheKey } from './cache';

function mockFetchOnce(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE = 'https://nas.local';
const KEY = 'k';
const PROXY = true;

describe('parityApi / upsApi', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearAllGraphqlCache();
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getParityCheckStatus', () => {
    it('正常解析:running 态全字段归一化', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              state: 'STARTED',
              parityCheckStatus: {
                status: 'RUNNING',
                running: true,
                paused: false,
                progress: 45,
                speed: '120 MB/s',
                errors: 2,
                date: '2026-08-09T01:00:00Z',
                duration: 3600,
                correcting: true,
              },
            },
          },
        })
      );
      const s = await getParityCheckStatus(BASE, KEY, PROXY);
      expect(s).toEqual({
        arrayState: 'STARTED',
        status: 'RUNNING',
        running: true,
        paused: false,
        correcting: true,
        progress: 45,
        speed: '120 MB/s',
        errors: 2,
        date: '2026-08-09T01:00:00Z',
        duration: 3600,
      });
    });

    it('NEVER_RUN 态:null 字段归一化(errors null 保留,progress 0)', async () => {
      // 2026-08-09 目标机实测形状:running/paused/errors/date/duration 全 null
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              state: 'STARTED',
              parityCheckStatus: {
                status: 'NEVER_RUN',
                running: null,
                paused: null,
                progress: 0,
                speed: '0',
                errors: null,
                date: null,
                duration: null,
                correcting: null,
              },
            },
          },
        })
      );
      const s = await getParityCheckStatus(BASE, KEY, PROXY);
      expect(s).toMatchObject({
        status: 'NEVER_RUN',
        running: false,
        paused: false,
        correcting: false,
        progress: 0,
        errors: null,
        date: null,
        duration: null,
      });
    });

    it('schema 校验失败(老版本无 parityCheckStatus)→ 降级 null,不重试', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          errors: [{ message: 'Cannot query field "parityCheckStatus" on type "Array".' }],
        })
      );
      expect(await getParityCheckStatus(BASE, KEY, PROXY)).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('请求失败 → 返 null(ParityCard 整卡不渲染)', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ errors: [{ message: 'boom' }] }));
      expect(await getParityCheckStatus(BASE, KEY, PROXY)).toBeNull();
    });

    it('成功结果写 namespace parity 缓存(tick 失效前 0 请求)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            array: {
              state: 'STARTED',
              parityCheckStatus: { status: 'NEVER_RUN', progress: 0, speed: '0' },
            },
          },
        })
      );
      await getParityCheckStatus(BASE, KEY, PROXY);
      expect(getCache(getCacheKey('parity'))).not.toBeNull();
      // 第二次命中缓存,不再发请求
      const s = await getParityCheckStatus(BASE, KEY, PROXY);
      expect(s?.status).toBe('NEVER_RUN');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUpsDevices', () => {
    const UPS = {
      id: 'ups1',
      name: 'UPS',
      model: 'APC Back-UPS Pro 1500',
      status: 'OL',
      battery: { chargeLevel: 100, estimatedRuntime: 45, health: 'OK' },
      power: {
        inputVoltage: 230.0,
        outputVoltage: 230.0,
        loadPercentage: 12,
        nominalPower: 865,
        currentPower: 105.5,
      },
    };

    it('正常解析:battery/power 子字段归一化', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { upsDevices: [UPS] } }));
      const list = await getUpsDevices(BASE, KEY, PROXY);
      expect(list).toHaveLength(1);
      expect(list![0]).toEqual({
        id: 'ups1',
        name: 'UPS',
        model: 'APC Back-UPS Pro 1500',
        status: 'OL',
        battery: { chargeLevel: 100, estimatedRuntime: 45, health: 'OK' },
        power: {
          inputVoltage: 230.0,
          outputVoltage: 230.0,
          loadPercentage: 12,
          nominalPower: 865,
          currentPower: 105.5,
        },
      });
    });

    it('nominalPower/currentPower 缺省(schema 可空)→ null 保留', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          data: {
            upsDevices: [
              {
                ...UPS,
                power: { ...UPS.power, nominalPower: null, currentPower: null },
              },
            ],
          },
        })
      );
      const list = await getUpsDevices(BASE, KEY, PROXY);
      expect(list![0].power.nominalPower).toBeNull();
      expect(list![0].power.currentPower).toBeNull();
    });

    it('无 UPS(目标机现状:INTERNAL_SERVER_ERROR)→ 返 null', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchOnce({
          errors: [{ message: 'No UPS data returned from apcaccess' }],
        })
      );
      expect(await getUpsDevices(BASE, KEY, PROXY)).toBeNull();
    });

    it('成功但空列表(真无设备)→ 返 null(UpsCard 不渲染)', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchOnce({ data: { upsDevices: [] } }));
      expect(await getUpsDevices(BASE, KEY, PROXY)).toBeNull();
    });
  });
});
