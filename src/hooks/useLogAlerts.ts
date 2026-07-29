// 【续 78】从 pages/Logs.tsx 拆出(纯结构移动,不改行为)
// 关键字告警:error/fatal/panic 等命中时弹 toast,60s 冷却去重
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './useToast';

// 【续 33-2】告警关键字(大小写不敏感),正则字面量
const ALERT_KEYWORDS = [
  /\berror\b/i,
  /\bfatal\b/i,
  /\bpanic\b/i,
  /\bexception\b/i,
  /\bcritical\b/i,
  /\bsegfault\b/i,
  /\boom[\s-]/i,
  /\bkilled\b/i,
];
// 60s 内同关键字只告警 1 次(去重)
const ALERT_COOLDOWN_MS = 60_000;

/**
 * 日志关键字告警:开关状态 + 扫描函数。
 * @param setFilter 告警 toast「查看」按钮点击后设置 Logs 页的过滤词
 */
export function useLogAlerts(setFilter: (filter: string) => void) {
  // 【续 33-2】关键字告警开关(默认关,避免老日志触发)
  const [alertEnabled, setAlertEnabled] = useState(false);
  // 【续 50 C5】ref 同步告警开关供 loadLog 读取:loadLog 的 useCallback deps 不能加
  // alertEnabled(会重建 loadLog → 触发 loadLog effect 整页重拉 + 重置 5s 自动刷新节拍),
  // 不加则闭包捕获旧值 —— 切开关后自动刷新仍用旧开关。ref 两者都避开
  const alertEnabledRef = useRef(alertEnabled);
  useEffect(() => {
    alertEnabledRef.current = alertEnabled;
  }, [alertEnabled]);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const toast = useToast();

  // 【续 33-2】扫描行命中关键字 → toast(60s 冷却去重)
  const scanAlerts = useCallback(
    (lines: string[]) => {
      const now = Date.now();
      const lastMap = lastAlertRef.current;
      for (const line of lines) {
        // 取每行第一个命中的关键字
        for (const re of ALERT_KEYWORDS) {
          const m = line.match(re);
          if (!m) continue;
          const keyword = m[0].toLowerCase();
          const last = lastMap.get(keyword) ?? 0;
          if (now - last < ALERT_COOLDOWN_MS) break; // 此关键字冷却中,跳过
          lastMap.set(keyword, now);
          // 取行尾摘要(80 字符)
          const snippet = line.trim().length > 80 ? line.trim().slice(0, 77) + '...' : line.trim();
          toast.warning(`🔔 日志告警 [${m[0]}]: ${snippet}`, 6000, {
            label: '查看',
            onClick: () => {
              // 跳到 /logs 并触发过滤
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('filter', m[0]);
                window.history.pushState({}, '', url);
                setFilter(m[0]);
              }
            },
          });
          break; // 一行只告警一次
        }
      }
    },
    [toast, setFilter]
  );

  return { alertEnabled, setAlertEnabled, alertEnabledRef, scanAlerts };
}
