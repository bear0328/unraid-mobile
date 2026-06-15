// 【续 39-1 候选 - 2026-06-18】启动期 API 健康自检
// 【续 42 2026-06-18】升级到 4 端点并发检查(/healthz + /graphql + /config + /files)
// 【续 45 2026-06-26】加 HealthReport localStorage cache:命中 cache 时直接用,不发 4 端点 ping
// 关键意义:/files/ 走 nginx autoindex 列出 /mnt/user 根,shfs 会按需 mount 涉及 disk ——
// 每次刷新页面 = 必唤 array。加 cache 后,TTL 内刷新零 ping,彻底根治"刷新唤盘"。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiConfig } from './useUnraidApi';
import { checkHealth, type HealthReport } from '../services';

export type ApiHealthStatus = 'idle' | 'checking' | 'healthy' | 'unhealthy';

export interface UseApiHealthResult {
  status: ApiHealthStatus;
  /** 最近一次 checkHealth 结果(undefined 表示还没跑过) */
  report: HealthReport | null;
  /** 手动重检 */
  recheck: () => Promise<void>;
  /** 是否已配置(serverUrl+apiKey 都在) */
  isConfigured: boolean;
}

// 【续 45 2026-06-26】HealthReport cache 配置
// TTL:60s 内刷新页面 → 直接用 cache,不发任何 ping(包括最重的 /files/)
// 【续 45.4 2026-06-28】TTL:60s → 300s(5min),与 graphql CACHE_TTL 同步
// 【续 45.6 2026-06-30】TTL:5min → 30min(1800s):
// - /files/ nginx autoindex 走 shfs mount array → 5min 续期必唤盘
// - 延长到 30min 后跟 graphql CACHE_TTL 同步,30min 临界点才触发续期
const HEALTH_CACHE_KEY = 'unraid-mobile-health-cache';
const HEALTH_CACHE_TTL = 1_800_000; // 30 分钟

interface HealthCacheEntry {
  report: HealthReport;
  expiresAt: number;
}

function readHealthCache(): HealthCacheEntry | null {
  try {
    const raw = localStorage.getItem(HEALTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HealthCacheEntry;
    if (typeof parsed.expiresAt !== 'number' || typeof parsed.report !== 'object') return null;
    if (Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHealthCache(report: HealthReport, ttlMs: number = HEALTH_CACHE_TTL): void {
  try {
    localStorage.setItem(
      HEALTH_CACHE_KEY,
      JSON.stringify({ report, expiresAt: Date.now() + ttlMs })
    );
  } catch {
    /* localStorage 满或不可用,忽略 */
  }
}

export function useApiHealth(): UseApiHealthResult {
  const { config, isConfigured } = useApiConfig();
  // 【续 45 2026-06-26】初始化时检查 cache:命中 → 直接 healthy,无 network
  // 【续 50 H14】initialCache 只在挂载时评估一次(useRef):原来每次 render 重算,
  // 重检失败清掉陈旧 cache 后 initialCache 翻转成 null,mount effect 会多补一次 checkHealth
  const initialCacheRef = useRef<HealthCacheEntry | null | undefined>(undefined);
  if (initialCacheRef.current === undefined) {
    initialCacheRef.current = typeof window !== 'undefined' ? readHealthCache() : null;
  }
  const initialCache = initialCacheRef.current;
  const [status, setStatus] = useState<ApiHealthStatus>(
    initialCache ? 'healthy' : 'idle'
  );
  const [report, setReport] = useState<HealthReport | null>(initialCache?.report ?? null);
  // 防并发起多个 check(StrictMode 双调用 + 用户狂点 recheck)
  const inFlightRef = useRef(false);

  const run = useCallback(async () => {
    if (!config || !config.serverUrl || !config.apiKey) {
      setStatus('idle');
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('checking');
    try {
      const r = await checkHealth(config.serverUrl, config.apiKey, true);
      setReport(r);
      setStatus(r.ok ? 'healthy' : 'unhealthy');
      // 【续 45 2026-06-26】写 cache:成功的 report 留 60s
      if (r.ok) {
        writeHealthCache(r);
      } else {
        // 【续 50 H14】失败时清掉陈旧 healthy cache:否则 30min TTL 内刷新页面
        // 仍按 cache 显示 healthy,断网永远不进诊断屏
        try {
          localStorage.removeItem(HEALTH_CACHE_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setReport({
        ok: false,
        endpoints: {
          healthz: { ok: false, latencyMs: 0, error: 'unknown' },
          graphql: { ok: false, latencyMs: 0, error: 'unknown' },
          config: { ok: false, latencyMs: 0, error: 'unknown' },
          files: { ok: false, latencyMs: 0, error: 'unknown' },
        },
        startedAt: Date.now(),
        durationMs: 0,
      });
      setStatus('unhealthy');
      // 健康检查整体抛错(应该是 graphqlRequest 外层 catch),正常情况每个端点独立 try/catch
      console.error('[useApiHealth] checkHealth threw:', e);
    } finally {
      inFlightRef.current = false;
    }
  }, [config]);

  // 配置就绪后自动跑一次
  useEffect(() => {
    if (!isConfigured) {
      setStatus('idle');
      setReport(null);
      return;
    }
    // 【续 45 2026-06-26】cache 命中 → 不 fire checkHealth,直接用 cache(无 /files/ 等 ping)
    if (initialCache) return;
    run();
  }, [isConfigured, run, initialCache]);

  // 【续 50 H14】graphql 网络层失败(断网/超时)→ 重新体检(节流 15s,防连续失败请求轰炸)。
  // recheck 失败 → unhealthy → AppReadyGate 切 4 端点诊断屏;成功则一切照旧。
  const lastNetRecheckRef = useRef(0);
  useEffect(() => {
    const onNetError = () => {
      if (!isConfigured) return;
      const now = Date.now();
      if (now - lastNetRecheckRef.current < 15_000) return;
      lastNetRecheckRef.current = now;
      run();
    };
    window.addEventListener('unraid-network-error', onNetError);
    return () => window.removeEventListener('unraid-network-error', onNetError);
  }, [isConfigured, run]);

  return useMemo(
    () => ({ status, report, recheck: run, isConfigured }),
    [status, report, run, isConfigured]
  );
}
