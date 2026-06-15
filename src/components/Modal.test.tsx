// 【续 50 C3】Modal maxHeight / flex 布局测试
// 修复前:`max-h-[${maxHeight}]` 模板拼接 Tailwind 扫描不到(dist CSS 无该类),
// 且三元只对 vertical 拼 max-h,flex 分支无限高、容器非 flex,子级 flex-1 全失效
// (DiskCleanupModal Top30 列表小屏溢出不可达);修复后 maxHeight 走 inline style
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal 【续 50 C3】', () => {
  it('vertical 布局:style.maxHeight 生效,不再出现扫描不到的 max-h-[...] 类', () => {
    render(
      <Modal open onClose={vi.fn()} maxHeight="500px" title="测试">
        <div>内容</div>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('500px');
    expect(dialog.className).toContain('overflow-y-auto');
    expect(dialog.className).not.toContain('max-h-[');
  });

  it('flex 布局:容器有 flex/flex-col/overflow-hidden 类,style.maxHeight 同样生效', () => {
    render(
      <Modal open onClose={vi.fn()} maxHeight="88vh" layout="flex">
        <header>头</header>
        <ul className="flex-1 overflow-y-auto">
          <li>行</li>
        </ul>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('88vh');
    expect(dialog.className).toContain('flex');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('overflow-hidden');
  });

  it('默认 maxHeight 为 90dvh', () => {
    render(
      <Modal open onClose={vi.fn()}>
        <div>内容</div>
      </Modal>
    );
    expect(screen.getByRole('dialog').style.maxHeight).toBe('90dvh');
  });

  it('open=false 不渲染', () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <div>内容</div>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
