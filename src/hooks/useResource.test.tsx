// 【续 39-2】useResource 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useResource } from './useResource';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useResource', () => {
  it('挂载时立即 fetch', async () => {
    const fetcher = vi.fn(async () => 'hello');
    const { result } = renderHook(() => useResource(fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('hello');
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fetcher 抛错时 error 字段填充', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('boom');
  });

  it('refresh 重新拉取', async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ++n);
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.data).toBe(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe(2);
  });

  it('immediate=false 时挂载不 fetch,refresh 才 fetch', async () => {
    const fetcher = vi.fn(async () => 'x');
    const { result } = renderHook(() => useResource(fetcher, { immediate: false }));
    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('x');
  });

  it('deps 变化时自动重 fetch', async () => {
    const a = vi.fn(async () => 'A');
    const { result, rerender } = renderHook(
      ({ fetcher }) => useResource(fetcher, { deps: [fetcher] }),
      {
        initialProps: { fetcher: a },
      }
    );
    await waitFor(() => expect(result.current.data).toBe('A'));
    const b = vi.fn(async () => 'B');
    rerender({ fetcher: b });
    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(b).toHaveBeenCalled();
  });

  it('setData 可手动改 data(乐观更新)', async () => {
    const fetcher = vi.fn(async () => 1);
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.setData(99));
    expect(result.current.data).toBe(99);
  });
});
