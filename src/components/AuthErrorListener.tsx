// 【阶段 P1-401 - 2026-06-17 续 29-4】全局监听 401 鉴权失败
// 挂在 App 顶层,监听 graphql.ts 派发的 'unraid-auth-error' 事件
// 行为:toast 报错 + 跳 /settings
// 为什么不在 graphqlRequest 内部跳:那里没有 router context,需要 hook
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';

// 【续 50 B7】同一次 401 会被派两次事件:graphql.ts 请求返 401/UNAUTHENTICATED 时派一次,
// App.tsx 汇总 health 报告发现 graphql status=401 再派一次(中间隔 200ms 跳路由延迟,光靠
// 判断 pathname 拦不住)。1s 窗口内只响应第一个,避免双 toast + 双跳路由
const DEDUPE_WINDOW_MS = 1000;

export default function AuthErrorListener() {
  const navigate = useNavigate();
  const toast = useToast();
  const lastHandledAtRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const now = Date.now();
      if (now - lastHandledAtRef.current < DEDUPE_WINDOW_MS) return;
      lastHandledAtRef.current = now;
      const detail = (e as CustomEvent).detail as { reason?: string; source?: string };
      toast.error(`API 鉴权失败 (${detail.reason ?? 'unknown'}),请在设置页更新密钥`, 5000);
      // 延迟 200ms 让 toast 出现再跳
      setTimeout(() => navigate('/settings'), 200);
    };
    window.addEventListener('unraid-auth-error', handler);
    return () => window.removeEventListener('unraid-auth-error', handler);
  }, [navigate, toast]);

  return null;
}
