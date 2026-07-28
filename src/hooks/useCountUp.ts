// 【续 68 GUI 焕新】数值变化平滑过渡(count-up)
// 首帧直接给终值(不从 0 起跳)——首屏/测试看到的就是真实值;
// 仅在值**变化**时(polling 刷新)做 300ms easeOutCubic 插值。
// prefers-reduced-motion 下直接跳终值。
import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, durationMs = 300): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof requestAnimationFrame !== 'function') {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    // 不用 rAF 回调时间戳:jsdom 等环境它与 performance.now() 不同源,会算出负 t
    const tick = () => {
      const t = Math.min(Math.max((performance.now() - start) / durationMs, 0), 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}
