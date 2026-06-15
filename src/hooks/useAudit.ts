// 【阶段 P2-审计 - 2026-06-17 续 31-3】订阅审计日志 hook
// 复用 useErrors 的订阅模式
import { useEffect, useMemo, useState } from 'react';
import { subscribeAudit, getAuditEntries, clearAudit, type AuditEntry } from '../utils/audit';

export function useAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>(() => getAuditEntries());

  useEffect(() => {
    return subscribeAudit(setEntries);
  }, []);

  return useMemo(
    () => ({
      entries,
      count: entries.length,
      clear: clearAudit,
    }),
    [entries]
  );
}
