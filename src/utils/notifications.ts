// 【阶段 P2-通知 - 2026-06-17 续 37-2】通知中心持久化
// LS 存最近 200 条,pub/sub 通知 React hook
// 来源:container 状态变化、关键字告警、远程上报回执、错误
import { useEffect, useState } from 'react';

export type NotificationKind = 'container' | 'error' | 'remote' | 'system';

export interface AppNotification {
  id: string;
  ts: number;
  kind: NotificationKind;
  /** 简短标题 */
  title: string;
  /** 详情(可空) */
  detail?: string;
  /** 跳转目标(可空) */
  link?: string;
  /** 严重度(影响展示) */
  level: 'info' | 'warning' | 'error' | 'success';
  /** 是否已读 */
  read: boolean;
}

const STORAGE_KEY = 'unraid-mobile-notifications';
const MAX_RECORDS = 200;

function read(): AppNotification[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x.id === 'string');
  } catch {
    return [];
  }
}

function write(arr: AppNotification[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

const listeners = new Set<(arr: AppNotification[]) => void>();
function notify(arr: AppNotification[]) {
  for (const l of listeners) l(arr);
}

export function getNotifications(): AppNotification[] {
  return read();
}

export function subscribeNotifications(fn: (arr: AppNotification[]) => void): () => void {
  listeners.add(fn);
  try {
    fn(read());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(fn);
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface PushInput {
  kind: NotificationKind;
  title: string;
  detail?: string;
  link?: string;
  level?: AppNotification['level'];
}

export function pushNotification(input: PushInput): AppNotification {
  const n: AppNotification = {
    id: newId(),
    ts: Date.now(),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    link: input.link,
    level: input.level ?? 'info',
    read: false,
  };
  const next = [n, ...read()].slice(0, MAX_RECORDS);
  write(next);
  notify(next);
  return n;
}

export function markRead(id: string) {
  const next = read().map((n) => (n.id === id ? { ...n, read: true } : n));
  write(next);
  notify(next);
}

export function markAllRead() {
  const next = read().map((n) => ({ ...n, read: true }));
  write(next);
  notify(next);
}

export function deleteNotification(id: string) {
  const next = read().filter((n) => n.id !== id);
  write(next);
  notify(next);
}

export function clearNotifications() {
  write([]);
  notify([]);
}

export function useNotifications() {
  const [list, setList] = useState<AppNotification[]>(() => read());
  useEffect(() => subscribeNotifications(setList), []);
  return {
    list,
    unread: list.filter((n) => !n.read).length,
    push: pushNotification,
    markRead,
    markAllRead,
    remove: deleteNotification,
    clear: clearNotifications,
  };
}
