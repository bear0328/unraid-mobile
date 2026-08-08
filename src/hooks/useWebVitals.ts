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

    // 【续 88 2026-08-08】收集 observer 引用,unmount 统一 disconnect
    // (原来从不 disconnect,且只在 Chromium memory 分支 return cleanup → 3 个 observer 泄漏)
    const observers: PerformanceObserver[] = [];

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
      // 创建后立即入列:即便后续 observe 抛错,cleanup 也会 disconnect
      observers.push(po);
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
      observers.push(clsObserver);
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
      observers.push(inpObserver);
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
    let memoryTimer: ReturnType<typeof setInterval> | undefined;
    if (memory) {
      setVitals((v) => ({
        ...v,
        memory: { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize },
      }));
      memoryTimer = setInterval(() => {
        setVitals((v) => ({
          ...v,
          memory: memory.usedJSHeapSize
            ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize }
            : null,
        }));
      }, 5000);
    }

    // 【续 88 2026-08-08】统一 cleanup:disconnect 全部 observer + 清 memory interval
    return () => {
      for (const po of observers) po.disconnect();
      if (memoryTimer) clearInterval(memoryTimer);
    };
  }, []);

  return vitals;
}
