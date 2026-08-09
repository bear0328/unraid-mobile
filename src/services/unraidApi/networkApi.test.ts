// 【续 88 2026-08-08】networkApi 速率差分采样测试
// 覆盖:①同服务器两轮采样出速率 ②切服务器后 prev 采样重置,
// 不拿两台机器的累积计数器差分(修复前首轮必出虚假尖峰)
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { getNetworkInfo } from './networkApi';

const KEY = 'k';
const PROXY = true;

// 构造 NETWORK_INFO_QUERY 响应:info.networkInterfaces + metrics.network(累积字节)
function netResponse(rx: number, tx: number) {
  return new Response(
    JSON.stringify({
      data: {
        info: { networkInterfaces: [{ name: 'eth0', status: 'up' }] },
        metrics: { network: [{ name: 'eth0', bytesReceived: String(rx), bytesSent: String(tx) }] },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('getNetworkInfo 速率差分(续 88)', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  // 可控时钟:两次采样间隔固定 1s(dt>0),速率断言确定不 flake
  let now: number;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('同一服务器:首轮速率 0,第二轮按 delta/dt 出速率', async () => {
    const BASE = 'http://nas-a';
    fetchSpy.mockResolvedValueOnce(netResponse(1000, 2000));
    const r1 = (await getNetworkInfo(BASE, KEY, PROXY))!;
    expect(r1[0]).toMatchObject({ name: 'eth0', rxSec: 0, txSec: 0 });

    now += 1000; // 1s 后第二采样
    fetchSpy.mockResolvedValueOnce(netResponse(5000, 8000));
    const r2 = (await getNetworkInfo(BASE, KEY, PROXY))!;
    expect(r2[0].rxSec).toBe(4000); // (5000-1000)/1s
    expect(r2[0].txSec).toBe(6000);
  });

  it('【续 91 M3】dt < 1s(交叠刷新)→ 不算速率返 0(防 dt≈0 尖峰)', async () => {
    const BASE = 'http://nas-dt';
    fetchSpy.mockResolvedValueOnce(netResponse(1000, 1000));
    await getNetworkInfo(BASE, KEY, PROXY);

    now += 200; // 0.2s 后就来了第二轮(交叠/连点),delta 正常但 dt 太小
    fetchSpy.mockResolvedValueOnce(netResponse(5000, 8000));
    const r = (await getNetworkInfo(BASE, KEY, PROXY))!;
    expect(r[0].rxSec).toBe(0); // 修复前:(5000-1000)/0.2 = 20000 尖峰
    expect(r[0].txSec).toBe(0);

    now += 1000; // 再过 1s 恢复正常差分
    fetchSpy.mockResolvedValueOnce(netResponse(9000, 12000));
    const r2 = (await getNetworkInfo(BASE, KEY, PROXY))!;
    expect(r2[0].rxSec).toBe(4000);
  });

  it('【续 91 A1】请求失败 → 返 null(区别于真空 [],调用方保留旧网卡数据)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(await getNetworkInfo('http://nas-fail', KEY, PROXY)).toBeNull();
  });

  it('切服务器:prev 采样重置,首轮速率归 0(不出跨机差分尖峰)', async () => {
    const BASE_A = 'http://nas-a2';
    const BASE_B = 'http://nas-b2';
    // 服务器 A 采样(小计数器)
    fetchSpy.mockResolvedValueOnce(netResponse(1000, 1000));
    await getNetworkInfo(BASE_A, KEY, PROXY);

    // 切到服务器 B:计数器比 A 大几个数量级。
    // 修复前:拿 B 的计数器减 A 的 prev → rxSec 巨大(虚假尖峰)
    // 修复后:serverUrl 变了 prev 作废 → 首轮速率 0
    now += 1000;
    fetchSpy.mockResolvedValueOnce(netResponse(9_000_000_000, 9_000_000_000));
    const r = (await getNetworkInfo(BASE_B, KEY, PROXY))!;
    expect(r[0].rxSec).toBe(0);
    expect(r[0].txSec).toBe(0);

    // B 的第二轮恢复差分
    now += 1000;
    fetchSpy.mockResolvedValueOnce(netResponse(9_000_010_000, 9_000_010_000));
    const r2 = (await getNetworkInfo(BASE_B, KEY, PROXY))!;
    expect(r2[0].rxSec).toBe(10_000);
  });

  it('切回旧服务器:prev 已被覆盖,同样从 0 重新采样', async () => {
    const BASE_A = 'http://nas-a3';
    const BASE_B = 'http://nas-b3';
    fetchSpy.mockResolvedValueOnce(netResponse(1000, 1000));
    await getNetworkInfo(BASE_A, KEY, PROXY);
    now += 1000;
    fetchSpy.mockResolvedValueOnce(netResponse(5000, 5000));
    await getNetworkInfo(BASE_B, KEY, PROXY);
    // 切回 A:计数器与 B 的 prev 无关 → 速率 0
    now += 1000;
    fetchSpy.mockResolvedValueOnce(netResponse(2000, 2000));
    const r = (await getNetworkInfo(BASE_A, KEY, PROXY))!;
    expect(r[0].rxSec).toBe(0);
  });
});
