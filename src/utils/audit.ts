// 【阶段 P2-审计 - 2026-06-17 续 31-3】WebDAV 操作审计日志
// 记录所有危险操作(DELETE/MOVE/COPY/PUT/MKCOL)用于事后排查
// 不上传(unraid 端,违反"不装东西"原则),只本地 localStorage
// 上限 1000 条 LRU + 7 天过期清理
// 入口:recordAudit(action, path, status) / subscribe(fn) / getAll() / clearAudit()

export type AuditAction =
  | 'DELETE'
  | 'MOVE'
  | 'COPY'
  | 'PUT'
  | 'MKCOL'
  | 'BATCH_DELETE'
  | 'UPLOAD'
  | 'DOWNLOAD';
export type AuditStatus = 'success' | 'failed' | 'rolled-back';

export interface AuditEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  /** 目标路径(URL 去除 origin) */
  path: string;
  /** 操作结果 */
  status: AuditStatus;
  /** 错误信息(失败时) */
  error?: string;
  /** 附加信息(批量操作:数量;MOVE:源+目的) */
  details?: string;
}

const STORAGE_KEY = 'unraid-mobile-audit';
const MAX_ENTRIES = 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

type Listener = (entries: AuditEntry[]) => void;
const listeners = new Set<Listener>();

function readStorage(): AuditEntry[] {
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

function writeStorage(entries: AuditEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 容量满,丢老的不重要的
  }
}

function notify(entries: AuditEntry[]): void {
  for (const fn of listeners) {
    try {
      fn(entries);
    } catch {
      // 监听器异常不影响主流程
    }
  }
}

function cleanup(entries: AuditEntry[]): AuditEntry[] {
  const now = Date.now();
  const fresh = entries.filter((e) => now - e.timestamp < RETENTION_MS);
  return fresh.length > MAX_ENTRIES ? fresh.slice(0, MAX_ENTRIES) : fresh;
}

let counter = 0;
function nextId() {
  return `a-${Date.now()}-${++counter}`;
}

export function recordAudit(
  action: AuditAction,
  path: string,
  status: AuditStatus,
  options?: { error?: string; details?: string }
): void {
  const entry: AuditEntry = {
    id: nextId(),
    timestamp: Date.now(),
    action,
    path,
    status,
    error: options?.error,
    details: options?.details,
  };
  const next = cleanup([entry, ...readStorage()]);
  writeStorage(next);
  notify(next);
}

export function getAuditEntries(): AuditEntry[] {
  return cleanup(readStorage());
}

export function subscribeAudit(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(getAuditEntries());
  } catch {
    // 忽略
  }
  return () => {
    listeners.delete(fn);
  };
}

export function clearAudit(): void {
  writeStorage([]);
  notify([]);
}
