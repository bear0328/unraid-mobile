// 【续 36-3】useMultiContainerStats 单元测试
// 【续 45.5 2026-06-30】新加 shouldSkipTick 测试:
// 60s 内 cache 命中时跳过 tick,跟 useContainersData 同步,0 graphql。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiContainerStats } from './useMultiContainerStats';

// 【续 46】隔离 tick 间隔:本测试断言依赖固定 10s 间隔,用 mock 覆盖全局可配的 usePollInterval
vi.mock('./usePollInterval', () => ({
  usePollInterval: () => 10000,
}));

const IDS = ['nginx', 'redis', 'pihole'];

function makeFetcher(
  data: Record<string, { cpuPercent: number; memPercent: number }> = {
    nginx: { cpuPercent: 5, memPercent: 30 },
    redis: { cpuPercent: 2, memPercent: 10 },
    pihole: { cpuPercent: 1, memPercent: 20 },
  }
) {
  return vi.fn(async () => data);
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom 默认 document.hidden = false
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMultiContainerStats 基础', () => {
  it('mount 时立即跑一次 fetcher', async () => {
    const fetcher = makeFetcher();
    renderHook(() => useMultiContainerStats({ ids: IDS, fetcher }));
    // fetcher 是 async,但 mount 同步 fire,等一个 microtask flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ids=[] 时不启动 polling(不调 fetcher)', async () => {
    const fetcher = makeFetcher();
    renderHook(() => useMultiContainerStats({ ids: [], fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).not.toHaveBeenCalled();

    // 推进 60s 也不应触发
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('正常 polling:10s 一次 fetcher(无 shouldSkipTick)', async () => {
    const fetcher = makeFetcher();
    renderHook(() => useMultiContainerStats({ ids: IDS, fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // mount

    // 推进 3 个 POLL_MS 窗口(3 × 10s = 30s)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(4); // 1 mount + 3 ticks
  });
});

describe('useMultiContainerStats shouldSkipTick (续 45.5)', () => {
  it('shouldSkipTick 返 true → tick 跳过 fetcher', async () => {
    const fetcher = makeFetcher();
    const shouldSkip = vi.fn(() => true);
    renderHook(() => useMultiContainerStats({ ids: IDS, fetcher, shouldSkipTick: shouldSkip }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // mount 仍 fire(建立 history)

    // 推进 60s → 6 个 tick 全跳过
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(1); // 只 mount 那 1 次
    // shouldSkipTick 在 6 个 tick 各被调一次
    expect(shouldSkip.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('shouldSkipTick 返 false → tick 正常 fire', async () => {
    const fetcher = makeFetcher();
    renderHook(() => useMultiContainerStats({ ids: IDS, fetcher, shouldSkipTick: () => false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // 推进 30s → 3 个 tick
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(4); // 1 mount + 3 ticks
  });

  it('shouldSkipTick 从 true 切到 false → 立即恢复 fetch(下个 tick)', async () => {
    const fetcher = makeFetcher();
    let skip = true;
    renderHook(() =>
      useMultiContainerStats({ ids: IDS, fetcher, shouldSkipTick: () => skip })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // skip=true 时:3 个 tick 全跳
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);

    // 切到 false:下个 tick 应 fire
    skip = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('useMultiContainerStats 跟 visibility 配合 (续 45.4)', () => {
  it('tab 隐藏时 tick 跳过但 setTimeout 仍调度', async () => {
    const fetcher = makeFetcher();
    renderHook(() => useMultiContainerStats({ ids: IDS, fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // 模拟 tab 隐藏
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 推进 3 × 10s:tab 隐藏,tick 全跳
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);

    // tab 可见回来 → 【续 45.7 2026-07-01】不立即 fire,等 30s 兜底
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // 30s 内不 fire

    // 30s 后 idle 兜底 fire 1 次 (bypass shouldSkipTick, isFirstTick reset)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // 之后正常 polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
