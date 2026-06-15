// 【阶段 P2-收藏 - 2026-06-17 续 32-6】快捷收藏 hook
// 收藏项类型:容器 / 分享 / 路径(任意 share 下的子路径)
// LS 持久化 + 订阅通知
// 入口:useFavorites() → { favorites, add, remove, isFavorite, toggle }
// 用法:
//   const { add, isFavorite, toggle } = useFavorites()
//   toggle({ kind: 'container', value: 'nginx', label: 'Nginx' })
import { useCallback, useEffect, useMemo, useState } from 'react';

export type FavoriteKind = 'container' | 'share' | 'path';

export interface Favorite {
  id: string;
  kind: FavoriteKind;
  /** 主键:container 名称 / share 名称 / 完整路径 */
  value: string;
  /** 显示名 */
  label: string;
  /** 添加时间 */
  addedAt: number;
}

const STORAGE_KEY = 'unraid-mobile-favorites';
const MAX_FAVORITES = 50;

type Listener = (favorites: Favorite[]) => void;
const listeners = new Set<Listener>();

function readStorage(): Favorite[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeStorage(favorites: Favorite[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // 容量满
  }
}

function notify(favorites: Favorite[]): void {
  for (const fn of listeners) {
    try {
      fn(favorites);
    } catch {
      /* ignore */
    }
  }
}

let counter = 0;
function nextId() {
  return `fav-${Date.now()}-${++counter}`;
}

export function getFavorites(): Favorite[] {
  return readStorage();
}

export function addFavorite(input: Omit<Favorite, 'id' | 'addedAt'>): Favorite {
  const existing = readStorage();
  // 去重(同 kind+value 不重复)
  const dup = existing.find((f) => f.kind === input.kind && f.value === input.value);
  if (dup) return dup;
  const fav: Favorite = { ...input, id: nextId(), addedAt: Date.now() };
  const next = [fav, ...existing].slice(0, MAX_FAVORITES);
  writeStorage(next);
  notify(next);
  return fav;
}

export function removeFavorite(id: string): void {
  const next = readStorage().filter((f) => f.id !== id);
  writeStorage(next);
  notify(next);
}

export function removeFavoriteByValue(kind: FavoriteKind, value: string): void {
  const next = readStorage().filter((f) => !(f.kind === kind && f.value === value));
  writeStorage(next);
  notify(next);
}

export function isFavorite(kind: FavoriteKind, value: string): boolean {
  return readStorage().some((f) => f.kind === kind && f.value === value);
}

export function subscribeFavorites(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(readStorage());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(fn);
  };
}

export function clearFavorites(): void {
  writeStorage([]);
  notify([]);
}

// 【阶段 P2-收藏导入导出 - 2026-06-17 续 33-3】
// 导出:返回 JSON 字符串,文件名带日期
// 导入:解析 + 合并 + 去重,失败抛错
export function exportFavorites(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: readStorage(),
  };
  return JSON.stringify(data, null, 2);
}

export interface ImportResult {
  added: number;
  skipped: number;
  total: number;
}

/** 导入:合并到现有收藏(去重 kind+value),返回统计 */
export function importFavorites(jsonStr: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON 解析失败: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('文件格式错误: 顶层不是对象');
  }
  const obj = parsed as { version?: number; favorites?: unknown };
  if (typeof obj.favorites !== 'object' || !Array.isArray(obj.favorites)) {
    throw new Error('文件格式错误: favorites 字段不是数组');
  }
  const incoming = obj.favorites as Favorite[];
  // 校验每条
  const valid: Favorite[] = [];
  for (const f of incoming) {
    if (
      typeof f === 'object' &&
      f !== null &&
      typeof f.id === 'string' &&
      typeof f.value === 'string' &&
      typeof f.label === 'string' &&
      (f.kind === 'container' || f.kind === 'share' || f.kind === 'path') &&
      typeof f.addedAt === 'number'
    ) {
      valid.push(f);
    }
  }
  const existing = readStorage();
  const existingKeys = new Set(existing.map((f) => `${f.kind}:${f.value}`));
  let added = 0;
  const merged = [...existing];
  for (const f of valid) {
    const key = `${f.kind}:${f.value}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    // 生成新 id(避免和本地冲突)
    merged.unshift({ ...f, id: nextId() });
    added++;
  }
  const trimmed = merged.slice(0, MAX_FAVORITES);
  writeStorage(trimmed);
  notify(trimmed);
  return {
    added,
    skipped: valid.length - added,
    total: trimmed.length,
  };
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>(() => getFavorites());

  useEffect(() => {
    return subscribeFavorites(setFavorites);
  }, []);

  const add = useCallback((input: Omit<Favorite, 'id' | 'addedAt'>) => {
    return addFavorite(input);
  }, []);

  const remove = useCallback((id: string) => {
    removeFavorite(id);
  }, []);

  const toggle = useCallback((input: Omit<Favorite, 'id' | 'addedAt'>) => {
    if (isFavorite(input.kind, input.value)) {
      removeFavoriteByValue(input.kind, input.value);
    } else {
      addFavorite(input);
    }
  }, []);

  const isFav = useCallback(
    (kind: FavoriteKind, value: string) => {
      return favorites.some((f) => f.kind === kind && f.value === value);
    },
    [favorites]
  );

  // 【续 33-3】导入导出
  const exportJson = useCallback(() => exportFavorites(), []);
  const importJson = useCallback((jsonStr: string) => importFavorites(jsonStr), []);

  return useMemo(
    () => ({
      favorites,
      add,
      remove,
      toggle,
      isFavorite: isFav,
      clear: clearFavorites,
      exportJson,
      importJson,
    }),
    [favorites, add, remove, toggle, isFav, exportJson, importJson]
  );
}
