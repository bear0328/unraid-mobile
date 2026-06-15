// 【阶段 P1-toast - 2026-06-17 续 29-5】全局 Toast 通知 hook
// 用法:
//   const toast = useToast()
//   toast.success('保存成功')
//   toast.error('网络错误')
//   toast.info('正在加载...')
// 自动 3s 消失,多次调用会按时间顺序堆叠(最多 5 个)
// 【续 42.5.3 2026-06-19 21:30】不用 EventTarget,改用 Set 订阅
//   原因:EventTarget 在某些环境下(legacy polyfill / 旧浏览器 shim)patch 了 addEventListener
//   导致 React 18 事件代理 + EventTarget 监听都失效
//   改用最朴素的"全局 Set + 手动遍历"模式,绕开 addEventListener
//   性能:toast 触发频次低(<10/s),O(n) 遍历订阅者完全可接受
// 【续 42.5.5 2026-06-19 21:40 / 续 43 2026-06-20】listener 内 setToasts 加 flushSync
//   原因:emit 经常从 React 事件 handler 外部触发(setTimeout / AbortSignal.timeout /
//   theme 切换 / 程序化 btn.click() / window error handler 等)。
//   这些触发源不在 React 18 事件 batch 范围内,setState 调度后不立即 commit,
//   在后台 tab 节流、调度抖动、或 React StrictMode 下可能延迟到下一个 macrotask。
//   flushSync 强制同步 commit,确保 toast 立即渲染 — 对生产真浏览器也是更稳的选择。
//   验证:真浏览器硬刷 + Playwright e2e(e2e/toast.spec.ts)已覆盖同步 + 异步路径。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** 自动消失时间(ms),0 表示不自动消失 */
  duration: number;
  /** 可选操作按钮(用于 "撤销" 等) */
  action?: {
    label: string;
    onClick: () => void;
  };
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 3000;

let counter = 0;
function nextId() {
  return `t-${Date.now()}-${++counter}`;
}

// 【续 42.5.3】朴素订阅者列表,代替 EventTarget
type ToastListener = (toast: ToastItem) => void;
const listeners: Set<ToastListener> = new Set();

function emit(toast: ToastItem) {
  for (const fn of listeners) {
    try {
      fn(toast);
    } catch (err) {
      // 订阅者错误不影响其他订阅者
      console.warn('[toast] listener error:', err);
    }
  }
}

/**
 * 【阶段 P1-toast - 2026-06-17 续 32-1】脱离 React 的 toast 发射器
 * 给 main.tsx / ErrorBoundary 等非 hook 上下文用
 * 与 useToast 共享同一个订阅列表
 */
export const toastBus = {
  success(message: string, duration?: number, action?: ToastItem['action']) {
    emit({
      id: nextId(),
      type: 'success',
      message,
      duration: duration ?? DEFAULT_DURATION,
      action,
    });
  },
  error(message: string, duration?: number, action?: ToastItem['action']) {
    emit({ id: nextId(), type: 'error', message, duration: duration ?? DEFAULT_DURATION, action });
  },
  info(message: string, duration?: number, action?: ToastItem['action']) {
    emit({ id: nextId(), type: 'info', message, duration: duration ?? DEFAULT_DURATION, action });
  },
  warning(message: string, duration?: number, action?: ToastItem['action']) {
    emit({
      id: nextId(),
      type: 'warning',
      message,
      duration: duration ?? DEFAULT_DURATION,
      action,
    });
  },
};

export function useToast() {
  const success = useCallback(
    (message: string, duration = DEFAULT_DURATION, action?: ToastItem['action']) =>
      emit({ id: nextId(), type: 'success', message, duration, action }),
    []
  );
  const error = useCallback(
    (message: string, duration = DEFAULT_DURATION, action?: ToastItem['action']) =>
      emit({ id: nextId(), type: 'error', message, duration, action }),
    []
  );
  const info = useCallback(
    (message: string, duration = DEFAULT_DURATION, action?: ToastItem['action']) =>
      emit({ id: nextId(), type: 'info', message, duration, action }),
    []
  );
  const warning = useCallback(
    (message: string, duration = DEFAULT_DURATION, action?: ToastItem['action']) =>
      emit({ id: nextId(), type: 'warning', message, duration, action }),
    []
  );
  return useMemo(() => ({ success, error, info, warning }), [success, error, info, warning]);
}

// ToastContainer 用,朴素订阅
export function useToastList(): {
  toasts: ToastItem[];
  remove: (id: string) => void;
} {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onAdd: ToastListener = (detail) => {
      // flushSync 强制 commit(见文件顶部注释)
      flushSync(() => {
        setToasts((prev) => {
          const next = [...prev, detail];
          return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
        });
      });
    };
    listeners.add(onAdd);
    return () => {
      listeners.delete(onAdd);
    };
  }, []);

  const remove = useCallback((id: string) => {
    // remove 也用 flushSync:toast 自动消失通常由 setTimeout 触发,不在 React batch 内
    flushSync(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    });
  }, []);

  return { toasts, remove };
}
