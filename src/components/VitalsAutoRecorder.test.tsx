// 【续 88 2026-08-08】VitalsAutoRecorder 陈旧闭包回归测试
// 修复前:effect [] deps,setInterval 闭包捕获首渲染的 vitals(全 null),
//   之后每 5min 记录的都是空快照;修复后经 vitalsRef 拿到最新值
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import VitalsAutoRecorder from './VitalsAutoRecorder';
import { useWebVitals } from '../hooks/useWebVitals';
import type { Vitals } from '../hooks/useWebVitals';
import { recordVitalsSnapshot } from '../utils/webVitals';

vi.mock('../hooks/useWebVitals', () => ({
  useWebVitals: vi.fn(),
}));
vi.mock('../utils/webVitals', () => ({
  recordVitalsSnapshot: vi.fn(),
}));

const EMPTY: Vitals = { lcp: null, cls: null, inp: null, fcp: null, memory: null };
const INTERVAL_MS = 5 * 60 * 1000;

describe('VitalsAutoRecorder(续 88 陈旧闭包)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useWebVitals).mockReturnValue(EMPTY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('mount 立即记录一次当前 vitals', () => {
    render(<VitalsAutoRecorder />);
    expect(recordVitalsSnapshot).toHaveBeenCalledTimes(1);
    expect(recordVitalsSnapshot).toHaveBeenLastCalledWith(EMPTY);
  });

  it('interval 触发时记录的是最新 vitals(非首渲染空值)', () => {
    const { rerender } = render(<VitalsAutoRecorder />);
    expect(recordVitalsSnapshot).toHaveBeenCalledTimes(1);

    // vitals 更新(LCP/FCP 出来了),组件重渲染(effect 不重启)
    const latest: Vitals = { lcp: 1234, cls: 0.02, inp: 96, fcp: 480, memory: null };
    vi.mocked(useWebVitals).mockReturnValue(latest);
    rerender(<VitalsAutoRecorder />);

    // 推进 5min → interval 触发,记录的必须是 latest
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS);
    });
    expect(recordVitalsSnapshot).toHaveBeenCalledTimes(2);
    expect(recordVitalsSnapshot).toHaveBeenLastCalledWith(latest);

    // 再推进一个周期,仍是最新值(确认不是只更新一次)
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS);
    });
    expect(recordVitalsSnapshot).toHaveBeenCalledTimes(3);
    expect(recordVitalsSnapshot).toHaveBeenLastCalledWith(latest);
  });
});
