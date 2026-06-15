// 【阶段 P2-1 - 2026-06-16 续 12】usePolling hook 测试
// 覆盖:立即执行 / 间隔触发 / 卸载清理 / enabled 关闭清理 / callback 引用更新
// 用 vi.useFakeTimers 控制 setInterval
// 【续 45 2026-06-26】新行为测试:jitter / respectVisibility / skipInitialIf
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from './usePolling';

// 默认用 0 jitter 让旧测试稳定;新行为测试单独覆盖 jitter
const NO_JITTER = { initialJitterMs: 0 };
const NO_VISIBILITY = { respectVisibility: false, ...NO_JITTER };

describe('usePolling (基础行为)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('挂载时立即执行一次 callback', () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('按 delay 间隔重复执行 callback', () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
    expect(cb).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    // 1000ms 时第 2 次,2000ms 时第 3 次,3000ms 时第 4 次
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('卸载时清理 interval(不再触发)', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
    expect(cb).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('enabled=false 时不执行,enabled=true 后立即执行一次', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => usePolling(cb, 1000, enabled, NO_JITTER),
      { initialProps: { enabled: false } }
    );
    expect(cb).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('callback 引用变化时,内部 ref 同步(下次 tick 用新函数)', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => usePolling(cb, 1000, true, NO_JITTER),
      { initialProps: { cb: cb1 } }
    );
    expect(cb1).toHaveBeenCalledTimes(1);

    // 切换 callback
    rerender({ cb: cb2 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // 下次 tick 用 cb2
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb1).toHaveBeenCalledTimes(1); // 没增加
  });

  it('delay 变化时重建 interval', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ delay }: { delay: number }) => usePolling(cb, delay, true, NO_JITTER),
      { initialProps: { delay: 1000 } }
    );
    expect(cb).toHaveBeenCalledTimes(1);

    // 切到 500ms
    rerender({ delay: 500 });
    // 切换 delay 时 useEffect 重跑,立即再执行一次
    expect(cb).toHaveBeenCalledTimes(2);
    // 500ms 后
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('异步 callback 也能被 setInterval 触发', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
    expect(cb).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// 【续 45 2026-06-26】新行为
describe('usePolling (续 45 新行为)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialJitterMs', () => {
    it('默认有 jitter:挂载时不会立即 fire(Math.random=0.99 → 接近 maxJitter)', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const cb = vi.fn();
      // delay=10000 → maxJitter=min(1000, 2500)=1000 → jitter ≈ 990ms
      renderHook(() => usePolling(cb, 10000));
      // 挂载时 setTimeout(jitter) 已排队,还没到时间不 fire
      expect(cb).toHaveBeenCalledTimes(0);

      // 推进 < jitter:仍然 0
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(cb).toHaveBeenCalledTimes(0);

      // 推进超过 jitter:1 次
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(cb).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('initialJitterMs=0 禁用 jitter(挂载立即 fire)', () => {
      const cb = vi.fn();
      renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('skipInitialIf', () => {
    it('skipInitialIf 返 true → 挂载时不立即 fire', () => {
      const cb = vi.fn();
      const skipIf = vi.fn(() => true);
      renderHook(() => usePolling(cb, 1000, true, { skipInitialIf: skipIf, ...NO_JITTER }));
      // 即使 jitter=0,挂载也不应 fire
      expect(cb).toHaveBeenCalledTimes(0);
      expect(skipIf).toHaveBeenCalledTimes(1);
    });

    it('skipInitialIf 返 false → 挂载立即 fire', () => {
      const cb = vi.fn();
      const skipIf = vi.fn(() => false);
      renderHook(() => usePolling(cb, 1000, true, { skipInitialIf: skipIf, ...NO_JITTER }));
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('skipInitialIf 即使跳过,interval 仍正常触发', () => {
      const cb = vi.fn();
      const skipIf = vi.fn(() => true);
      renderHook(() => usePolling(cb, 1000, true, { skipInitialIf: skipIf, ...NO_VISIBILITY }));
      expect(cb).toHaveBeenCalledTimes(0);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('shouldSkipTick', () => {
    it('shouldSkipTick 返 true → 每次 tick 跳过 callback', () => {
      const cb = vi.fn();
      const shouldSkip = vi.fn(() => true);
      renderHook(() =>
        usePolling(cb, 1000, true, { shouldSkipTick: shouldSkip, ...NO_VISIBILITY })
      );
      expect(cb).toHaveBeenCalledTimes(1); // mount fire(走 fire() 不走 trackedFire)

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(1); // tick 跳过

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(1); // tick 跳过

      // shouldSkipTick 由 trackedFire 调用:2 次 tick 各一次
      expect(shouldSkip).toHaveBeenCalledTimes(2);
    });

    it('shouldSkipTick 返 false → tick 正常 fire', () => {
      const cb = vi.fn();
      renderHook(() => usePolling(cb, 1000, true, NO_VISIBILITY));
      expect(cb).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('shouldSkipTick 在 skipInitialIf + tick 都生效(cache 命中场景)', () => {
      const cb = vi.fn();
      const cacheCheck = vi.fn(() => true);
      renderHook(() =>
        usePolling(cb, 1000, true, {
          skipInitialIf: cacheCheck,
          shouldSkipTick: cacheCheck,
          ...NO_VISIBILITY,
        })
      );
      expect(cb).toHaveBeenCalledTimes(0); // mount skip

      // 5 次 tick 全跳过(cache 一直命中)
      for (let i = 0; i < 5; i++) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
      expect(cb).toHaveBeenCalledTimes(0);
    });
  });

  describe('respectVisibility (tab 隐藏暂停)', () => {
    it('tab 不可见时 interval 不触发', () => {
      const cb = vi.fn();
      // 默认 respectVisibility=true
      renderHook(() => usePolling(cb, 1000, true, NO_JITTER));
      expect(cb).toHaveBeenCalledTimes(1);

      // 模拟 tab 隐藏
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // 推进 5 个 interval:都不触发
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(cb).toHaveBeenCalledTimes(1); // 没有新调用

      // 模拟 tab 可见回来:【续 45.7 2026-07-01】不立即补 fire (旧行为会补 1 次唤盘)
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(cb).toHaveBeenCalledTimes(1); // 30s 内不 fire (useResumeActivity 接管)

      // 之后 interval 正常
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('respectVisibility=false 保留旧行为:tab 隐藏不暂停', () => {
      const cb = vi.fn();
      renderHook(() => usePolling(cb, 1000, true, NO_VISIBILITY));
      expect(cb).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // 不暂停:照常触发 3 次(原 1 + 3)
      expect(cb).toHaveBeenCalledTimes(4);
    });
  });
});

// 【续 50 C12】inline skip 函数不再让主 effect 拆建、interval 重置
describe('usePolling (续 50 C12 deps 稳定化)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inline skipInitialIf:父组件重渲染不重置 interval(不多 fire)', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ tag }: { tag: number }) =>
        usePolling(cb, 1000, true, {
          // 每次 render 都是新箭头(模拟 Dashboard.tsx 的调用方式)
          skipInitialIf: () => tag < 0,
          ...NO_VISIBILITY,
        }),
      { initialProps: { tag: 0 } }
    );
    expect(cb).toHaveBeenCalledTimes(1); // mount fire

    rerender({ tag: 1 }); // 新 inline skipInitialIf 引用
    expect(cb).toHaveBeenCalledTimes(1); // effect 未重启(旧行为会立即再 fire 一次)

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(2); // 只有正常 tick

    rerender({ tag: 2 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(3); // 节拍未被 render 频率劫持
  });
});
