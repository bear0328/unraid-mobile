// 【阶段 1 P0 - 2026-06-15】Dashboard cache 工具
// 从 Dashboard.tsx 拆出，纯 localStorage 读写
// 【续 45 2026-06-26】加 timestamp 字段 + fresh 判定:刷新页面时若 cache < TTL 则跳过 mount fetch
import { UnraidSystemInfo, UnraidDisk, UnraidNetworkInfo } from '../../services';

const DASHBOARD_CACHE_KEY = 'unraid-mobile-dashboard-cache';
// 【续 45 2026-06-26】TTL:60s 内复用 cache,避免刷新页面立即拉 getDisks 唤醒 array
// 【续 45.4 2026-06-28】TTL:60s → 300s(5min),与 graphql CACHE_TTL 同步
export const DASHBOARD_CACHE_TTL = 300_000;

export type DashboardCache = {
  systemInfo: UnraidSystemInfo | null;
  disks: UnraidDisk[];
  networks: UnraidNetworkInfo[];
};

/** 【续 45 2026-06-26】带 timestamp 的 cache 形状(写入时使用,旧数据兼容) */
interface DashboardCacheWithTs extends DashboardCache {
  timestamp?: number;
  /** 【续 45.8 2026-07-04】磁盘数据独立 timestamp — 头部🔄不刷磁盘时,这个不更新 */
  disksTimestamp?: number;
}

export function loadDashboardCache(): DashboardCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DashboardCache;
  } catch {
    return null;
  }
}

/**
 * 【续 45.7 2026-07-01】读 dashboard cache 的 timestamp (ms since epoch)。
 * - 无 cache / 损坏 / 缺 timestamp 字段 → 返 null
 * - 给 staleness UI (StaleBadge) 用
 */
export function getDashboardCacheTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCacheWithTs;
    if (typeof parsed.timestamp !== 'number') return null;
    return parsed.timestamp;
  } catch {
    return null;
  }
}

/**
 * 【续 45.8 2026-07-04】读磁盘数据的独立 timestamp。
 * 头部 🔄 刷新不拉 disks 时,这个值不更新 → DiskCard StaleBadge 正确显示"陈旧"。
 * - 无 cache / 损坏 / 缺 disksTimestamp 字段 → 回退到主 timestamp(兼容旧 cache)
 */
export function getDisksCacheTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCacheWithTs;
    if (typeof parsed.disksTimestamp === 'number') return parsed.disksTimestamp;
    // 兼容旧 cache:回退到主 timestamp
    if (typeof parsed.timestamp === 'number') return parsed.timestamp;
    return null;
  } catch {
    return null;
  }
}

/** 【续 45 2026-06-26】判断 cache 是否在 TTL 内(用于 skipInitialIf) */
export function isDashboardCacheFresh(cache: DashboardCache | null, ttlMs: number = DASHBOARD_CACHE_TTL): boolean {
  if (!cache) return false;
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DashboardCacheWithTs;
    if (typeof parsed.timestamp !== 'number') return false;
    return Date.now() - parsed.timestamp < ttlMs;
  } catch {
    return false;
  }
}

/**
 * 【续 45.8 2026-07-04】写 cache。
 * @param data dashboard 数据
 * @param disksUpdated 本次是否真拉了 disks(getDisks)。false 时沿用旧 disksTimestamp。
 */
export function saveDashboardCache(data: DashboardCache, disksUpdated: boolean = true): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    // 读旧 cache 拿 disksTimestamp(没拉 disks 时沿用)
    let prevDisksTs: number | undefined;
    if (!disksUpdated) {
      const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (raw) {
        const prev = JSON.parse(raw) as DashboardCacheWithTs;
        prevDisksTs = prev.disksTimestamp ?? prev.timestamp;
      }
    }
    const payload: DashboardCacheWithTs = {
      ...data,
      timestamp: now,
      disksTimestamp: disksUpdated ? now : prevDisksTs ?? now,
    };
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}
