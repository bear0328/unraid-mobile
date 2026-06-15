// 【阶段 P1-toast - 2026-06-17 续 30-2】错误自动 toast 通知
// 订阅 errorReporter,新增错误时弹 toast(去重 + 限频,避免刷屏)
// 用法:在 App 顶层调用 useErrorToast(),无需返回值
// 行为:
//   1. 同一 message 60s 内不重复 toast
//   2. 启动时 localStorage 已有的错误不弹(避免老错误干扰)
//   3. 5s 内最多 3 次 toast
import { useEffect, useRef } from 'react';
import { useToast } from './useToast';
import { subscribe, getErrors, type ErrorRecord } from '../utils/errorReporter';

const DEDUPE_WINDOW_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX = 3;

export function useErrorToast(): void {
  const toast = useToast();
  const seenMessages = useRef<Map<string, number>>(new Map());
  const rateLimitCount = useRef<number>(0);
  const rateLimitResetAt = useRef<number>(0);
  const initialized = useRef<boolean>(false);

  useEffect(() => {
    // 启动时只取"启动后新增的错误",不弹老的
    const initialIds = new Set(getErrors().map((e) => e.id));
    initialized.current = true;

    return subscribe((errors: ErrorRecord[]) => {
      if (!initialized.current) return;
      // 找出"新增的"错误(不在初始 snapshot 里)
      const newOnes = errors.filter((e) => !initialIds.has(e.id));
      if (newOnes.length === 0) return;
      // 加入 known ids
      newOnes.forEach((e) => initialIds.add(e.id));

      const now = Date.now();

      // 限频
      if (now > rateLimitResetAt.current) {
        rateLimitCount.current = 0;
        rateLimitResetAt.current = now + RATE_LIMIT_WINDOW_MS;
      }

      for (const err of newOnes) {
        // 限频
        if (rateLimitCount.current >= RATE_LIMIT_MAX) break;
        // 去重
        const lastSeen = seenMessages.current.get(err.message) ?? 0;
        if (now - lastSeen < DEDUPE_WINDOW_MS) continue;
        seenMessages.current.set(err.message, now);
        rateLimitCount.current++;

        const label =
          err.source === 'react'
            ? '渲染错误'
            : err.source === 'window'
              ? '运行时错误'
              : err.source === 'unhandledrejection'
                ? '异步错误'
                : '错误';
        toast.error(`${label}: ${err.message}`, 5000);
      }
    });
  }, [toast]);
}
