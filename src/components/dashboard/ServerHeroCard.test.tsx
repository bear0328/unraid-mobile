// 【续 68 GUI 焕新】ServerHeroCard 测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ServerHeroCard from './ServerHeroCard';
import { markRefreshed } from '../../utils/lastRefresh';

// 【续 89b】meta.osUpdate 链接需要 serverUrl;组件只读 useApiConfig
vi.mock('../../hooks/useUnraidApi', () => ({
  useApiConfig: vi.fn(() => ({
    config: { serverUrl: 'http://192.168.6.140:8001' },
    isConfigured: true,
  })),
}));

describe('ServerHeroCard', () => {
  beforeEach(() => {
    localStorage.clear();
  });
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

  it('【续 74】全局有刷新记录 → 显示「更新于」(所有页签同一个值)', () => {
    markRefreshed();
    render(<ServerHeroCard name="T" isRefreshing={false} onRefresh={() => {}} />);
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
  });

  it('主色渐变 class 存在(跟随用户自选主色的 CSS 覆盖)', () => {
    const { container } = render(
      <ServerHeroCard name="T" isRefreshing={false} onRefresh={() => {}} />
    );
    expect(container.innerHTML).toMatch(/bg-gradient-to-br from-primary-600 to-primary-500/);
  });

  // ==== 续 89b:版本/license/更新提醒/外网地址 ====
  it('meta → 信息行显示版本 + license 标签 + 运行时长', () => {
    render(
      <ServerHeroCard
        name="T"
        uptime="1d 2h"
        meta={{ version: '7.3.0', regTy: 'LIFETIME', osUpdate: null }}
        isRefreshing={false}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText(/Unraid OS 7\.3\.0 · Lifetime · 运行时长: 1d 2h/)).toBeInTheDocument();
  });

  it('meta 缺失 → 信息行只有运行时长', () => {
    render(<ServerHeroCard name="T" uptime="3h" isRefreshing={false} onRefresh={() => {}} />);
    expect(screen.getByText('运行时长: 3h')).toBeInTheDocument();
    expect(screen.queryByText(/Unraid OS/)).not.toBeInTheDocument();
  });

  it('osUpdate → 显示「系统有更新」徽章,链接 serverUrl+link;无更新不显示', () => {
    const { rerender } = render(
      <ServerHeroCard
        name="T"
        meta={{ version: '7.3.0', regTy: 'PRO', osUpdate: { subject: 'Unraid 7.4.0 available', link: '/Tools/UpdateOS' } }}
        isRefreshing={false}
        onRefresh={() => {}}
      />
    );
    const badge = screen.getByText('系统有更新').closest('a');
    expect(badge).toHaveAttribute('href', 'http://192.168.6.140:8001/Tools/UpdateOS');
    expect(badge).toHaveAttribute('target', '_blank');

    rerender(
      <ServerHeroCard
        name="T"
        meta={{ version: '7.3.0', regTy: 'PRO', osUpdate: null }}
        isRefreshing={false}
        onRefresh={() => {}}
      />
    );
    expect(screen.queryByText('系统有更新')).not.toBeInTheDocument();
  });

  // 【续 94】外网地址行已整行移除(掩码/复制/aria-label 用例一并删除)
  it('【续 94】地址行不再渲染(无掩码/Eye/复制按钮)', () => {
    render(<ServerHeroCard name="T" isRefreshing={false} onRefresh={() => {}} />);
    expect(screen.queryByText('••••••••')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '显示外网地址' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('点击复制')).not.toBeInTheDocument();
    expect(screen.queryByText(/外网地址/)).not.toBeInTheDocument();
  });
});
