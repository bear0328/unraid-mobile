// 【续 50 D6b】CommandPalette 键盘导航测试
// 核心回归:0 结果时按方向键,旧代码 (i±1)%0=NaN → activeIdx 变 NaN,
// 越界修正 effect(NaN>=0 为 false)救不回来 → 键盘导航卡死到重开
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from './CommandPalette';

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette open={true} onClose={() => {}} />
    </MemoryRouter>
  );
}

describe('CommandPalette(续 50 D6b)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('有结果时 ArrowDown/ArrowUp 正常移动选中态', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/输入命令/);
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('0 结果时按方向键不炸,恢复输入后选中态/导航不卡死', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/输入命令/);

    // 制造 0 结果
    fireEvent.change(input, { target: { value: 'zzz-不可能匹配' } });
    expect(screen.getByText('无匹配命令')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    // 0 结果按方向键:不抛异常、不产生任何选中态
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('无匹配命令')).toBeInTheDocument();

    // 清空恢复有结果:旧 bug 下 activeIdx 已是 NaN,这里没有任何 option 被选中且方向键失效
    fireEvent.change(input, { target: { value: '' } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // 方向键仍然工作(没卡死)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });
});
