import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from './usePolling';
import { usePollInterval } from './usePollInterval';
import { UnraidApiService, UnraidDockerContainer, UnraidVM } from '../services';
import {
  CONTAINER_POLL_FLOOR_MS,
  invalidateNamespace,
  isNamespaceFreshWithin,
} from '../services/unraidApi/cache';
import { markRefreshed } from '../utils/lastRefresh';

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
      // 【续 74】真实刷新成功 → 更新全局「上次刷新」时间
      markRefreshed();
    } catch (err) {
      console.error('Failed to fetch containers/vms:', err);
      setError('无法连接到 unRAID 服务器');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const pollInterval = usePollInterval();
  // 【续 73】容器/VM 跟随用户设置,但地板 60s(getDockerContainers/getVMs 涉及
  // docker/cgroup IO,过频有磁盘负担)。tick 节拍直接用有效间隔,不空转 skip。
  const effectiveInterval = Math.max(pollInterval, CONTAINER_POLL_FLOOR_MS);
  usePolling(
    async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      // 【续 73】tick 时 cache 年龄 < 有效间隔 → 直接读 cache 填充,0 网络;
      // 否则先失效 30min namespace cache 再拉,否则 graphql 层喂旧数据,
      // 设置间隔被架空(mount 首跑依赖 cache 命中,也走同一判断)
      const fresh =
        isNamespaceFreshWithin('containers', effectiveInterval) &&
        isNamespaceFreshWithin('vms', effectiveInterval);
      if (fresh && hasFetched) {
        return;
      }
      if (!fresh) {
        invalidateNamespace('containers');
        invalidateNamespace('vms');
      }

      if (!hasFetched) {
        setLoading(true);
      }
      await refresh();
    },
    effectiveInterval,
    enabled
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
