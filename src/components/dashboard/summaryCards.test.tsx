// 【续 89】VmSummaryCard + ContainerSummaryCard 展开框 单测
// 覆盖:VM 卡 空态 null / 计数+列表 / ?tab=vm 深链 / >5 折叠提示;
//       容器卡 收起 Top 5 / 展开全部(running + 其他状态)/ 收起还原
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UnraidDockerContainer, UnraidVM } from '../../services';

// ContainerSummaryCard 依赖:api hooks + 多容器 stats 轮询(读本地 stream,测试无需真数据)
vi.mock('../../hooks/useUnraidApi', () => ({
  useUnraidApi: vi.fn(() => null),
  useApiConfig: vi.fn(() => ({ config: null, isConfigured: false })),
}));
vi.mock('../../hooks/useMultiContainerStats', () => ({
  useMultiContainerStats: vi.fn(() => ({})),
}));

import VmSummaryCard from './VmSummaryCard';
import ContainerSummaryCard from './ContainerSummaryCard';

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

function makeVm(name: string, state: string): UnraidVM {
  return { id: `srv:${name}-uuid`, vmUuid: `${name}-uuid`, name, state };
}

function makeContainer(name: string, state: string): UnraidDockerContainer {
  return {
    id: `id-${name}`,
    containerId: `id-${name}`,
    name,
    image: `${name}:latest`,
    state,
    status: state,
  } as UnraidDockerContainer;
}

describe('VmSummaryCard', () => {
  it('loading → 骨架', () => {
    const { container } = renderWithRouter(<VmSummaryCard vms={[]} loading />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('加载完成后无 VM → 卡片整体不渲染', () => {
    const { container } = renderWithRouter(<VmSummaryCard vms={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('【续 89b】默认收起:只显示计数,无列表;点「展开列表」显示全部', async () => {
    const user = userEvent.setup();
    const vms = [makeVm('win11', 'running'), makeVm('ubuntu', 'shut off'), makeVm('pve', 'paused')];
    renderWithRouter(<VmSummaryCard vms={vms} />);
    expect(screen.getByText('虚拟机')).toBeInTheDocument();
    expect(screen.getByText('1/3 运行中')).toBeInTheDocument();
    // 收起:无列表
    expect(screen.queryByText('win11')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /展开列表 \(3\)/ }));
    expect(screen.getByText('win11')).toBeInTheDocument();
    expect(screen.getByText('ubuntu')).toBeInTheDocument();
    expect(screen.getByText('pve')).toBeInTheDocument();
    expect(screen.getByText('已停止')).toBeInTheDocument();
    expect(screen.getByText('已暂停')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /收起/ }));
    expect(screen.queryByText('win11')).not.toBeInTheDocument();
  });

  it('「管理 →」深链 /containers?tab=vm', () => {
    renderWithRouter(<VmSummaryCard vms={[makeVm('win11', 'running')]} />);
    const link = screen.getByText('管理 →').closest('a');
    expect(link).toHaveAttribute('href', '/containers?tab=vm');
  });

  it('【续 89b】VM 多于 5 个:展开后全部显示(无截断)', async () => {
    const user = userEvent.setup();
    const vms = Array.from({ length: 7 }, (_, i) => makeVm(`vm${i}`, 'running'));
    renderWithRouter(<VmSummaryCard vms={vms} />);
    await user.click(screen.getByRole('button', { name: /展开列表 \(7\)/ }));
    expect(screen.getByText('vm0')).toBeInTheDocument();
    expect(screen.getByText('vm6')).toBeInTheDocument();
  });
});

describe('ContainerSummaryCard 展开框', () => {
  const containers = [
    ...Array.from({ length: 7 }, (_, i) => makeContainer(`run${i}`, 'running')),
    makeContainer('stopped1', 'exited'),
    makeContainer('paused1', 'paused'),
  ];

  it('【续 89b】默认收起:只有圆环+计数,无容器行', () => {
    renderWithRouter(<ContainerSummaryCard containers={containers} />);
    expect(screen.getByText('7/9 运行中')).toBeInTheDocument();
    expect(screen.queryByText('run0')).not.toBeInTheDocument();
    expect(screen.queryByText('stopped1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /展开容器列表 \(9\)/ })).toBeInTheDocument();
  });

  it('点击展开 → 全部 running + 其他状态简化行;再点收起还原', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ContainerSummaryCard containers={containers} />);
    await user.click(screen.getByRole('button', { name: /展开容器列表/ }));

    expect(screen.getByText('run6')).toBeInTheDocument();
    expect(screen.getByText('stopped1')).toBeInTheDocument();
    expect(screen.getByText('paused1')).toBeInTheDocument();
    // 状态分布区 + 展开行各出现一次
    expect(screen.getAllByText('已停止').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('已暂停').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: /收起/ }));
    expect(screen.queryByText('run0')).not.toBeInTheDocument();
    expect(screen.queryByText('stopped1')).not.toBeInTheDocument();
  });
});
