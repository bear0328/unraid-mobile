// 【续 97 P1-1】DraggableCard 排序控件测试:32px 触控面积 / 首末位禁用 /
// 点击与键盘方向键调 onMove
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

describe('DraggableCard 排序控件', () => {
  it('手柄 + 上移/下移按钮渲染,触控面积 ≥32px(min-w/min-h)', () => {
    renderCard();
    const handle = screen.getByLabelText('拖动重排 cpu (位置 2/3)');
    const up = screen.getByRole('button', { name: '上移 cpu' });
    const down = screen.getByRole('button', { name: '下移 cpu' });
    for (const el of [handle, up, down]) {
      expect(el.className).toContain('min-w-[32px]');
      expect(el.className).toContain('min-h-[32px]');
    }
  });

  it('中间位置:点上移/下移 → onMove(index, index±1)', () => {
    const onMove = renderCard(1, 3);
    fireEvent.click(screen.getByRole('button', { name: '上移 cpu' }));
    expect(onMove).toHaveBeenCalledWith(1, 0);
    fireEvent.click(screen.getByRole('button', { name: '下移 cpu' }));
    expect(onMove).toHaveBeenCalledWith(1, 2);
  });

  it('首位禁用上移 / 末位禁用下移', () => {
    const onMove = renderCard(0, 3);
    const up = screen.getByRole('button', { name: '上移 cpu' });
    expect(up).toBeDisabled();
    fireEvent.click(up);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('末位禁用下移', () => {
    const onMove = renderCard(2, 3);
    const down = screen.getByRole('button', { name: '下移 cpu' });
    expect(down).toBeDisabled();
    fireEvent.click(down);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('手柄键盘方向键:ArrowUp/ArrowDown 调 onMove', () => {
    const onMove = renderCard(1, 3);
    const handle = screen.getByLabelText('拖动重排 cpu (位置 2/3)');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(onMove).toHaveBeenCalledWith(1, 0);
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onMove).toHaveBeenCalledWith(1, 2);
  });
});
