// 【阶段 P1-3 - 2026-06-15 续 9】前端错误采集
// 队列（上限 50 条，LRU）+ localStorage 持久化 + 订阅通知
// 入口：reportError(err, source?, extra?) — UI/ErrorBoundary/main.tsx 都调
// 不上报到 unraid（违反"不装东西"原则），只本地存储
export type ErrorSource = 'react' | 'window' | 'unhandledrejection' | 'manual';

export interface ErrorRecord {
  id: string;
  timestamp: number;
  source: ErrorSource;
  message: string;
  stack?: string;
  /** 来源补充信息（如 componentStack、eventType） */
  extra?: string;
}

const STORAGE_KEY = 'unraid-mobile-errors';
const MAX_ERRORS = 50;

type Listener = (errors: ErrorRecord[]) => void;
const listeners = new Set<Listener>();

function readStorage(): ErrorRecord[] {
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

function writeStorage(errors: ErrorRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(errors));
  } catch {
    // 容量满或隐私模式，忽略
  }
}

function notify(errors: ErrorRecord[]): void {
  for (const fn of listeners) {
    try {
      fn(errors);
    } catch {
      // 监听器异常不影响主流程
    }
  }
}

export function getErrors(): ErrorRecord[] {
  return readStorage();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  // 立即触发一次（让新订阅者拿到当前快照）,内部 try/catch 防止监听器抛错影响调用方
  try {
    fn(readStorage());
  } catch {
    // 监听器异常不影响主流程
  }
  return () => {
    listeners.delete(fn);
  };
}

export function reportError(
  err: Error | string,
  source: ErrorSource = 'manual',
  extra?: string
): void {
  const error: ErrorRecord = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    source,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    extra,
  };

  const next = [error, ...readStorage()].slice(0, MAX_ERRORS);
  writeStorage(next);
  notify(next);
}

export function clearErrors(): void {
  writeStorage([]);
  notify([]);
}

export function deleteError(id: string): void {
  const next = readStorage().filter((e) => e.id !== id);
  writeStorage(next);
  notify(next);
}

/** 测试用：注入假错误。仅 dev 模式使用。 */
export function __injectTestError(): void {
  reportError(
    new Error('测试错误 (test inject)'),
    'manual',
    '来自 errorReporter.__injectTestError()'
  );
}
