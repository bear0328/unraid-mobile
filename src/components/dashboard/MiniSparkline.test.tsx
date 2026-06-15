// 【阶段 P2-监控图 - 2026-06-17 续 33-1】MiniSparkline 测试
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniSparkline from './MiniSparkline';

describe('MiniSparkline', () => {
  it('空数据时显示占位文本', () => {
    render(<MiniSparkline data={[]} emptyText="暂无趋势" />);
    expect(screen.getByText('暂无趋势')).toBeInTheDocument();
  });

  it('有数据时渲染 SVG 折线 + 终点圆点', () => {
    const { container } = render(<MiniSparkline data={[10, 20, 30, 40, 50]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // 折线 path
    const path = container.querySelector('path[stroke]');
    expect(path).toBeInTheDocument();
    // 终点圆
    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
  });

  it('显示 label + current 文本', () => {
    render(<MiniSparkline data={[1, 2, 3]} label="CPU 趋势" current="42%" />);
    expect(screen.getByText('CPU 趋势')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('全 0 数据不抛错(避免 range=0 除零)', () => {
    const { container } = render(<MiniSparkline data={[0, 0, 0, 0]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('单点数据不抛错', () => {
    const { container } = render(<MiniSparkline data={[42]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
