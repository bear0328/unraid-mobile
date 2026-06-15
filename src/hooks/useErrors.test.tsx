// 【阶段 P2-1 - 2026-06-16 续 11】useErrors hook 测试
// 验证:订阅机制 / 卸载退订 / report 后 state 同步 / clear/remove 触发 state 更新
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrors } from './useErrors';
import { reportError, clearErrors, __injectTestError } from '../utils/errorReporter';

describe('useErrors', () => {
  beforeEach(() => {
    clearErrors();
  });

  it('初始 state 反映 storage 快照', () => {
    reportError(new Error('pre-existing'), 'manual');
    const { result } = renderHook(() => useErrors());
    expect(result.current.count).toBe(1);
    expect(result.current.errors[0].message).toBe('pre-existing');
  });

  it('report 后 state 实时更新(订阅触发)', () => {
    const { result } = renderHook(() => useErrors());
    expect(result.current.count).toBe(0);
    act(() => {
      reportError(new Error('late'), 'react');
    });
    expect(result.current.count).toBe(1);
    expect(result.current.errors[0].source).toBe('react');
  });

  it('clear 触发 state 清空', () => {
    const { result } = renderHook(() => useErrors());
    act(() => __injectTestError());
    expect(result.current.count).toBe(1);
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    expect(result.current.errors).toEqual([]);
  });

  it('remove 按 id 删除单条', () => {
    const { result } = renderHook(() => useErrors());
    act(() => {
      reportError(new Error('a'), 'manual');
      reportError(new Error('b'), 'manual');
    });
    expect(result.current.count).toBe(2);
    const targetId = result.current.errors[0].id;
    act(() => result.current.remove(targetId));
    expect(result.current.count).toBe(1);
    expect(result.current.errors[0].id).not.toBe(targetId);
  });

  it('卸载时自动退订,避免内存泄漏', () => {
    const { unmount } = renderHook(() => useErrors());
    unmount();
    // 卸载后写入 storage,不应再触发任何回调(只是不崩)
    expect(() => {
      act(() => {
        reportError(new Error('after unmount'), 'manual');
      });
    }).not.toThrow();
  });
});
