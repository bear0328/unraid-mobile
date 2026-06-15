// 【续 39-2】useLsState 单元测试
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLsState, useLsSubscription } from './useLsState';

const KEY = 'unraid-mobile-test-key';

beforeEach(() => {
  localStorage.clear();
});

describe('useLsState 基础', () => {
  it('LS 无值时用 default', () => {
    const { result } = renderHook(() => useLsState(KEY, { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it('LS 有值时用 LS', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 99 }));
    const { result } = renderHook(() => useLsState(KEY, { a: 1 }));
    expect(result.current[0]).toEqual({ a: 99 });
  });

  it('set 写 LS + 触发更新', () => {
    const { result } = renderHook(() => useLsState(KEY, { a: 1 }));
    act(() => {
      result.current[1]({ a: 2 });
    });
    expect(result.current[0]).toEqual({ a: 2 });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ a: 2 });
  });

  it('set 支持函数式', () => {
    const { result } = renderHook(() => useLsState(KEY, { a: 1 }));
    act(() => {
      result.current[1]((p) => ({ a: p.a + 1 }));
    });
    expect(result.current[0]).toEqual({ a: 2 });
  });

  it('LS 损坏回退 default', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useLsState(KEY, { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });
});

describe('useLsState 跨组件同步', () => {
  it('同 key 多 hook 同步更新', async () => {
    const { result: r1 } = renderHook(() => useLsState(KEY, 0));
    const { result: r2 } = renderHook(() => useLsState(KEY, 0));
    // setValueAndPersist 用 queueMicrotask 通知同 key 订阅者,需 async act flush 微任务
    await act(async () => {
      r1.current[1](42);
    });
    expect(r2.current[0]).toBe(42);
  });
});

describe('useLsSubscription', () => {
  it('订阅触发 fn', async () => {
    const seen: number[] = [];
    // renderHook 只返最后一个 hook 的返回值;useLsSubscription 返 void,
    // 用 ref 捕获 useLsState 的 [v, set] 才能在 act 里调 set
    const stateRef: { current: [number, (n: number) => void] | null } = { current: null };
    renderHook(() => {
      const [v, set] = useLsState(KEY, 0);
      stateRef.current = [v, set];
      useLsSubscription<number>(KEY, (v) => seen.push(v), { defaultValue: 0 });
    });
    await act(async () => {
      /* 同步初始化 push 0 */
    });
    expect(seen).toEqual([0]);
    await act(async () => {
      // 触发一次 set 推 1
      const set = stateRef.current![1];
      set(1);
    });
    expect(seen).toContain(1);
  });
});
