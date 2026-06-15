// 【阶段 P1-toast - 2026-06-17 续 30-2】useErrorToast 单测
// 覆盖原本 0% 的关键业务路径:
//   1. 启动期过滤(初始 localStorage 已有错误不弹)
//   2. 新增错误弹 toast(走 label 映射)
//   3. 错误源 label 映射(react/window/unhandledrejection/manual)
//   4. 去重(60s 内同 message 不重复)
//   5. 限频(5s 内最多 3 条)
//   6. 限频窗口过期重置(>5s 后能再弹)
//   7. unmount 退订
//
// 实现要点:
//   - 用 vi.spyOn('./useToast') mock 掉 useToast,直接断言 mockToast.error 调用
//   - 用 vi.setSystemTime 控制 Date.now()(去重/限频都靠时间)
//   - subscribe 立即触发一次 callback(读 localStorage 当前 snapshot),
//     useErrorToast 内部用 initialIds + initialized.current 过滤掉 snapshot,
//     所以"启动期不弹老错误"测试要在 renderHook 之前先 reportError
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as useToastModule from './useToast';
import { useErrorToast } from './useErrorToast';
import { reportError } from '../utils/errorReporter';

type ToastApi = {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
};

let mockToast: ToastApi;

beforeEach(() => {
  mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };
  vi.spyOn(useToastModule, 'useToast').mockReturnValue(mockToast as unknown as ReturnType<typeof useToastModule.useToast>);
  // 固定时间起点:每个测试用 vi.setSystemTime 单独控制,这里给个默认
  vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useErrorToast', () => {
  it('启动期过滤:render 之前 localStorage 已有的错误不弹 toast', () => {
    // 模拟"用户上次会话留下的错误":render 前先报告一条
    act(() => {
      reportError('启动前的老错误', 'window');
    });
    renderHook(() => useErrorToast());

    // subscribe 立即触发一次 snapshot,初始 set 已经包含 '启动前的老错误'
    // → newOnes 为空 → 不弹任何 toast
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('新增错误弹 toast(默认 5s duration)', () => {
    renderHook(() => useErrorToast());

    act(() => {
      reportError('新增错误', 'window');
    });

    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith('运行时错误: 新增错误', 5000);
  });

  it('错误源 label 映射 4 种', () => {
    renderHook(() => useErrorToast());

    // 前 3 个在 5s 限频窗口内能弹;第 4 个要跨过 5s 才能再弹
    act(() => {
      reportError('react 出错', 'react');
      reportError('window 出错', 'window');
      reportError('rejection 出错', 'unhandledrejection');
    });
    // 跨过 5s 限频窗口 → rateLimitCount 重置
    vi.setSystemTime(new Date('2026-06-20T00:00:06Z'));
    act(() => {
      reportError('manual 出错', 'manual');
    });

    expect(mockToast.error).toHaveBeenCalledTimes(4);
    expect(mockToast.error).toHaveBeenNthCalledWith(1, '渲染错误: react 出错', 5000);
    expect(mockToast.error).toHaveBeenNthCalledWith(2, '运行时错误: window 出错', 5000);
    expect(mockToast.error).toHaveBeenNthCalledWith(3, '异步错误: rejection 出错', 5000);
    expect(mockToast.error).toHaveBeenNthCalledWith(4, '错误: manual 出错', 5000);
  });

  it('去重:60s 内同 message 不重复弹', () => {
    renderHook(() => useErrorToast());

    // T+0s:第一次弹
    act(() => {
      reportError('重复消息', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);

    // T+30s:60s 窗口内,dedupe → 不弹
    vi.setSystemTime(new Date('2026-06-20T00:00:30Z'));
    act(() => {
      reportError('重复消息', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);

    // T+59s:仍 60s 内,dedupe → 不弹
    vi.setSystemTime(new Date('2026-06-20T00:00:59Z'));
    act(() => {
      reportError('重复消息', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);

    // T+61s:超 60s,能弹第 2 次
    vi.setSystemTime(new Date('2026-06-20T00:01:01Z'));
    act(() => {
      reportError('重复消息', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(2);
  });

  it('去重:不同 message 互不影响', () => {
    renderHook(() => useErrorToast());

    act(() => {
      reportError('msg-1', 'window');
      reportError('msg-2', 'window');
      reportError('msg-3', 'window');
    });

    expect(mockToast.error).toHaveBeenCalledTimes(3);
  });

  it('限频:5s 内最多弹 3 条', () => {
    renderHook(() => useErrorToast());

    act(() => {
      reportError('msg-a', 'window');
      reportError('msg-b', 'window');
      reportError('msg-c', 'window');
      // 第 4 条撞限频 → 不弹
      reportError('msg-d', 'window');
    });

    expect(mockToast.error).toHaveBeenCalledTimes(3);
    // 验证只弹了 a/b/c,没弹 d
    const messages = mockToast.error.mock.calls.map((c: unknown[]) => c[0]);
    expect(messages).toEqual(['运行时错误: msg-a', '运行时错误: msg-b', '运行时错误: msg-c']);
  });

  it('限频窗口过期重置:>5s 后又能弹 3 条', () => {
    renderHook(() => useErrorToast());

    // 第一波:3 条全弹,第 4 条被限频
    act(() => {
      reportError('msg-a', 'window');
      reportError('msg-b', 'window');
      reportError('msg-c', 'window');
      reportError('msg-d', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(3);

    // T+6s:超 5s 窗口,rateLimitCount 重置
    vi.setSystemTime(new Date('2026-06-20T00:00:06Z'));
    act(() => {
      reportError('msg-e', 'window');
    });
    // rateLimitCount 现在 = 1(msg-e 算新的第 1 条)
    expect(mockToast.error).toHaveBeenCalledTimes(4);
    expect(mockToast.error).toHaveBeenLastCalledWith('运行时错误: msg-e', 5000);

    // T+7s:还在新窗口,继续弹到 3 条上限
    act(() => {
      reportError('msg-f', 'window');
      reportError('msg-g', 'window');
      // 第 4 条又撞限频
      reportError('msg-h', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(6);
  });

  it('去重和限频交互:同 message 被去重时不算入限频名额', () => {
    renderHook(() => useErrorToast());

    act(() => {
      reportError('同一条', 'window'); // 弹(名额 1/3)
      reportError('不同-1', 'window'); // 弹(2/3)
      reportError('不同-2', 'window'); // 弹(3/3)
      reportError('同一条', 'window'); // dedupe → 不弹,名额不消耗
      // 名额还剩 0,新消息被限频
      reportError('新消息', 'window'); // 限频 → 不弹
    });

    expect(mockToast.error).toHaveBeenCalledTimes(3);
    const messages = mockToast.error.mock.calls.map((c: unknown[]) => c[0]);
    expect(messages).toEqual(['运行时错误: 同一条', '运行时错误: 不同-1', '运行时错误: 不同-2']);
  });

  it('unmount 后 reportError 不再触发 toast', () => {
    const { unmount } = renderHook(() => useErrorToast());

    act(() => {
      reportError('unmount 前的错误', 'window');
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      reportError('unmount 后', 'window');
    });
    // 监听器已删,新的 notify 不再回调
    expect(mockToast.error).toHaveBeenCalledTimes(1);
  });

  it('同一错误连续 reportError 多次:第一次弹,后续全部被去重', () => {
    renderHook(() => useErrorToast());

    act(() => {
      for (let i = 0; i < 10; i++) {
        reportError('刷屏消息', 'window');
      }
    });

    expect(mockToast.error).toHaveBeenCalledTimes(1);
  });
});
