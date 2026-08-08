// 【阶段 P2-性能 - 2026-06-17 续 35-5】App 顶层挂载
// 5min 周期采 Web Vitals 写 LS,产生趋势数据
// 单独抽组件,App.tsx 看起来更干净
import { useEffect, useRef } from 'react';
import { useWebVitals } from '../hooks/useWebVitals';
import { recordVitalsSnapshot } from '../utils/webVitals';

const INTERVAL_MS = 5 * 60 * 1000; // 5min

export default function VitalsAutoRecorder() {
  const vitals = useWebVitals();

  // 【续 88 2026-08-08】vitals 经 ref 跟进最新值:effect 是 [] deps,
  // 闭包直接捕获 vitals 永远是首渲染的空值(useWebVitals 每次 setState 返回新对象)
  const vitalsRef = useRef(vitals);
  vitalsRef.current = vitals;

  useEffect(() => {
    // 立即采一次(首屏 LCP/FCP 出来就记)
    recordVitalsSnapshot(vitalsRef.current);
    const t = setInterval(() => recordVitalsSnapshot(vitalsRef.current), INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return null;
}
