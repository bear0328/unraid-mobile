// 【续 97 P1-1】DraggableCard 排序控件测试:32px 触控面积 / 首末位禁用 / 键盘方向键
// 【续 109】排序控件改手柄 + 弹出菜单:默认只渲染手柄;点击弹菜单;拖拽不弹;
// Esc/外点关闭;去 hover 背景(iOS 粘性 hover 白框)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DraggableCard from './DraggableCard';

function renderCard(index = 1, totalCount = 3, onMove = vi.fn()) {
  render(
    <DraggableCard id="cpu" index={index} totalCount={totalCount} onMove={onMove}>
      <div>content</div>
    </DraggableCard>
  );
  return onMove;
}

function getHandle() {
  return screen.getByLabelText('拖动重排 cpu (位置 2/3)');
}

describe('DraggableCard 排序控件', () => {
  it('默认只渲染手柄(不渲染上移/下移),手柄触控面积 ≥32px', () => {
    renderCard();
    const handle = getHandle();
    expect(handle.className).toContain('min-w-[32px]');
    expect(handle.className).toContain('min-h-[32px]');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  // 【续 109】去 hover 背景(iOS 粘性 hover 残留白框),只留 active 即时反馈 + focus 环
  it('手柄无 hover 背景类,保留 active 底色与 focus-visible 环', () => {
    renderCard();
    const handle = getHandle();
    expect(handle.className).not.toMatch(/hover:bg-/);
    expect(handle.className).not.toMatch(/(^|\s)bg-gray-/);
    expect(handle.className).toContain('active:bg-gray-200/80');
    expect(handle.className).toContain('focus-visible:ring-2');
  });

  it('点击手柄 → 弹出排序菜单(上移/下移)', () => {
    renderCard();
    fireEvent.click(getHandle());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '上移' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '下移' })).toBeInTheDocument();
  });

  it('中间位置:点菜单「上移/下移」→ onMove(index, index±1) 且菜单关闭', () => {
    const onMove = renderCard(1, 3);
    fireEvent.click(getHandle());
    fireEvent.click(screen.getByRole('menuitem', { name: '上移' }));
    expect(onMove).toHaveBeenCalledWith(1, 0);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(getHandle());
    fireEvent.click(screen.getByRole('menuitem', { name: '下移' }));
    expect(onMove).toHaveBeenCalledWith(1, 2);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('首位禁用「上移」', () => {
    const onMove = renderCard(0, 3);
    fireEvent.click(screen.getByLabelText('拖动重排 cpu (位置 1/3)'));
    const up = screen.getByRole('menuitem', { name: '上移' });
    expect(up).toBeDisabled();
    fireEvent.click(up);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('末位禁用「下移」', () => {
    const onMove = renderCard(2, 3);
    fireEvent.click(screen.getByLabelText('拖动重排 cpu (位置 3/3)'));
    const down = screen.getByRole('menuitem', { name: '下移' });
    expect(down).toBeDisabled();
    fireEvent.click(down);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('手柄键盘方向键:ArrowUp/ArrowDown 调 onMove', () => {
    const onMove = renderCard(1, 3);
    fireEvent.keyDown(getHandle(), { key: 'ArrowUp' });
    expect(onMove).toHaveBeenCalledWith(1, 0);
    fireEvent.keyDown(getHandle(), { key: 'ArrowDown' });
    expect(onMove).toHaveBeenCalledWith(1, 2);
  });

  it('手柄键盘 Enter 开菜单', () => {
    renderCard();
    fireEvent.keyDown(getHandle(), { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('拖拽后不弹菜单(dragstart 抑制尾随 click),再次点击正常弹', () => {
    renderCard();
    const handle = getHandle();
    const dataTransfer = { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.pointerDown(handle);
    fireEvent.dragStart(handle, { dataTransfer, clientX: 10, clientY: 10 });
    fireEvent.dragEnd(handle, { dataTransfer });
    fireEvent.click(handle); // 拖拽尾随 click → 不弹
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(handle); // 新一轮点击 → 正常弹
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('Esc 关闭菜单', () => {
    renderCard();
    fireEvent.click(getHandle());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('菜单外点击关闭菜单', () => {
    renderCard();
    fireEvent.click(getHandle());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // 【续 108】拖拽预览:整卡 clone + 圆角/阴影/半透明,dragEnd 清理
  it('dragStart 创建整卡 clone 作 drag image,dragEnd 移除', () => {
    renderCard();
    const handle = getHandle();
    const setDragImage = vi.fn();
    const dataTransfer = { effectAllowed: '', setData: vi.fn(), setDragImage };
    fireEvent.dragStart(handle, { dataTransfer, clientX: 10, clientY: 10 });
    // setDragImage 被调用,预览是整卡 clone(含卡片内容)
    expect(setDragImage).toHaveBeenCalledTimes(1);
    const clone = setDragImage.mock.calls[0][0] as HTMLElement;
    expect(clone.textContent).toContain('content');
    expect(clone.style.position).toBe('fixed');
    expect(clone.style.opacity).toBe('0.9');
    expect(clone.style.borderRadius).toBe('0.75rem');
    expect(clone.style.transform).toBe('none');
    expect(document.body.contains(clone)).toBe(true);
    // dragEnd → clone 从 document 移除
    fireEvent.dragEnd(handle, { dataTransfer });
    expect(document.body.contains(clone)).toBe(false);
  });

  it('组件卸载时兜底清理残留 drag image clone', () => {
    const { unmount } = render(
      <DraggableCard id="cpu" index={1} totalCount={3} onMove={vi.fn()}>
        <div>content</div>
      </DraggableCard>
    );
    const handle = getHandle();
    const setDragImage = vi.fn();
    fireEvent.dragStart(handle, {
      dataTransfer: { effectAllowed: '', setData: vi.fn(), setDragImage },
      clientX: 10,
      clientY: 10,
    });
    const clone = setDragImage.mock.calls[0][0] as HTMLElement;
    expect(document.body.contains(clone)).toBe(true);
    unmount();
    expect(document.body.contains(clone)).toBe(false);
  });
});
