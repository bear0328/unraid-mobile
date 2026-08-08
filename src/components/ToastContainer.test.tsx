// 【续 88 2026-08-08】ToastContainer 测试
// 核心回归:旧代码 <ToastView onClose={() => remove(t.id)}> 行内箭头,
// 容器每次重渲染都产生新引用 → ToastView 自动消失 effect 重跑
// → 所有现存 toast 的计时被重置(toast 永远比预期晚消失)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ToastContainer from './ToastContainer';
import { toastBus } from '../hooks/useToast';

describe('ToastContainer(续 88)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toast 到时长自动消失;duration=0 不自动消失', () => {
    render(<ToastContainer />);
    act(() => {
      toastBus.success('auto', 1000);
      toastBus.info('sticky', 0);
    });
    expect(screen.getByText('auto')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText('auto')).not.toBeInTheDocument();
    expect(screen.getByText('sticky')).toBeInTheDocument();
  });

  it('新增 toast 不重置现存 toast 的自动消失计时', () => {
    render(<ToastContainer />);
    act(() => {
      toastBus.success('first', 1000);
    });
    // 500ms 后新增一个 → ToastContainer 重渲染
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      toastBus.success('second', 2000);
    });
    // 再推进 600ms:first 已存在 1100ms > 1000ms
    // 旧代码 first 的计时被重置会活到 1500ms,修复后应已消失
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText('first')).not.toBeInTheDocument();
    // second 创建于 500ms 处,1100ms 时才 600ms,仍在
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('点关闭按钮手动移除', () => {
    render(<ToastContainer />);
    act(() => {
      toastBus.success('closable', 0);
    });
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(screen.queryByText('closable')).not.toBeInTheDocument();
  });
});
