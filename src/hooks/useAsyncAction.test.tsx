// 【续 39-3】useAsyncAction 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncAction } from './useAsyncAction';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useAsyncAction', () => {
  it('run 调用 fn 并返回结果', async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const { result } = renderHook(() => useAsyncAction(fn));
    let r: number | null = null;
    await act(async () => {
      r = await result.current.run(5);
    });
    expect(r).toBe(10);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fn 抛错时 error 填充', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fail');
    });
    const { result } = renderHook(() => useAsyncAction(fn, { errorText: '操作失败' }));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('run 返回 null 表示出错(成功返回非 null)', async () => {
    const { result } = renderHook(() => useAsyncAction(async () => 'ok'));
    let r: string | null = 'pending';
    await act(async () => {
      r = await result.current.run();
    });
    expect(r).toBe('ok');
  });

  it('loading 在执行期间为 true', async () => {
    let resolveFn!: (v: string) => void;
    const fn = vi.fn(
      async () =>
        new Promise<string>((r) => {
          resolveFn = r;
        })
    );
    const { result } = renderHook(() => useAsyncAction(fn));
    act(() => {
      void result.current.run();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveFn('x');
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
  });

  it('快速连点只显示最后一次结果(seq 防止 race)', async () => {
    let callIdx = 0;
    const fn = vi.fn(async (n: number) => {
      const i = ++callIdx;
      await new Promise((r) => setTimeout(r, n === 1 ? 30 : 5));
      return { i, n };
    });
    const { result } = renderHook(() => useAsyncAction(fn));
    const p1 = result.current.run(1);
    const p2 = result.current.run(2);
    const [r1, r2] = await Promise.all([p1, p2]);
    // 后调用的(2)应该先返回;result 反映最后一次
    expect(r2).toEqual({ i: 2, n: 2 });
    expect(r1).toBeNull(); // 被后调用覆盖
  });

  it('silent 模式不弹错误 toast 但仍记录 error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('quiet');
    });
    const { result } = renderHook(() => useAsyncAction(fn, { silent: true }));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe('quiet');
  });

  it('reset 清空 error 和 loading', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error('x');
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe('x');
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});
