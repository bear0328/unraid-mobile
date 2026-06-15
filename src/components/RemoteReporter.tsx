// 【阶段 P2-性能 - 2026-06-17 续 37-1】远程上报后台 runner
// 挂 App 顶层,intervalMs 跑一次 runReporterCheck
// 切换 enabled / 间隔时重启 timer
// 【续 39-4】改用 usePolledTask + useLsState,删除 useState + useEffect 重复
import { useLsState } from '../hooks/useLsState';
import { usePolledTask } from '../hooks/usePolledTask';
import { runReporterCheck, type RemoteReporterConfig } from '../utils/remoteReporter';

const STORAGE_KEY = 'unraid-mobile-remote-reporter';

/**
 * 纯副作用组件,挂 App 顶层
 */
export default function RemoteReporter() {
  const [cfg] = useLsState<RemoteReporterConfig>(STORAGE_KEY, {
    enabled: false,
    lcpMs: 2500,
    clsThreshold: 0.1,
    inpMs: 200,
    errorCount: 3,
    errorWindowMs: 5 * 60 * 1000,
    cooldownMs: 30 * 60 * 1000,
    intervalMs: 30 * 1000,
    omitStack: true,
  });
  usePolledTask({
    enabled: cfg.enabled,
    intervalMs: cfg.intervalMs,
    run: () => runReporterCheck(),
    immediate: true,
  });
  return null;
}
