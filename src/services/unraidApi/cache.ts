// 【2026-06-14 性能优化 A】GraphQL 缓存
// 重复访问场景：cache 命中 → 0ms 返回，Dashboard 感知 < 1 秒
// 首次访问（无 cache）：仍走真实 fetch（unraid-api 冷启动 4-5s，物理限制）
// 【续 45 2026-06-26】TTL = 30s → 60s:与 usePolling shouldSkipTick 配合,
// 在 60s 窗口内 polling tick 全部命中 cache → 0 网络请求,刷新页面不唤醒 array
// 【续 45.4 2026-06-28】TTL = 60s → 300s(5min):进一步减少 getDisks 的 statfs
// 唤盘频率。getDisks 的 statfs /mnt/disk* 是 cache_dirs 缓存不了的(读超级块非 dentry),
// 只能靠延长 cache TTL 减少频率。5min 内刷新 0 graphql,5min 后 1 次。
// 【续 45.6 2026-06-30】TTL = 5min → 30min:Hermes 5min 监控实测发现 5min 临界点
// 必触发 getDisks statfs → 唤醒 sdd + sde(2 个 array 盘)。延长到 30min 让"刷新页面
// 不唤盘"覆盖完整使用周期(用户日常 5-30min 看一次),频率降 6x,30min 临界点才唤盘。
// 数据 stale 30min 内由 Dashboard staleness 提示告知用户(后续章节加)。
const CACHE_PREFIX = 'unraid-mobile-gql-';
export const CACHE_TTL = 1_800_000; // 30 分钟

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function getCacheKey(namespace: string): string {
  return CACHE_PREFIX + namespace;
}

export function getCache<T>(key: string): CacheEntry<T> | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CacheEntry<T>;
    if (typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // localStorage 满了（5-10MB 限制）或不可用，忽略
  }
}

/**
 * 【续 50 B1】mutation 成功后失效指定 namespace 的 30min cache。
 * 否则操作(启停/重启)后 getDockerContainers/getVMs 仍命中旧 cache,
 * UI 最长 30 分钟显示旧状态,useWaitForState 轮询也全命中旧 cache。
 */
export function invalidateNamespace(namespace: string): void {
  try {
    localStorage.removeItem(getCacheKey(namespace));
  } catch {
    // localStorage 不可用,忽略
  }
}

export function clearAllGraphqlCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    });
  } catch {
    // 忽略
  }
}

/**
 * 【续 45.7 2026-07-01】计算指定 namespace 的 cache 年龄(ms)。
 * 用于 staleness UI 提示:返回 `Date.now() - cache.timestamp`。
 * - cache miss (无 key / 过期 / 损坏) → 返 null,UI 不显示 staleness
 * - cache hit → 返 (now - timestamp) ms,UI 决定 threshold 渲染
 */
export function cacheAgeMs(namespace: string): number | null {
  const c = getCache<unknown>(getCacheKey(namespace));
  return c ? Date.now() - c.timestamp : null;
}
