// 【阶段 P2-质量 - 2026-06-17 续 39-4】usePolledTask
// 替代"useEffect + setInterval + LS cfg + cleanup"重复 pattern
// 用法:
//   usePolledTask({
//     enabled: cfg.enabled,
//     intervalMs: cfg.intervalMs,
//     run: () => { ... },
//   })
// 行为:
//   - enabled 切换 / intervalMs 变 → 自动重启 timer
//   - 组件卸载 → 清理
//   - run 抛错静默吞(避免毁 timer)
//   - run 引用变化不重启(用 ref 拿最新)
import { useEffect, useRef } from 'react';

interface Options {
  enabled: boolean;
  intervalMs: number;
  run: () => void | Promise<void>;
  /** 是否在挂载时立即跑一次,默认 false */
  immediate?: boolean;
}

export function usePolledTask(opts: Options): void {
  const { enabled, intervalMs, run, immediate } = opts;
  // ref 持有最新 run,避免 run 引用变化导致 timer 重建
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return;
    if (immediate) {
      try {
        const r = runRef.current();
        if (r instanceof Promise)
          r.catch(() => {
            /* ignore */
          });
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(() => {
      try {
        const r = runRef.current();
        if (r instanceof Promise)
          r.catch(() => {
            /* ignore */
          });
      } catch {
        /* ignore */
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, immediate]);
}
