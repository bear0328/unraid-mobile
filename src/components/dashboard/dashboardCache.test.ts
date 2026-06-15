// 【阶段 P2-8 - 2026-06-16 续 20】dashboardCache 单元测试
// 覆盖:localStorage 读写 / 无 key 返 null / 无效 JSON 容错 / quota 错误静默
// 【续 45 2026-06-26】新增 isDashboardCacheFresh 测试 + timestamp 字段验证
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadDashboardCache,
  saveDashboardCache,
  isDashboardCacheFresh,
  DASHBOARD_CACHE_TTL,
} from './dashboardCache';
import type { DashboardCache } from './dashboardCache';

// 与 cache.ts 内部 key 保持一致(未 export,所以测试这边硬编码)
const CACHE_KEY = 'unraid-mobile-dashboard-cache';

function makeCache(overrides: Partial<DashboardCache> = {}): DashboardCache {
  return {
    systemInfo: {
      name: 'tower',
      cpu: 25,
      cpuTemp: 45,
      memory: 40,
      memoryUsage: 40,
      uptime: '5h',
      arrayStatus: 'Started',
    } as DashboardCache['systemInfo'],
    disks: [],
    networks: [],
    ...overrides,
  };
}

describe('loadDashboardCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage 无 key → 返 null', () => {
    expect(loadDashboardCache()).toBeNull();
  });

  it('localStorage 有 key → parse JSON 返 DashboardCache', () => {
    const cache = makeCache();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    const loaded = loadDashboardCache();
    expect(loaded).not.toBeNull();
    expect(loaded?.systemInfo?.name).toBe('tower');
    expect(loaded?.disks).toEqual([]);
    expect(loaded?.networks).toEqual([]);
  });

  it('localStorage 值是非法 JSON → catch 返 null(不抛)', () => {
    localStorage.setItem(CACHE_KEY, '{not valid json');
    expect(() => loadDashboardCache()).not.toThrow();
    expect(loadDashboardCache()).toBeNull();
  });

  it('localStorage.getItem 抛错 → catch 返 null', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    expect(loadDashboardCache()).toBeNull();
  });
});

describe('saveDashboardCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('写入 localStorage(JSON 序列化)', () => {
    const cache = makeCache();
    saveDashboardCache(cache);
    const raw = localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.systemInfo.name).toBe('tower');
    // 【续 45 2026-06-26】续 45 起写入带 timestamp
    expect(typeof parsed.timestamp).toBe('number');
    expect(parsed.timestamp).toBeGreaterThan(Date.now() - 1000);
  });

  it('localStorage.setItem 抛 quota 错误 → 静默不抛', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveDashboardCache(makeCache())).not.toThrow();
  });

  it('写入后 loadDashboardCache 读回一致', () => {
    const cache = makeCache({
      disks: [{ name: 'disk1' } as DashboardCache['disks'][0]],
      networks: [{ name: 'br0' } as DashboardCache['networks'][0]],
    });
    saveDashboardCache(cache);
    const loaded = loadDashboardCache();
    expect(loaded?.disks[0]?.name).toBe('disk1');
    expect(loaded?.networks[0]?.name).toBe('br0');
  });
});

// 【续 45 2026-06-26】isDashboardCacheFresh:用于 usePolling skipInitialIf
describe('isDashboardCacheFresh', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('cache 为 null → 不 fresh', () => {
    expect(isDashboardCacheFresh(null)).toBe(false);
  });

  it('localStorage 无 key → 不 fresh', () => {
    expect(isDashboardCacheFresh(makeCache())).toBe(false);
  });

  it('cache 写入后立即 fresh(默认 5min TTL)', () => {
    saveDashboardCache(makeCache());
    expect(isDashboardCacheFresh(loadDashboardCache())).toBe(true);
  });

  it('cache timestamp 过期 → 不 fresh', () => {
    // 写入 timestamp = now - TTL - 1ms 的 cache
    const staleTs = Date.now() - DASHBOARD_CACHE_TTL - 1;
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...makeCache(), timestamp: staleTs })
    );
    expect(isDashboardCacheFresh(loadDashboardCache())).toBe(false);
  });

  it('cache 无 timestamp 字段 → 不 fresh(老数据兼容)', () => {
    // 续 45 之前写入的 cache 没 timestamp 字段
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeCache()));
    expect(isDashboardCacheFresh(loadDashboardCache())).toBe(false);
  });

  it('支持自定义 TTL', () => {
    const ts = Date.now() - 5000;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...makeCache(), timestamp: ts }));
    // 5s 前的 cache,TTL=10s → fresh
    expect(isDashboardCacheFresh(loadDashboardCache(), 10_000)).toBe(true);
    // 5s 前的 cache,TTL=1000ms → 不 fresh
    expect(isDashboardCacheFresh(loadDashboardCache(), 1000)).toBe(false);
  });
});
