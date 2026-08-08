// 【阶段 P1 - 2026-06-15】容器/VM 操作 hook
// 状态:loading / error / 等待就绪(restart / reboot 后轮询等目标态)
// 【续 39-6】"等就绪"重复 2 次的逻辑抽到 useWaitForState
import { useCallback, useState } from 'react';
import { runContainerAction, runVmAction } from '../services/actionHelpers';
import { UnraidApiService } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { useWaitForState } from './useWaitForState';
import { useToast } from './useToast';
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
  // 【续 85】重启过程反馈(toast),与 compose 栈操作体验对齐
  const toast = useToast();

  // 【续 85】按 id 查显示名( toast 文案用 ),查不到回退 id
  const containerNameOf = useCallback(
    (id: string) => containersRef.current.find((c) => c.containerId === id)?.name ?? id,
    [containersRef]
  );
  const vmNameOf = useCallback(
    (id: string) => vmsRef.current.find((v) => v.vmUuid === id)?.name ?? id,
    [vmsRef]
  );

  const clearErrorSoon = useCallback(() => {
    setTimeout(() => setActionError(null), 3000);
  }, []);

  const set = (setter: typeof setRestartingContainers, id: string) => {
    setter((prev) => new Set(prev).add(id));
  };

  const handleContainerAction = useCallback(
    // 【续 50 C2】返回 boolean 表示真实成败(原来吞掉结果,批量操作失败计数恒 0);
    // 单个操作路径的 actionError/loading 行为不变
    // 【续 85】opts.silent:批量路径传 true,不刷单条"开始重启"toast(批量有自己的汇总 toast)
    async (
      containerId: string,
      action: ContainerAction,
      opts?: { silent?: boolean }
    ): Promise<boolean> => {
      if (!api) return false;
      setActionLoading(containerId);
      setActionError(null);
      try {
        const result = await runContainerAction(api, containerId, action);
        if (result.success) {
          if (action === 'restart') {
            set(setRestartingContainers, containerId);
            if (!opts?.silent) {
              toast.info(`开始重启「${containerNameOf(containerId)}」…`);
            }
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
    [api, clearErrorSoon, refreshContainers, toast, containerNameOf]
  );

  const handleVmAction = useCallback(
    // 【续 50 C2】同 handleContainerAction:返回 boolean 供批量操作计数
    // 【续 85】opts.silent 同容器路径:批量 reboot 不刷单条 toast
    async (vmId: string, action: VmAction, opts?: { silent?: boolean }): Promise<boolean> => {
      if (!api) return false;
      setActionLoading(vmId);
      setActionError(null);
      try {
        const result = await runVmAction(api, vmId, action);
        if (result.success) {
          if (action === 'reboot') {
            set(setRebootingVms, vmId);
            // 【续 85】VM 重启开始提示,与容器重启对齐
            if (!opts?.silent) {
              toast.info(`开始重启「${vmNameOf(vmId)}」…`);
            }
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
    [api, clearErrorSoon, refreshContainers, toast, vmNameOf]
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
    // 【续 88 2026-08-08】批量结算修正:所有等待容器都回到 running 才算到达
    // (原只判 find 到的第一个,它一恢复就 onDone(true) 清空整个 restartingContainers,
    //  其余未恢复的容器被误报"N 个容器已重启完成")
    reached: () => {
      for (const id of restartingContainers) {
        const c = containersRef.current.find((x) => x.containerId === id);
        if (!c || c.state !== 'running') return false;
      }
      return true;
    },
    find: () => {
      for (const c of containersRef.current) {
        if (restartingContainers.has(c.containerId)) return c;
      }
      return undefined;
    },
    onDone: (reached) => {
      // 【续 85】重启结束反馈:到达 → success,超时 → warning(对齐 compose 的完成/失败 toast)
      // 【续 88 2026-08-08】超时按实际逐个统计:已恢复 running 的报成功,未恢复的报警告
      const ids = Array.from(restartingContainers);
      const recovered = reached
        ? ids
        : ids.filter(
            (id) => containersRef.current.find((c) => c.containerId === id)?.state === 'running'
          );
      const pending = ids.length - recovered.length;
      if (recovered.length === 1 && pending === 0) {
        toast.success(`「${containerNameOf(recovered[0] ?? '')}」重启完成`);
      } else if (recovered.length > 0) {
        toast.success(`${recovered.length} 个容器已重启完成`);
      }
      if (pending > 0) {
        toast.warning(`${pending} 个容器重启等待超时,未恢复运行,请手动确认`, 5000);
      }
      setRestartingContainers(new Set());
    },
  });

  // reboot:等 VM 回到 RUNNING
  useWaitForState<UnraidVM>({
    enabled: rebootingVms.size > 0,
    isWaiting: (v) => rebootingVms.has(v.vmUuid),
    refresh: refreshBypassCache,
    // 【续 88 2026-08-08】与容器 restart 对齐:所有等待 VM 都回到 RUNNING 才算到达,
    // 超时按实际逐个统计(原 find 到第一个就结算,误报"N 个虚拟机已重启完成")
    reached: () => {
      for (const id of rebootingVms) {
        const v = vmsRef.current.find((x) => x.vmUuid === id);
        if (!v || v.state !== 'RUNNING') return false;
      }
      return true;
    },
    find: () => {
      for (const v of vmsRef.current) {
        if (rebootingVms.has(v.vmUuid)) return v;
      }
      return undefined;
    },
    onDone: (reached) => {
      // 【续 85】VM 重启结束反馈,与容器重启对齐
      const ids = Array.from(rebootingVms);
      const recovered = reached
        ? ids
        : ids.filter(
            (id) => vmsRef.current.find((v) => v.vmUuid === id)?.state === 'RUNNING'
          );
      const pending = ids.length - recovered.length;
      if (recovered.length === 1 && pending === 0) {
        toast.success(`「${vmNameOf(recovered[0] ?? '')}」重启完成`);
      } else if (recovered.length > 0) {
        toast.success(`${recovered.length} 个虚拟机已重启完成`);
      }
      if (pending > 0) {
        toast.warning(`${pending} 个虚拟机重启等待超时,未恢复运行,请手动确认`, 5000);
      }
      setRebootingVms(new Set());
    },
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
