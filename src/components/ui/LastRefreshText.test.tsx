// 【续 74】LastRefreshText 渲染测试
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LastRefreshText from './LastRefreshText';
import { markRefreshed } from '../../utils/lastRefresh';

describe('LastRefreshText', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('从未刷新(null)→ 不渲染', () => {
    const { container } = render(<LastRefreshText />);
    expect(container).toBeEmptyDOMElement();
  });

  it('有刷新记录 → 显示「更新于 HH:MM:SS」', () => {
    markRefreshed();
    render(<LastRefreshText />);
    expect(screen.getByText(/更新于 \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });
});
