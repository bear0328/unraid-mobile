// 【阶段 P2-性能告警 - 2026-06-17 续 34-4】性能预算告警
// 订阅 useWebVitals,LCP > 4s / CLS > 0.25 / INP > 500ms 触发时弹 toast
// 同一指标 5 分钟内最多告警 1 次(避免噪声)
// 用户可在 Debug 页关闭(默认关,免得新部署/慢机器一直弹)
import { useEffect, useRef } from 'react';
import { useWebVitals } from '../hooks/useWebVitals';
import { useToast } from '../hooks/useToast';
import { isPerfAlertEnabled } from './perfAlertStorage';

const COOLDOWN_MS = 5 * 60 * 1000;

interface Threshold {
  name: string;
  goodAt: number;
  badAt: number;
  unit: string;
  hint: string;
}

const THRESHOLDS: Array<{ metric: 'lcp' | 'cls' | 'inp'; t: Threshold }> = [
  {
    metric: 'lcp',
    t: { name: 'LCP', goodAt: 2500, badAt: 4000, unit: 'ms', hint: '最大内容绘制 > 4s,首屏卡顿' },
  },
  {
    metric: 'cls',
    t: { name: 'CLS', goodAt: 0.1, badAt: 0.25, unit: '', hint: '布局偏移 > 0.25,视觉跳动严重' },
  },
  {
    metric: 'inp',
    t: { name: 'INP', goodAt: 200, badAt: 500, unit: 'ms', hint: '交互延迟 > 500ms,操作卡' },
  },
];

export default function PerformanceBudgetAlert() {
  const vitals = useWebVitals();
  const toast = useToast();
  const lastAlertRef = useRef<Record<string, number>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    // 启动后等首次数据(避免历史数据触发)
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (!isPerfAlertEnabled()) return;

    const now = Date.now();
    for (const { metric, t } of THRESHOLDS) {
      const value = vitals[metric];
      if (value === null || value === undefined) continue;
      if (value <= t.badAt) continue;
      const last = lastAlertRef.current[metric] ?? 0;
      if (now - last < COOLDOWN_MS) continue;
      lastAlertRef.current[metric] = now;
      toast.warning(
        `🐌 ${t.name} 告警: ${value.toFixed(metric === 'cls' ? 3 : 0)}${t.unit} (${t.hint})`,
        6000,
        {
          label: '查看',
          onClick: () => {
            window.location.href = '/debug';
          },
        }
      );
    }
  }, [vitals, toast]);

  return null;
}
