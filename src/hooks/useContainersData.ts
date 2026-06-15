import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from './usePolling';
import { usePollInterval } from './usePollInterval';
import { UnraidApiService, UnraidDockerContainer, UnraidVM } from '../services';
import { getCache, getCacheKey } from '../services/unraidApi/cache';

/**
 * 【续 45 2026-06-26】判断 graphql namespace cache 是否新鲜
 * 用于 usePolling skipInitialIf —— 命中 cache 时跳过 mount 立即 fire,
 * 避免刷新页面时 fetch getDockerContainers/getVMs 唤醒 cgroup/docker 跨 disk IO。
 * 注:getCache 内部已校验 TTL,返回非 null 即新鲜
 */
function isNamespaceCacheFresh(namespace: string): boolean {
  return getCache<unknown>(getCacheKey(namespace)) !== null;
}

export function useContainersData(api: UnraidApiService | null, enabled: boolean) {
  const [containers, setContainers] = useState<UnraidDockerContainer[]>([]);
  const [vms, setVMs] = useState<UnraidVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containersRef = useRef(containers);
  const vmsRef = useRef(vms);

  useEffect(() => {
    containersRef.current = containers;
  }, [containers]);

  useEffect(() => {
    vmsRef.current = vms;
  }, [vms]);

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false);
      return;
    }

    try {
      const [containerData, vmData] = await Promise.all([api.getDockerContainers(), api.getVMs()]);
      setContainers(containerData);
      setVMs(vmData);
      setError(null);
      setHasFetched(true);
    } catch (err) {
      console.error('Failed to fetch containers/vms:', err);
      setError('无法连接到 unRAID 服务器');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const pollInterval = usePollInterval();
  usePolling(
    async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      if (!hasFetched) {
        setLoading(true);
      }
      await refresh();
    },
    pollInterval,
    enabled,
    {
      // 【续 45.4 2026-06-28】移除 skipInitialIf —— mount 必须跑一次填充 state,
      // 否则 warm cache 时 loading=true 永远不被设 false,页面永远"加载中..."
      // mount 时 graphql 层 namespace cache 命中 = 0ms 返回,0 网络请求,只做 state 填充
      // 【续 45 2026-06-26】interval tick 也尊重 cache:5min 内 cache 命中 → 跳过 fetch
      shouldSkipTick: () => isNamespaceCacheFresh('containers') && isNamespaceCacheFresh('vms'),
    }
  );

  return useMemo(
    () => ({
      containers,
      vms,
      loading,
      error,
      refresh,
      containersRef,
      vmsRef,
    }),
    [containers, vms, loading, error, refresh, containersRef, vmsRef]
  );
}
