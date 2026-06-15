// 【续 50 B8】useContainerLogs liveRefresh 增量合并测试
// 覆盖:带 cursor 时连续刷新只追加新行(不重复) / 服务端不给 cursor 时快照替换(不拼接)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainerLogs } from './useContainerLogs';
import type { UnraidApiService } from '../services';

type LogsResult = { success: boolean; logs?: string; cursor?: string | null; error?: string };

// 队列式假 api:每次调用取下一项,取空后重复最后一项
function makeApi(queue: LogsResult[]) {
  const getContainerLogs = vi.fn(() => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    return Promise.resolve(next);
  });
  return { api: { getContainerLogs } as unknown as UnraidApiService, getContainerLogs };
}

const flush = async () => {
  await act(async () => {});
};

describe('useContainerLogs(续 50 B8 liveRefresh 增量)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('带 cursor:连续两次 liveRefresh 不出现重复行,刷新请求带 since', async () => {
    const { api, getContainerLogs } = makeApi([
      {
        success: true,
        logs: '[2026-07-19T10:00:01Z] a\n[2026-07-19T10:00:02Z] b',
        cursor: '2026-07-19T10:00:02Z',
      },
      // docker --since 含边界:首批增量会重复返回上批最后一行 [10:00:02Z] b
      {
        success: true,
        logs: '[2026-07-19T10:00:02Z] b\n[2026-07-19T10:00:03Z] c',
        cursor: '2026-07-19T10:00:03Z',
      },
      // 无新行时服务端只返回边界行
      { success: true, logs: '[2026-07-19T10:00:03Z] c', cursor: '2026-07-19T10:00:03Z' },
    ]);

    const { result } = renderHook(() => useContainerLogs(api, 'container:abc', true));
    await flush();
    expect(result.current.logs).toBe('[2026-07-19T10:00:01Z] a\n[2026-07-19T10:00:02Z] b');

    act(() => {
      result.current.setLiveRefresh(true);
    });
    // 首次 fire(usePolling mount 立即执行,jitter ≤ delay/4 = 1250ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(result.current.logs).toBe(
      '[2026-07-19T10:00:01Z] a\n[2026-07-19T10:00:02Z] b\n[2026-07-19T10:00:03Z] c'
    );
    // 增量请求带上了上批 cursor 作 since
    expect(getContainerLogs).toHaveBeenLastCalledWith('container:abc', 100, '2026-07-19T10:00:02Z');

    // 第二次刷新:无新行,只有边界行 → 不得再追加
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.logs).toBe(
      '[2026-07-19T10:00:01Z] a\n[2026-07-19T10:00:02Z] b\n[2026-07-19T10:00:03Z] c'
    );
    expect(getContainerLogs).toHaveBeenLastCalledWith('container:abc', 100, '2026-07-19T10:00:03Z');

    // 第三次刷新:仍无重复
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.logs).toBe(
      '[2026-07-19T10:00:01Z] a\n[2026-07-19T10:00:02Z] b\n[2026-07-19T10:00:03Z] c'
    );
  });

  it('无 cursor:liveRefresh 走快照替换,内容不增长', async () => {
    const { api } = makeApi([
      { success: true, logs: 'L1\nL2' },
      { success: true, logs: 'L2\nL3' },
    ]);

    const { result } = renderHook(() => useContainerLogs(api, 'container:abc', true));
    await flush();
    expect(result.current.logs).toBe('L1\nL2');

    act(() => {
      result.current.setLiveRefresh(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(result.current.logs).toBe('L2\nL3'); // 替换而非 "L1\nL2\nL2\nL3"

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.logs).toBe('L2\nL3'); // 再次刷新不增长
  });
});
