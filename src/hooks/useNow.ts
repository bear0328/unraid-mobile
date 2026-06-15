// 【续 46.2 2026-07-18】周期 tick 强制重渲染,让 StaleBadge 的 cache age 自动增长
// 背景:Dashboard/Containers 的 cache age 只在 render 时计算,而 polling 在 cache
// 5min 新鲜期内全部 skip(防唤盘设计),期间页面无任何 re-render → staleness 提示
// 最晚 5 分钟才出现(实测:用户原地等 60s 看不到 badge)。
// 本 hook 每 intervalMs 触发一次纯本地 re-render(零网络零磁盘 IO,render 开销可忽略),
// 让 badge 在 threshold 到达后及时出现并持续增长。
import { useEffect, useState } from 'react';

/**
 * 每 intervalMs 返回一次新的 Date.now(),驱动调用方周期性 re-render。
 * 调用方通常不需要使用返回值 —— 要的是它带来的 re-render。
 */
export function useNow(intervalMs: number = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
