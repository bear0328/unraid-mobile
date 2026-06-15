// 【续 46.2 2026-07-18】useNow 单测
// 覆盖:初始返回当前时间 / interval tick 后更新 / 多次 tick 持续 / unmount 清理 interval
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始返回当前时间', () => {
    const t0 = Date.now();
    const { result } = renderHook(() => useNow(1000));
    expect(result.current).toBeGreaterThanOrEqual(t0);
  });

  it('interval tick 后更新为更晚时间', () => {
    const { result } = renderHook(() => useNow(1000));
    const before = result.current;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBeGreaterThan(before);
  });

  it('多次 tick 持续更新', () => {
    const { result } = renderHook(() => useNow(500));
    const before = result.current;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current - before).toBeGreaterThanOrEqual(2000);
  });

  it('unmount 时清理 interval', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
