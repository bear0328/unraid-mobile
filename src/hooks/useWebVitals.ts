// 【阶段 P2-性能 - 2026-06-17 续 33-8】Web Vitals 采集 hook
// 不引 web-vitals 库(~5KB),用浏览器原生 PerformanceObserver 实现 LCP/CLS/INP
// 输出 vitals 对象给 Debug 页展示
// 指标:
//   LCP (Largest Contentful Paint): 最大内容绘制,2.5s 内为佳
//   CLS (Cumulative Layout Shift):   累计布局偏移,< 0.1 为佳
//   INP (Interaction to Next Paint): 交互到下次绘制,< 200ms 为佳(FID 的替代)
//   FCP (First Contentful Paint):    首次内容绘制,< 1.8s 为佳
import { useEffect, useState } from 'react';

export interface Vitals {
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  /** PerformanceMemory(Chromium only) */
  memory: { usedJSHeapSize: number; totalJSHeapSize: number } | null;
}

const EMPTY: Vitals = { lcp: null, cls: null, inp: null, fcp: null, memory: null };

export function useWebVitals(): Vitals {
  const [vitals, setVitals] = useState<Vitals>(EMPTY);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

    // FCP / LCP
    let lcpValue = 0;
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            lcpValue = entry.startTime;
            setVitals((v) => ({ ...v, lcp: lcpValue }));
          } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
            setVitals((v) => ({ ...v, fcp: entry.startTime }));
          }
        }
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      po.observe({ type: 'paint', buffered: true });
    } catch {
      // 浏览器不支持
    }

    // CLS
    let clsValue = 0;
    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // shiftValue(无 layout-shift 的输入)
          if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
            setVitals((v) => ({ ...v, cls: clsValue }));
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // 忽略
    }

    // INP(替代 FID,event timing)
    let worstInp = 0;
    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const dur = (entry as PerformanceEntry & { duration: number }).duration;
          if (dur > worstInp) {
            worstInp = dur;
            setVitals((v) => ({ ...v, inp: dur }));
          }
        }
      });
      inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    } catch {
      // 部分浏览器不支持 event timing
    }

    // 内存(Chromium only,firefox/safari 无)
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
    ).memory;
    if (memory) {
      setVitals((v) => ({
        ...v,
        memory: { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize },
      }));
      const t = setInterval(() => {
        setVitals((v) => ({
          ...v,
          memory: memory.usedJSHeapSize
            ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize }
            : null,
        }));
      }, 5000);
      // cleanup
      return () => clearInterval(t);
    }
  }, []);

  return vitals;
}
