// 【阶段 P2-性能 - 2026-06-17 续 35-5】App 顶层挂载
// 5min 周期采 Web Vitals 写 LS,产生趋势数据
// 单独抽组件,App.tsx 看起来更干净
import { useEffect } from 'react';
import { useWebVitals } from '../hooks/useWebVitals';
import { recordVitalsSnapshot } from '../utils/webVitals';

const INTERVAL_MS = 5 * 60 * 1000; // 5min

export default function VitalsAutoRecorder() {
  const vitals = useWebVitals();

  useEffect(() => {
    // 立即采一次(首屏 LCP/FCP 出来就记)
    recordVitalsSnapshot(vitals);
    const t = setInterval(() => recordVitalsSnapshot(vitals), INTERVAL_MS);
    return () => clearInterval(t);
    // vitals 是对象引用,interval 内部每次都拿到最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
