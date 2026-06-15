import { useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from './usePolling';
import { UnraidApiService } from '../services';

// 【续 50 B8】docker logs --since 含边界时间戳(cursor=上批最后一行的 ts,该行会再次被返回),
// 增量合并时按 prev 末尾已展示的、与旧 cursor 同时间戳的行数(tailCount)跳过 batch 前缀
function mergeIncrementalLogs(prev: string, batch: string, cursor: string, tailCount: number): string {
  if (!prev) return batch;
  if (!batch) return prev;
  const prefix = `[${cursor}] `;
  const lines = batch.split('\n');
  let dropped = 0;
  while (dropped < tailCount && lines.length > 0 && lines[0].startsWith(prefix)) {
    lines.shift();
    dropped++;
  }
  return lines.length ? `${prev}\n${lines.join('\n')}` : prev;
}

// 【续 50 B8】数 logs 末尾有多少行时间戳等于 cursor(即下次 --since 会被重复返回的行数)
function countCursorTail(logs: string, cursor: string): number {
  if (!logs) return 0;
  const prefix = `[${cursor}] `;
  const arr = logs.split('\n');
  let count = 0;
  for (let i = arr.length - 1; i >= 0 && arr[i].startsWith(prefix); i--) count++;
  return count;
}

export function useContainerLogs(
  api: UnraidApiService | null,
  containerId: string | null,
  enabled: boolean
) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveRefresh, setLiveRefresh] = useState(false);
  const mounted = useRef(true);
  // 【续 50 B8】增量游标:服务端 cursor + 当前 logs 末尾同 cursor 时间戳的行数
  const cursorRef = useRef<string | null>(null);
  const cursorTailCountRef = useRef(0);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !api || !containerId) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setLogs('');
    // 【续 50 B8】换容器/重新加载时重置增量游标
    cursorRef.current = null;
    cursorTailCountRef.current = 0;

    api
      .getContainerLogs(containerId, 200)
      .then((result) => {
        if (!mounted.current || !active) return;
        if (result.success) {
          setLogs(result.logs || '');
          // 【续 50 B8】记录增量基准:cursor + 末尾同时间戳行数(--since 含边界,去重用)
          cursorRef.current = result.cursor ?? null;
          cursorTailCountRef.current = result.cursor
            ? countCursorTail(result.logs || '', result.cursor)
            : 0;
          setError(null);
        } else {
          setError(result.error || '获取日志失败');
        }
      })
      .catch(() => {
        if (!mounted.current || !active) return;
        setError('获取日志失败');
      })
      .finally(() => {
        if (!mounted.current || !active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, containerId, enabled]);

  usePolling(
    async () => {
      if (!enabled || !api || !containerId || !liveRefresh) return;
      // 【续 50 B8】带上 cursor 作 since 增量拉取(无 cursor 时等同普通 tail-100)
      const result = await api.getContainerLogs(containerId, 100, cursorRef.current ?? undefined);
      if (!mounted.current) return;
      if (!result.success) return;

      const batch = result.logs ?? '';
      const prevCursor = cursorRef.current;
      if (!prevCursor) {
        // 【续 50 B8】无增量基准(服务端没给 cursor):快照替换 —— 旧代码无条件
        // prev+'\n'+batch 拼接,每 5s 把同样的 tail-100 重复追加,内容无限膨胀
        if (batch) setLogs(batch);
      } else if (batch) {
        setLogs((prev) => mergeIncrementalLogs(prev, batch, prevCursor, cursorTailCountRef.current));
      }
      // batch 为空(无新行)时服务端原样回显 since,游标不动
      if (result.cursor && batch) {
        cursorRef.current = result.cursor;
        cursorTailCountRef.current = countCursorTail(batch, result.cursor);
      }
    },
    5000,
    enabled && liveRefresh
  );

  return useMemo(
    () => ({
      logs,
      loading,
      error,
      liveRefresh,
      setLiveRefresh,
    }),
    [logs, loading, error, liveRefresh]
  );
}
