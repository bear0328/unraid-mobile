// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】Dashboard 卡片顺序
// LS 持久化,默认顺序在代码里
// 【续 90】array 卡删除(并入 DiskCard 标题),DEFAULT_ORDER 去掉 'array';
// 续 89 迁移修 bug:迁移结果写回 LS + 版本标记(-v2),已迁移跳过,
// 不再每次 mount 强制重排(原实现会覆盖用户把 network 拖下去的自定义)
import { useCallback, useEffect, useMemo, useState } from 'react';

export const DEFAULT_ORDER = [
  'favorites',
  'cpu',
  'memory',
  'network',
  'containers',
  'vms',
  'disk',
] as const;
export type DashboardCardKey = (typeof DEFAULT_ORDER)[number];
const STORAGE_KEY = 'unraid-mobile-dashboard-order';
// 【续 90】迁移版本标记:存在且为 v2 → 存量顺序迁移已做过,直接信任 LS
const MIGRATE_KEY = 'unraid-mobile-dashboard-order-v';
const MIGRATE_VERSION = 'v2';

function readOrder(): DashboardCardKey[] {
  if (typeof localStorage === 'undefined') return [...DEFAULT_ORDER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_ORDER];
    // 过滤掉未知 key(续 90 删除的 'array' 也在此被清掉)
    const known = new Set<string>(DEFAULT_ORDER);
    const filtered = arr.filter((k: unknown) => typeof k === 'string' && known.has(k));
    // 补全缺失的(新加的卡片)
    const present = new Set(filtered);
    const missing = DEFAULT_ORDER.filter((k) => !present.has(k));
    let order = [...filtered, ...missing] as DashboardCardKey[];
    // 【续 90】已迁移(v2 标记)→ 直接信任 LS,尊重用户自定义顺序
    if (localStorage.getItem(MIGRATE_KEY) === MIGRATE_VERSION) return order;
    // 【续 89】老用户存量顺序一次性迁移:network 提到 containers 前、
    // vms 紧随 containers(新装用户无 LS 直接走 DEFAULT_ORDER,不进这里)
    const ci = order.indexOf('containers');
    if (ci >= 0) {
      const rest: DashboardCardKey[] = order.filter((k) => k !== 'network' && k !== 'vms');
      const nci = rest.indexOf('containers');
      rest.splice(nci, 0, 'network');
      rest.splice(nci + 2, 0, 'vms');
      order = rest;
    }
    // 【续 90】迁移结果写回 LS + 版本标记,之后 mount 不再重复迁移
    writeOrder(order);
    try {
      localStorage.setItem(MIGRATE_KEY, MIGRATE_VERSION);
    } catch {
      /* ignore */
    }
    return order;
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
