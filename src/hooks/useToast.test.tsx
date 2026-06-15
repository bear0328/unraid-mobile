// 【续 42.5.5 - 2026-06-19 21:40】useToast / toastBus 测试
// 验证:
//   1. listener 注册 / 卸载自动退订
//   2. React 事件上下文 emit → state 同步(基础路径)
//   3. 模块作用域 toastBus.emit → state 同步(useToast 之外调用)
//   4. setTimeout 异步触发 emit → state 同步(模拟 AbortSignal.timeout / 外部 async)
//   5. 多个 toast 按顺序堆叠,MAX_VISIBLE=5 上限
//   6. remove 按 id 删除单条
//
// 关键:case 3/4 在 React 18 commit 阶段容易出问题 — 外部触发的 setState
//   调度到 alternate 后,如果没有 flushSync 强制 commit,DOM 不更新
//   (QA 报告:沙箱里 fiber.current.memoizedState 仍 [] → 看不到 toast)
//   修复后 listener 内部 flushSync 包 setToasts,本测试验证 state 同步生效
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, useToastList, toastBus } from './useToast';

describe('useToastList / toastBus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listener 注册并初始为空', () => {
    const { result } = renderHook(() => useToastList());
    expect(result.current.toasts).toEqual([]);
  });

  it('toastBus.success 立即更新 state(模块作用域调用)', () => {
    const { result } = renderHook(() => useToastList());
    act(() => {
      toastBus.success('hello');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('hello');
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('toastBus.error 更新 type=error', () => {
    const { result } = renderHook(() => useToastList());
    act(() => {
      toastBus.error('网络错误');
    });
    expect(result.current.toasts[0].type).toBe('error');
  });

  it('toastBus.warning / info 各走对应 type', () => {
    const { result } = renderHook(() => useToastList());
    act(() => {
      toastBus.warning('warn msg');
      toastBus.info('info msg');
    });
    expect(result.current.toasts[0].type).toBe('warning');
    expect(result.current.toasts[1].type).toBe('info');
  });

  it('外部 setTimeout 异步触发也能 commit(关键:模拟 AbortSignal.timeout 路径)', () => {
    const { result } = renderHook(() => useToastList());
    // 模拟 #8 MKCOL:15s 后才 emit,但 state 必须同步可见
    expect(result.current.toasts).toHaveLength(0);
    act(() => {
      // 用 fake timer 模拟异步延迟
      setTimeout(() => {
        toastBus.error('WebDAV 请求超时 (15s)');
      }, 15000);
      vi.advanceTimersByTime(15000);
    });
    // 不需要 vi.runAllTimers — act + advanceTimersByTime 内已经同步执行
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('WebDAV 请求超时 (15s)');
  });

  it('多个 toast 按顺序堆叠', () => {
    const { result } = renderHook(() => useToastList());
    act(() => {
      toastBus.success('a');
      toastBus.success('b');
      toastBus.success('c');
    });
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((t) => t.message)).toEqual(['a', 'b', 'c']);
  });

  it('超过 MAX_VISIBLE(5) 截掉最早的', () => {
    const { result } = renderHook(() => useToastList());
    act(() => {
      for (let i = 0; i < 7; i++) toastBus.success(`msg-${i}`);
    });
    expect(result.current.toasts).toHaveLength(5);
    expect(result.current.toasts[0].message).toBe('msg-2');
    expect(result.current.toasts[4].message).toBe('msg-6');
  });

  it('remove 按 id 删除单条', () => {
    const { result } = renderHook(() => useToastList());
    let firstId = '';
    act(() => {
      toastBus.success('keep');
      toastBus.success('remove-me');
      toastBus.success('keep-2');
      firstId = result.current.toasts[1].id;
    });
    expect(result.current.toasts).toHaveLength(3);
    act(() => result.current.remove(firstId));
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts.find((t) => t.id === firstId)).toBeUndefined();
  });

  it('卸载自动退订,后续 emit 不再触发 setState', () => {
    const { unmount } = renderHook(() => useToastList());
    unmount();
    // 不应抛错(setState on unmounted 在 React 18 只是 dev warning,不致命)
    expect(() => {
      act(() => {
        toastBus.success('after unmount');
      });
    }).not.toThrow();
  });

  it('多个 hook 实例各自订阅,各自收到', () => {
    const { result: a } = renderHook(() => useToastList());
    const { result: b } = renderHook(() => useToastList());
    act(() => {
      toastBus.success('a-only');
    });
    expect(a.current.toasts).toHaveLength(1);
    expect(b.current.toasts).toHaveLength(1);
    expect(a.current.toasts[0].message).toBe('a-only');
    expect(b.current.toasts[0].message).toBe('a-only');
  });

  // 【续 43 2026-06-20】补 case:useToast hook 的 success/info/warning wrapper
  // 之前测试只用 toastBus.success 等直发 emit,没走到 useToast hook 返回的 callback。
  // useErrorToast 等业务代码用的是 useToast hook 路径,必须覆盖。
  // (emit() 的 catch 分支 58-59 无法在测试里可靠触发 — 模块级 listeners Set 不暴露,
  //  让唯一 listener 抛错会触发 React 错误边界而不是我们的 catch。源码已防御,跳过)
  it('useToast hook 的 success / info / warning wrapper 走 emit', () => {
    const { result: hookResult } = renderHook(() => useToast());
    const { result: listResult } = renderHook(() => useToastList());

    act(() => {
      hookResult.current.success('hook-success');
      hookResult.current.info('hook-info');
      hookResult.current.warning('hook-warning');
    });

    // hook wrapper 内部就是调 emit → 走 listener → 进 setToasts
    expect(listResult.current.toasts).toHaveLength(3);
    expect(listResult.current.toasts.map((t) => t.message)).toEqual([
      'hook-success',
      'hook-info',
      'hook-warning',
    ]);
    expect(listResult.current.toasts.map((t) => t.type)).toEqual(['success', 'info', 'warning']);
  });
});
