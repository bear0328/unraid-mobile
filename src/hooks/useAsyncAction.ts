// 【阶段 P2-优化 - 2026-06-17 续 39-3】useAsyncAction
// 替代 try/catch + setError + console.warn + toast.error 重复模式
// 自动 loading 态、错误 toast、自动上报 errorReporter
import { useCallback, useMemo, useRef, useState } from 'react';
import { reportError } from '../utils/errorReporter';
import { useToast } from './useToast';

export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  loading: boolean;
  error: string | null;
  run: (...args: TArgs) => Promise<TResult | null>;
  reset: () => void;
}

interface UseAsyncActionOptions {
  /** 成功 toast(可选) */
  successText?: string;
  /** 错误 toast 前缀(可选);最终消息 = prefix + ': ' + err.message */
  errorText?: string;
  /** 静默错误:不弹 toast,只 setError(默认 false) */
  silent?: boolean;
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  opts: UseAsyncActionOptions = {}
): UseAsyncActionResult<TArgs, TResult> {
  const { successText, errorText, silent = false } = opts;
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 防止快速连点导致 race condition
  const seqRef = useRef(0);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await fn(...args);
        if (seq !== seqRef.current) return null;
        if (successText) toast.success(successText);
        return result;
      } catch (e) {
        if (seq !== seqRef.current) return null;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        reportError(
          e instanceof Error ? e : new Error(String(e)),
          'manual',
          errorText ? `${errorText}: ${msg}` : 'useAsyncAction failed'
        );
        if (!silent && errorText) toast.error(errorText + ': ' + msg);
        return null;
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [fn, successText, errorText, silent, toast]
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return useMemo(() => ({ loading, error, run, reset }), [loading, error, run, reset]);
}
