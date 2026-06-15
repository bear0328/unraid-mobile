// 【续 50 C1】ActionButtons 单触发测试
// 修复前按钮同时挂 .onclick(绕沙箱)和 React onClick,真实浏览器一次点击
// onConfirm 触发两次(重命名"成功仍弹失败 toast"即此因);修复后只走 .onclick
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionButtons } from './SheetModal';

function renderButtons(overrides: Partial<Parameters<typeof ActionButtons>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ActionButtons
      confirmText="确认"
      onConfirm={onConfirm}
      onCancel={onCancel}
      loading={false}
      disabled={false}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe('ActionButtons 【续 50 C1】', () => {
  it('点击 confirm 一次,onConfirm 只调用一次(不再双触发)', () => {
    const { onConfirm, onCancel } = renderButtons();
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('点击 cancel 一次,onCancel 只调用一次(不再双触发)', () => {
    const { onConfirm, onCancel } = renderButtons();
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disabled 时点击 confirm 不触发 onConfirm', () => {
    const { onConfirm } = renderButtons({ disabled: true });
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('loading 时 confirm/cancel 都不触发', () => {
    const { onConfirm, onCancel } = renderButtons({ loading: true, loadingText: '处理中...' });
    fireEvent.click(screen.getByText('处理中...'));
    fireEvent.click(screen.getByText('取消'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
