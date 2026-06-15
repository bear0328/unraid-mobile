// 【阶段 P2-质量 - 2026-06-17 续 39-6】useWaitForState
// 抽 "操作后轮询等目标状态" pattern(原 useContainerActions 重复 2 次)
// 用法:触发 restart 后,每秒 refresh 列表,直到该资源 state === 'running',超时 30s
import { useEffect, useRef } from 'react';

interface Options<T> {
  enabled: boolean;
  /** 当前资源是否还在"等待中",是则继续轮询 */
  isWaiting: (item: T) => boolean;
  /** 拉最新列表 */
  refresh: () => Promise<void>;
  /** 等到目标状态时返回 true */
  reached: (item: T) => boolean;
  /** 找资源 */
  find: () => T | undefined;
  /** 超时(毫秒),默认 30s */
  timeoutMs?: number;
  /** 轮询间隔(毫秒),默认 1s */
  pollMs?: number;
  /** 完成后(到达 / 超时)清理等待标记 */
  onDone: () => void;
}

export function useWaitForState<T>(opts: Options<T>): void {
  const {
    enabled,
    isWaiting,
    refresh,
    reached,
    find,
    timeoutMs = 30_000,
    pollMs = 1000,
    onDone,
  } = opts;
  // ref 持有最新 opts 引用,避免依赖变化重启 effect
   
  const ref = useRef({ isWaiting, refresh, reached, find, onDone });
  ref.current = { isWaiting, refresh, reached, find, onDone };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const startedAt = Date.now();

    const checkTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        await ref.current.refresh();
      } catch {
        /* 单次失败继续 */
      }
      if (cancelled) return;
      const item = ref.current.find();
      if (item && ref.current.reached(item)) {
        ref.current.onDone();
        clearInterval(checkTimer);
        clearTimeout(timeout);
      } else if (Date.now() - startedAt > timeoutMs) {
        // 超时
        ref.current.onDone();
        clearInterval(checkTimer);
        clearTimeout(timeout);
      }
    }, pollMs);

    const timeout = setTimeout(() => {
      if (cancelled) return;
      clearInterval(checkTimer);
      ref.current.onDone();
    }, timeoutMs);

    return () => {
      cancelled = true;
      clearInterval(checkTimer);
      clearTimeout(timeout);
    };
  }, [enabled, timeoutMs, pollMs]);
}
