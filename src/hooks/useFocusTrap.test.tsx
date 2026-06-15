// 【续 50 C4】useFocusTrap 对不稳定 onEscape 引用的稳定性测试
// 修复前 effect deps [open, onEscape],上层传 inline onClose → 父级任何重渲染
// effect 重跑:50ms 后 focusFirst 抢焦点(StackDetailModal 编辑 yaml 时后台刷新
// 即丢焦点),且 previouslyFocused 被覆盖,关闭后焦点还原失效
// 修复后 onEscape 走 ref,deps 只留 [open]
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function Trap({ open, onEscape }: { open: boolean; onEscape: () => void }) {
  const ref = useFocusTrap(open, onEscape);
  return (
    <div ref={ref}>
      <button data-testid="first">第一</button>
      <button data-testid="second">第二</button>
    </div>
  );
}

describe('useFocusTrap 【续 50 C4】', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('打开时自动 focus 第一个可聚焦元素', () => {
    const { getByTestId } = render(<Trap open onEscape={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('onEscape 引用变化的重渲染不重跑 focusFirst(不抢回焦点)', () => {
    const { rerender, getByTestId } = render(<Trap open onEscape={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(document.activeElement).toBe(getByTestId('first'));

    // 用户把焦点移到第二个元素(模拟正在编辑)
    act(() => {
      getByTestId('second').focus();
    });
    expect(document.activeElement).toBe(getByTestId('second'));

    // 父级重渲染,inline onEscape 每次都是新引用
    rerender(<Trap open onEscape={() => {}} />);
    rerender(<Trap open onEscape={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 修复前:effect 重跑,50ms 后焦点被抢回 first
    expect(document.activeElement).toBe(getByTestId('second'));
  });

  it('Esc 调用的是最新一次渲染的 onEscape', () => {
    const escA = vi.fn();
    const escB = vi.fn();
    const { rerender } = render(<Trap open onEscape={escA} />);
    rerender(<Trap open onEscape={escB} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(escB).toHaveBeenCalledTimes(1);
    expect(escA).not.toHaveBeenCalled();
  });

  it('open false→true 只记录一次焦点;打开期间重渲染不污染,关闭时还原到打开前元素', () => {
    const outer = document.createElement('button');
    document.body.appendChild(outer);
    outer.focus();
    expect(document.activeElement).toBe(outer);

    const { rerender, getByTestId } = render(<Trap open={false} onEscape={() => {}} />);
    rerender(<Trap open onEscape={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // 打开后焦点进弹窗
    expect(document.activeElement).toBe(getByTestId('first'));

    // 打开期间父级多次重渲染(新 onEscape 引用),不应重跑捕获/还原逻辑
    rerender(<Trap open onEscape={() => {}} />);
    rerender(<Trap open onEscape={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 关闭:焦点还原到打开前的 outer(修复前 previouslyFocused 被覆盖,还原失效)
    rerender(<Trap open={false} onEscape={() => {}} />);
    expect(document.activeElement).toBe(outer);
    outer.remove();
  });
});
