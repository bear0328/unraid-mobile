// 【阶段 P1 - 2026-06-15】容器/VM 操作 hook
// 状态:loading / error / 等待就绪(restart / reboot 后轮询等目标态)
// 【续 39-6】"等就绪"重复 2 次的逻辑抽到 useWaitForState
import { useCallback, useState } from 'react';
import { runContainerAction, runVmAction } from '../services/actionHelpers';
import { UnraidApiService } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { useWaitForState } from './useWaitForState';
import { invalidateNamespace } from '../services/unraidApi/cache';

export function useContainerActions(
  api: UnraidApiService | null,
  refreshContainers: () => Promise<void>,
  containersRef: React.MutableRefObject<UnraidDockerContainer[]>,
  vmsRef: React.MutableRefObject<UnraidVM[]>
) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restartingContainers, setRestartingContainers] = useState<Set<string>>(new Set());
  const [rebootingVms, setRebootingVms] = useState<Set<string>>(new Set());

  const clearErrorSoon = useCallback(() => {
    setTimeout(() => setActionError(null), 3000);
  }, []);

  const set = (setter: typeof setRestartingContainers, id: string) => {
    setter((prev) => new Set(prev).add(id));
  };

  const handleContainerAction = useCallback(
    // 【续 50 C2】返回 boolean 表示真实成败(原来吞掉结果,批量操作失败计数恒 0);
    // 单个操作路径的 actionError/loading 行为不变
    async (containerId: string, action: ContainerAction): Promise<boolean> => {
      if (!api) return false;
      setActionLoading(containerId);
      setActionError(null);
      try {
        const result = await runContainerAction(api, containerId, action);
        if (result.success) {
          if (action === 'restart') {
            set(setRestartingContainers, containerId);
          }
          await refreshContainers();
          return true;
        }
        setActionError(result.error || '操作失败');
        clearErrorSoon();
        return false;
      } catch {
        setActionError('操作失败');
        clearErrorSoon();
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [api, clearErrorSoon, refreshContainers]
  );

  const handleVmAction = useCallback(
    // 【续 50 C2】同 handleContainerAction:返回 boolean 供批量操作计数
    async (vmId: string, action: VmAction): Promise<boolean> => {
      if (!api) return false;
      setActionLoading(vmId);
      setActionError(null);
      try {
        const result = await runVmAction(api, vmId, action);
        if (result.success) {
          if (action === 'reboot') {
            set(setRebootingVms, vmId);
          }
          await refreshContainers();
          return true;
        }
        setActionError(result.error || '操作失败');
        clearErrorSoon();
        return false;
      } catch {
        setActionError('操作失败');
        clearErrorSoon();
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [api, clearErrorSoon, refreshContainers]
  );

  // 【续 50 B1 补】wait 轮询必须绕开 30min graphql cache:mutation 后第一次 refresh
  // 会立刻重写 cache,轮询若命中它,慢转换(restart 要数秒)永远等不到新状态 → 30s 超时误报
  const refreshBypassCache = useCallback(async () => {
    invalidateNamespace('containers');
    invalidateNamespace('vms');
    await refreshContainers();
  }, [refreshContainers]);

  // restart:等容器回到 running
  useWaitForState<UnraidDockerContainer>({
    enabled: restartingContainers.size > 0,
    isWaiting: (c) => restartingContainers.has(c.containerId),
    refresh: refreshBypassCache,
    reached: (c) => c.state === 'running',
    find: () => {
      for (const c of containersRef.current) {
        if (restartingContainers.has(c.containerId)) return c;
      }
      return undefined;
    },
    onDone: () => {
      // 全部 clear(单资源由 find 返回,此处粗暴清空)
      setRestartingContainers(new Set());
    },
  });

  // reboot:等 VM 回到 RUNNING
  useWaitForState<UnraidVM>({
    enabled: rebootingVms.size > 0,
    isWaiting: (v) => rebootingVms.has(v.vmUuid),
    refresh: refreshBypassCache,
    reached: (v) => v.state === 'RUNNING',
    find: () => {
      for (const v of vmsRef.current) {
        if (rebootingVms.has(v.vmUuid)) return v;
      }
      return undefined;
    },
    onDone: () => setRebootingVms(new Set()),
  });

  return {
    actionLoading,
    actionError,
    restartingContainers,
    rebootingVms,
    handleContainerAction,
    handleVmAction,
  };
}
