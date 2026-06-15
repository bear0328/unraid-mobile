// 【阶段 P2-优化 - 2026-06-17 续 39-2】useResource
// 替代 Dashboard/Containers/Logs/Debug 等 4+ 处 useState + useEffect + loading/error/data 反模式
// 自动 mount 时 fetch + 可手动 refresh
// fetcher 引用变化时自动重 fetch
import { useCallback, useEffect, useRef, useState } from 'react';
import { reportError } from '../utils/errorReporter';

export interface UseResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

interface UseResourceOptions {
  /** 立即 fetch(默认 true);设 false 用于"按需加载"场景 */
  immediate?: boolean;
  /** deps 变化时自动重 fetch(默认 [fetcher]) */
  deps?: ReadonlyArray<unknown>;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  opts: UseResourceOptions = {}
): UseResourceResult<T> {
  const { immediate = true, deps = [fetcher] } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  // ref 持有最新 fetcher,避免 deps 重建导致重复 fetch
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    if (cancelledRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (cancelledRef.current) return;
      setData(result);
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      reportError(
        e instanceof Error ? e : new Error(String(e)),
        'manual',
        'useResource fetch failed'
      );
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    cancelledRef.current = false;
    run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh: run, setData };
}
