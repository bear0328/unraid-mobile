// 【阶段 P2-质量 - 2026-06-17 续 39-2】useLsState
// 替代 useState + useEffect + LS 读/写的反模式(出现 7+ 处:theme/webhook/favorites/notifications/webVitals/remote reporter/...)
// 特性:
//   1. 初始化从 LS 读
//   2. setValue 时同步写 LS + 通知同标签页订阅者
//   3. 跨标签页 storage 事件自动同步
//   4. 解析失败回退 default
// 用法:
//   const [cfg, setCfg] = useLsState('my-key', { a: 1 })
//   setCfg({ a: 2 })  // 自动写 LS + 通知
import { useCallback, useEffect, useRef, useState } from 'react';

type Serializer<T> = (raw: string | null) => T | undefined;
type Deserializer<T> = (v: T) => string;

interface Options<T> {
  /** 自定义解析(LS 字符串 → 值),返回 undefined 时回退 default */
  deserialize?: Serializer<T>;
  /** 自定义序列化(值 → LS 字符串) */
  serialize?: Deserializer<T>;
  /** 是否启用跨标签页 storage 事件同步,默认 true */
  crossTab?: boolean;
}

function defaultDeserialize<T>(raw: string | null): T | undefined {
  if (raw == null) return undefined;
  try {
    const v = JSON.parse(raw) as T;
    return v;
  } catch {
    return undefined;
  }
}

function defaultSerialize<T>(v: T): string {
  return JSON.stringify(v);
}

/**
 * 同标签页 pub/sub(同 key 多组件共享)
 * 简单 Map<key, Set<fn>>;写时通知
 */
const subs = new Map<string, Set<() => void>>();
function notifyLocal(key: string) {
  const set = subs.get(key);
  if (!set) return;
  for (const fn of set) fn();
}

/**
 * 跨标签页 storage 事件分发(只对启用了 crossTab 的 key 监听)
 * 启动时只注册一次,统一派发
 */
const crossTabKeys = new Set<string>();
let storageBound = false;
function ensureStorageBinding() {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (crossTabKeys.has(e.key)) notifyLocal(e.key);
  });
}

export function useLsState<T>(
  key: string,
  defaultValue: T,
  opts: Options<T> = {}
): [T, (next: T | ((prev: T) => T)) => void] {
  const deserialize = opts.deserialize ?? defaultDeserialize;
  const serialize = opts.serialize ?? defaultSerialize;
  const crossTab = opts.crossTab ?? true;

  // 首次渲染同步读 LS(避免 hydration mismatch 用 lazy initializer)
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return defaultValue;
    const v = deserialize(localStorage.getItem(key));
    return v === undefined ? defaultValue : v;
  });

  // 订阅同标签页同 key 的更新 + 跨标签页 storage 事件
  useEffect(() => {
    if (crossTab) {
      crossTabKeys.add(key);
      ensureStorageBinding();
    }
    const fn = () => {
      if (typeof localStorage === 'undefined') return;
      const v = deserialize(localStorage.getItem(key));
      setValue(v === undefined ? defaultValue : v);
    };
    let set = subs.get(key);
    if (!set) {
      set = new Set();
      subs.set(key, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) subs.delete(key);
      if (crossTab) crossTabKeys.delete(key);
    };
  }, [key, crossTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // 写:同步 LS + 通知
  const setValueAndPersist = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(key, serialize(resolved));
          } catch {
            /* ignore */
          }
        }
        // 下一帧通知(避免 setState 阶段嵌套触发)
        queueMicrotask(() => notifyLocal(key));
        return resolved;
      });
    },
    [key, serialize]
  );

  return [value, setValueAndPersist];
}

/**
 * 只读订阅(无 set 返回值)
 * 用法: useLsSubscription('key', v => doSomething(v))
 */
export function useLsSubscription<T>(
  key: string,
  fn: (v: T) => void,
  options?: { defaultValue?: T } & Options<T>
) {
  const defaultValue = options?.defaultValue as T | undefined;
  const cbRef = useRef(fn);
  cbRef.current = fn;
  useEffect(() => {
    const deserialize = options?.deserialize ?? defaultDeserialize<T>;
    const tick = () => {
      if (typeof localStorage === 'undefined') return;
      const v = deserialize(localStorage.getItem(key));
      cbRef.current(v === undefined ? (defaultValue as T) : v);
    };
    tick();
    let set = subs.get(key);
    if (!set) {
      set = new Set();
      subs.set(key, set);
    }
    set.add(tick);
    return () => {
      set?.delete(tick);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
