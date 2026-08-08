// 【续 50 D6b】CommandPalette 键盘导航测试
// 核心回归:0 结果时按方向键,旧代码 (i±1)%0=NaN → activeIdx 变 NaN,
// 越界修正 effect(NaN>=0 为 false)救不回来 → 键盘导航卡死到重开
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

// 【续 88 2026-08-08】导出配置备份的 blob 下载测试
// 核心回归:a.click() 后不能同步 revokeObjectURL(iOS Safari 下载静默失败),
// 必须 setTimeout 延迟 1s(同 FavoritesCard 教训)
describe('CommandPalette 导出备份(续 88)', () => {
  let createSpy: ReturnType<typeof vi.fn>;
  let revokeSpy: ReturnType<typeof vi.fn>;
  // jsdom 可能没原生 URL.createObjectURL/revokeObjectURL,记原值以便还原
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    createSpy = vi.fn(() => 'blob:fake-backup');
    revokeSpy = vi.fn();
    globalThis.URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    globalThis.URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    // runCommand 用 requestAnimationFrame 延迟执行 run(),stub 成同步,与 fake timer 解耦
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.URL.createObjectURL = origCreate;
    globalThis.URL.revokeObjectURL = origRevoke;
  });

  it('导出配置备份:click 后不同步 revoke,1s 后才 revoke(iOS Safari)', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('option', { name: /导出配置备份/ }));
    // run() 经 stubbed rAF 同步执行:已创建 blob URL
    expect(createSpy).toHaveBeenCalledTimes(1);
    // 关键:同步阶段不 revoke(旧代码这里已调用)
    expect(revokeSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-backup');
  });
});
