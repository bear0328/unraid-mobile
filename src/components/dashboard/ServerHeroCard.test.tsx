// 【续 68 GUI 焕新】ServerHeroCard 测试
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ServerHeroCard from './ServerHeroCard';

describe('ServerHeroCard', () => {
  it('渲染服务器名 / 阵列状态 pill / uptime', () => {
    render(
      <ServerHeroCard
        name="Tower"
        uptime="15d 7h"
        arrayStatus="Started"
        isRefreshing={false}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('Tower')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText(/运行时长: 15d 7h/)).toBeInTheDocument();
  });

  it('默认值:name/uptime/arrayStatus 缺省时显示占位', () => {
    render(<ServerHeroCard isRefreshing={false} onRefresh={() => {}} />);
    expect(screen.getByText('unRAID Server')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/运行时长: N\/A/)).toBeInTheDocument();
  });

  it('点刷新按钮触发 onRefresh;isRefreshing 时禁用 + 显示「后台刷新中…」', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <ServerHeroCard name="T" isRefreshing={false} onRefresh={onRefresh} />
    );
    fireEvent.click(screen.getByRole('button', { name: '手动刷新 Dashboard 数据' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<ServerHeroCard name="T" isRefreshing={true} onRefresh={onRefresh} />);
    expect(screen.getByRole('button', { name: '手动刷新 Dashboard 数据' })).toBeDisabled();
    expect(screen.getByText('后台刷新中…')).toBeInTheDocument();
  });

  it('cacheAgeMs 超阈值 → StaleBadge 出现(琥珀色在渐变底上为 amber-200)', () => {
    render(
      <ServerHeroCard
        name="T"
        isRefreshing={false}
        onRefresh={() => {}}
        cacheAgeMs={2 * 60 * 1000}
      />
    );
    expect(screen.getByText(/·2m 前/)).toBeInTheDocument();
  });

  it('主色渐变 class 存在(跟随用户自选主色的 CSS 覆盖)', () => {
    const { container } = render(
      <ServerHeroCard name="T" isRefreshing={false} onRefresh={() => {}} />
    );
    expect(container.innerHTML).toMatch(/bg-gradient-to-br from-primary-600 to-primary-500/);
  });
});
