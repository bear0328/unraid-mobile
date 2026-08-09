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

// 【续 78】渲染相关字段逐元素比较:无变化复用旧对象/数组引用,
// 配合 ContainerItem/VmItem 的 React.memo,每轮 poll 未变行不触发重渲
function mergeList<T>(
  prev: T[],
  next: T[],
  keyOf: (x: T) => string,
  sameFields: (a: T, b: T) => boolean
): T[] {
  const prevByKey = new Map(prev.map((x) => [keyOf(x), x]));
  const merged = next.map((n) => {
    const p = prevByKey.get(keyOf(n));
    return p && sameFields(p, n) ? p : n;
  });
  const unchanged = prev.length === merged.length && merged.every((m, i) => prev[i] === m);
  return unchanged ? prev : merged;
}

const sameContainer = (a: UnraidDockerContainer, b: UnraidDockerContainer) =>
  a.containerId === b.containerId &&
  a.name === b.name &&
  a.image === b.image &&
  a.state === b.state &&
  a.status === b.status &&
  a.isUpdateAvailable === b.isUpdateAvailable;

const sameVm = (a: UnraidVM, b: UnraidVM) =>
  a.vmUuid === b.vmUuid && a.name === b.name && a.state === b.state;

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
      // 【续 91 A2】失败返 null(区别于真空 []):null 的列表保留 prev + 置 error,
      // 不再把一次失败当空列表清空卡片;两个都成功才清 error/记刷新时间
      if (containerData) {
        // 【续 78】引用保持:渲染字段无变化 → 复用旧引用,memo 行不重渲
        setContainers((prev) => mergeList(prev, containerData, (c) => c.containerId, sameContainer));
      }
      if (vmData) {
        setVMs((prev) => mergeList(prev, vmData, (v) => v.vmUuid, sameVm));
      }
      if (containerData && vmData) {
        setError(null);
        setHasFetched(true);
        // 【续 74】真实刷新成功 → 更新全局「上次刷新」时间
        markRefreshed();
      } else {
        setError('无法连接到 unRAID 服务器');
      }
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
