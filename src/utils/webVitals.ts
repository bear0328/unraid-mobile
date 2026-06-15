// 【阶段 P2-性能 - 2026-06-17 续 35-5】Web Vitals 长期归档到 LS
// 5min 一次快照,保留最近 MAX 条,Debug 页看趋势
// 格式: { ts, lcp, cls, inp, fcp }[]
import { useEffect, useState } from 'react';
import type { Vitals } from '../hooks/useWebVitals';

const STORAGE_KEY = 'unraid-mobile-vitals-history';
const MAX_RECORDS = 200; // 200 * 5min = ~16.6h

export interface VitalsSnapshot {
  ts: number;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
}

function read(): VitalsSnapshot[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x.ts === 'number');
  } catch {
    return [];
  }
}

function write(arr: VitalsSnapshot[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export function getVitalsHistory(): VitalsSnapshot[] {
  return read();
}
export function clearVitalsHistory() {
  write([]);
  notify();
}

export function recordVitalsSnapshot(v: Vitals): VitalsSnapshot {
  const snap: VitalsSnapshot = {
    ts: Date.now(),
    lcp: v.lcp,
    cls: v.cls,
    inp: v.inp,
    fcp: v.fcp,
  };
  const next = [...read(), snap];
  if (next.length > MAX_RECORDS) next.splice(0, next.length - MAX_RECORDS);
  write(next);
  notify();
  return snap;
}

/**
 * React hook 读取历史 + 订阅变化
 * 默认 5min 刷新率,Debug 页用
 */
export function useVitalsHistory() {
  const [history, setHistory] = useState<VitalsSnapshot[]>(read);
  useEffect(() => {
    const fn = () => setHistory(read());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { history, clear: clearVitalsHistory, count: history.length };
}
