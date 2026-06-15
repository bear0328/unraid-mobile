// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】Dashboard 卡片顺序
// LS 持久化,默认顺序在代码里
import { useCallback, useEffect, useMemo, useState } from 'react';

export const DEFAULT_ORDER = [
  'favorites',
  'cpu',
  'memory',
  'containers',
  'network',
  'array',
  'disk',
] as const;
export type DashboardCardKey = (typeof DEFAULT_ORDER)[number];
const STORAGE_KEY = 'unraid-mobile-dashboard-order';

function readOrder(): DashboardCardKey[] {
  if (typeof localStorage === 'undefined') return [...DEFAULT_ORDER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_ORDER];
    // 过滤掉未知 key
    const known = new Set<string>(DEFAULT_ORDER);
    const filtered = arr.filter((k: unknown) => typeof k === 'string' && known.has(k));
    // 补全缺失的(新加的卡片)
    const present = new Set(filtered);
    const missing = DEFAULT_ORDER.filter((k) => !present.has(k));
    return [...filtered, ...missing] as DashboardCardKey[];
  } catch {
    return [...DEFAULT_ORDER];
  }
}

function writeOrder(order: DashboardCardKey[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export function useDashboardOrder() {
  const [order, setOrder] = useState<DashboardCardKey[]>(readOrder);

  useEffect(() => {
    writeOrder(order);
  }, [order]);

  const move = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setOrder([...DEFAULT_ORDER]);
  }, []);

  return useMemo(() => ({ order, move, reset }), [order, move, reset]);
}
