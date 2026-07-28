// 【续 68 GUI 焕新】useCountUp 测试
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from './useCountUp';

describe('useCountUp', () => {
  it('首帧直接给终值(不从 0 起跳)', () => {
    const { result } = renderHook(() => useCountUp(42.5));
    expect(result.current).toBe(42.5);
  });

  it('值不变时不启动动画,display 保持', () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), {
      initialProps: { v: 10 },
    });
    rerender({ v: 10 });
    expect(result.current).toBe(10);
  });

  it('值变化后经 rAF 动画收敛到终值(jsdom 无 matchMedia,走 rAF 分支)', async () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), {
      initialProps: { v: 10 },
    });
    act(() => {
      rerender({ v: 80 });
    });
    // jsdom 的 rAF 以 ~16ms timer 驱动,waitFor 等动画跑完(300ms 内)
    await vi.waitFor(() => expect(result.current).toBe(80), { timeout: 1000 });
  });
});
