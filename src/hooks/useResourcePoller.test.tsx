// 【续 39-3】useResourcePoller 单元测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResourcePoller } from './useResourcePoller';

const BASELINE = 'test-baseline';
const COOLDOWN = 'test-cooldown';

interface Item {
  id: string;
  state: string;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useResourcePoller 基础', () => {
  it('首次跑不触发 onChange(baseline 还没建立)', async () => {
    const fetcher = vi.fn(async () => [{ id: 'a', state: 'running' }]);
    const onChange = vi.fn();
    renderHook(() =>
      useResourcePoller({
        enabled: true,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 1000,
        pollMs: 10_000, // 大 pollMs:200ms 窗口内只跑 mount tick 一次,便于断言 fetcher 次数
        onChange,
      })
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('第二次跑状态变化触发 onChange', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', state: 'running' }])
      .mockResolvedValueOnce([{ id: 'a', state: 'stopped' }]);
    const onChange = vi.fn();
    renderHook(() =>
      useResourcePoller({
        enabled: true,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 0,
        pollMs: 50,
        onChange,
      })
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].id).toBe('a');
    expect(onChange.mock.calls[0][1]).toBe('running');
  });

  it('cooldown 期内不重复触发', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', state: 'running' }])
      .mockResolvedValueOnce([{ id: 'a', state: 'stopped' }])
      .mockResolvedValueOnce([{ id: 'a', state: 'running' }])
      .mockResolvedValueOnce([{ id: 'a', state: 'stopped' }]);
    const onChange = vi.fn();
    renderHook(() =>
      useResourcePoller({
        enabled: true,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 60_000,
        pollMs: 50,
        onChange,
      })
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('enabled=false 不拉', async () => {
    const fetcher = vi.fn(async () => []);
    renderHook(() =>
      useResourcePoller({
        enabled: false,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 1000,
        pollMs: 50,
      })
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetcher 抛错不毁整个 hook(onError 触发)', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    renderHook(() =>
      useResourcePoller({
        enabled: true,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 1000,
        pollMs: 50,
        onError,
      })
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(onError).toHaveBeenCalled();
  });
});

// 【续 50 C12】inline skip 函数不再让主 effect 拆建、轮询节拍被 render 频率劫持
describe('useResourcePoller (续 50 C12 deps 稳定化)', () => {
  it('inline skipInitialIf:重渲染不重启 effect(fetcher 不多拉)', async () => {
    const fetcher = vi.fn(async () => [{ id: 'a', state: 'running' }]);
    const { rerender } = renderHook(
      ({ tag }: { tag: number }) =>
        useResourcePoller({
          enabled: true,
          fetcher,
          keyOf: (i: Item) => i.id,
          stateOf: (i: Item) => i.state,
          baselineKey: BASELINE,
          cooldownKey: COOLDOWN,
          cooldownMs: 0,
          pollMs: 10_000,
          // 每次 render 都是新箭头(模拟 useContainerEventWatcher 的调用方式)
          skipInitialIf: () => tag < 0,
        }),
      { initialProps: { tag: 0 } }
    );
    await vi.advanceTimersByTimeAsync(0); // mount tick
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ tag: 1 }); // 新 inline skipInitialIf 引用
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(1); // effect 未重启(旧行为会重跑 mount tick → 2)

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2); // 正常 poll tick 仍按节拍走
  });
});

// 【续 88 2026-08-08】onActive else 分支回归:tab 隐藏清掉挂起 timer(missedTicks 未加),
// 切回后 30s 内活跃必须重新调度轮询(修复前 onActive 什么都不做 → 轮询永久停)
describe('useResourcePoller (续 88 onActive else 回归)', () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => {
    // 恢复 document.hidden,避免污染同文件其他测试
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('tab 隐藏(有挂起 timer)→ 切回 → 30s 内触发活跃 → 轮询继续调度', async () => {
    const fetcher = vi.fn(async () => [{ id: 'a', state: 'running' }]);
    renderHook(() =>
      useResourcePoller({
        enabled: true,
        fetcher,
        keyOf: (i: Item) => i.id,
        stateOf: (i: Item) => i.state,
        baselineKey: BASELINE,
        cooldownKey: COOLDOWN,
        cooldownMs: 1000,
        pollMs: 50,
        resumeDelayMs: 30_000,
      })
    );
    await vi.advanceTimersByTimeAsync(0); // mount tick,此后挂起 50ms 的 poll timer
    expect(fetcher).toHaveBeenCalledTimes(1);

    // tab 隐藏:visibility 处理器清掉挂起 timer(missedTicks 不增加)
    setHidden(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(1); // 轮询已停

    // 切回 tab:useResumeActivity 启动 30s 倒计时 + 用户活跃监听
    setHidden(false);
    // 30s 内用户操作 → onActive(missedTicks===0 走 else:scheduleNext 重新调度)
    window.dispatchEvent(new Event('pointerdown'));

    await vi.advanceTimersByTimeAsync(60);
    expect(fetcher).toHaveBeenCalledTimes(2); // 修复前恒为 1(轮询永久停)
    await vi.advanceTimersByTimeAsync(60);
    expect(fetcher).toHaveBeenCalledTimes(3); // 节拍恢复,非只补一次
  });
});
