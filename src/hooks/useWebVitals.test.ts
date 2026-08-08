// 【续 88 2026-08-08】useWebVitals PerformanceObserver 泄漏回归测试
// 修复前:3 个 observer(LCP/CLS/INP)从不 disconnect,effect 只在 Chromium memory
//   分支 return cleanup;修复后 unmount 统一 disconnect + 清 memory interval
// jsdom 无 PerformanceObserver / performance.memory,均用 stub 注入
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebVitals } from './useWebVitals';

class MockPerformanceObserver {
  static instances: MockPerformanceObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(public callback: any) {
    MockPerformanceObserver.instances.push(this);
  }
}

describe('useWebVitals(续 88 observer 泄漏)', () => {
  beforeEach(() => {
    MockPerformanceObserver.instances = [];
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // 清掉测试注入的 performance.memory
    delete (performance as unknown as { memory?: unknown }).memory;
  });

  it('unmount 时 disconnect 全部 PerformanceObserver(LCP/CLS/INP)', () => {
    const { unmount } = renderHook(() => useWebVitals());
    expect(MockPerformanceObserver.instances).toHaveLength(3);
    for (const po of MockPerformanceObserver.instances) {
      expect(po.disconnect).not.toHaveBeenCalled();
    }

    unmount();
    for (const po of MockPerformanceObserver.instances) {
      expect(po.disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it('Chromium memory 分支:unmount 同时 disconnect observer + 清 5s interval', () => {
    vi.useFakeTimers();
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 100, totalJSHeapSize: 200 },
      configurable: true,
    });
    const { result, unmount } = renderHook(() => useWebVitals());
    expect(result.current.memory).toEqual({ usedJSHeapSize: 100, totalJSHeapSize: 200 });
    expect(vi.getTimerCount()).toBe(1); // 5s memory interval 挂着

    unmount();
    expect(vi.getTimerCount()).toBe(0); // interval 清理保留(原 cleanup 行为)
    for (const po of MockPerformanceObserver.instances) {
      expect(po.disconnect).toHaveBeenCalledTimes(1); // 修复前 memory 分支的 cleanup 不 disconnect
    }
  });
});
