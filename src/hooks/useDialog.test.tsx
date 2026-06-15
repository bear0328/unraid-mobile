// 【阶段 P2-2 - 2026-06-16 续 14】useDialog hook 测试
// 覆盖:confirm/alert 流程 / close(true/false)/ 默认文案 / danger 标记 / 用户传 okText 覆盖默认
// 用 wrapper 函数绕开 result.current 在 act 闭包内/外 stale 问题
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialog } from './useDialog';

describe('useDialog', () => {
  it('初始 state 为 null', () => {
    const { result } = renderHook(() => useDialog());
    expect(result.current.state).toBeNull();
  });

  describe('confirm', () => {
    it('调 confirm 后 state 变 confirm 类型,close(false) resolve false', async () => {
      const { result } = renderHook(() => useDialog());
      let resolveValue: boolean | undefined;
      // 第一步 act:setState
      act(() => {
        result.current.confirm({ title: '删?', message: '不可恢复' }).then((v) => {
          resolveValue = v;
        });
      });
      // 同步 act 后 result.current 已更新
      expect(result.current.state?.type).toBe('confirm');
      expect(result.current.state?.opts.title).toBe('删?');

      // 第二步 act:close
      await act(async () => {
        result.current.close(false);
        // 等 promise 微任务结算
        await Promise.resolve();
      });
      expect(resolveValue).toBe(false);
      expect(result.current.state).toBeNull();
    });

    it('close(true) → confirm resolve(true)', async () => {
      const { result } = renderHook(() => useDialog());
      let resolveValue: boolean | undefined;
      act(() => {
        result.current.confirm({ title: '确认?', message: 'm' }).then((v) => {
          resolveValue = v;
        });
      });
      await act(async () => {
        result.current.close(true);
        await Promise.resolve();
      });
      expect(resolveValue).toBe(true);
    });

    it('默认 confirmText=确认 / cancelText=取消 / danger=false', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        // 不需要 await,promise pending 也行
        void result.current.confirm({ title: 't', message: 'm' });
      });
      const state = result.current.state;
      if (state?.type !== 'confirm') throw new Error('expected confirm state');
      expect(state.opts.confirmText).toBe('确认');
      expect(state.opts.cancelText).toBe('取消');
      expect(state.opts.danger).toBe(false);
    });

    it('用户传的 confirmText/cancelText 覆盖默认', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        void result.current.confirm({
          title: 't',
          message: 'm',
          confirmText: 'OK',
          cancelText: 'NO',
        });
      });
      const state = result.current.state;
      if (state?.type !== 'confirm') throw new Error('expected confirm state');
      expect(state.opts.confirmText).toBe('OK');
      expect(state.opts.cancelText).toBe('NO');
    });

    it('danger: true 透传', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        void result.current.confirm({ title: 't', message: 'm', danger: true });
      });
      const state = result.current.state;
      if (state?.type !== 'confirm') throw new Error('expected confirm state');
      expect(state.opts.danger).toBe(true);
    });
  });

  describe('alert', () => {
    it('调 alert 后 state 变 alert 类型', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        void result.current.alert({ title: '提示', message: 'm' });
      });
      expect(result.current.state?.type).toBe('alert');
    });

    it('默认 okText=知道了', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        void result.current.alert({ title: 't', message: 'm' });
      });
      const state = result.current.state;
      if (state?.type !== 'alert') throw new Error('expected alert state');
      expect(state.opts.okText).toBe('知道了');
    });

    it('用户传 okText 覆盖', () => {
      const { result } = renderHook(() => useDialog());
      act(() => {
        void result.current.alert({ title: 't', message: 'm', okText: 'Got it' });
      });
      const state = result.current.state;
      if (state?.type !== 'alert') throw new Error('expected alert state');
      expect(state.opts.okText).toBe('Got it');
    });

    it('close 时 alert resolve(void)', async () => {
      const { result } = renderHook(() => useDialog());
      let resolved = false;
      act(() => {
        result.current.alert({ title: 't', message: 'm' }).then(() => {
          resolved = true;
        });
      });
      await act(async () => {
        result.current.close(true); // alert 不接 result,任意值都行
        await Promise.resolve();
      });
      expect(resolved).toBe(true);
      expect(result.current.state).toBeNull();
    });
  });

  it('close 时若 state 为 null,不崩', () => {
    const { result } = renderHook(() => useDialog());
    expect(() => act(() => result.current.close(false))).not.toThrow();
    expect(result.current.state).toBeNull();
  });
});
