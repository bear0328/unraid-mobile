// 【续 39-1 候选 - 2026-06-18】磁盘/温度历史化
// 5min 节流采样,保留最近 MAX_RECORDS 条,Debug 页 + DiskCard 趋势图用
// 存储: { [diskName]: { ts, temp, used }[] }
// 照搬 webVitals.ts 范本(per-disk 嵌套 Map)
import { useEffect, useState } from 'react';
import type { UnraidDisk } from '../services/types';

const STORAGE_KEY = 'unraid-mobile-disk-history';
const MAX_RECORDS = 200; // 200 * 5min = ~16.6h
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

export interface DiskTempSnapshot {
  ts: number;
  temp: number | null;
  used: number | null;
}

type HistoryMap = Record<string, DiskTempSnapshot[]>;

function read(): HistoryMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return {};
    const out: HistoryMap = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!Array.isArray(v)) continue;
      out[k] = v.filter((x: unknown) => {
        if (!x || typeof x !== 'object') return false;
        const s = x as Partial<DiskTempSnapshot>;
        return typeof s.ts === 'number';
      });
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: HistoryMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export function getDiskHistory(diskName: string): DiskTempSnapshot[] {
  return read()[diskName] ?? [];
}

export function getAllDiskHistory(): HistoryMap {
  return read();
}

export function clearDiskHistory() {
  write({});
  notify();
}

export function recordDiskSnapshot(disks: UnraidDisk[]): void {
  const map = read();
  const now = Date.now();
  for (const d of disks) {
    if (!d.name) continue;
    const arr = map[d.name] ?? [];
    const last = arr[arr.length - 1];
    // 5min 节流:同盘同时间窗不重复写
    if (last && now - last.ts < SAMPLE_INTERVAL_MS) continue;
    arr.push({
      ts: now,
      temp: typeof d.temperature === 'number' ? d.temperature : null,
      used: typeof d.used === 'number' ? d.used : null,
    });
    if (arr.length > MAX_RECORDS) arr.splice(0, arr.length - MAX_RECORDS);
    map[d.name] = arr;
  }
  write(map);
  notify();
}

/**
 * React hook:订阅单盘历史
 */
export function useDiskHistory(diskName: string): DiskTempSnapshot[] {
  const [history, setHistory] = useState<DiskTempSnapshot[]>(() => getDiskHistory(diskName));
  useEffect(() => {
    const fn = () => setHistory(getDiskHistory(diskName));
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [diskName]);
  return history;
}

/**
 * React hook:订阅所有盘历史(Debug 页用)
 */
export function useAllDiskHistory(): HistoryMap {
  const [map, setMap] = useState<HistoryMap>(read);
  useEffect(() => {
    const fn = () => setMap(read());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return map;
}
