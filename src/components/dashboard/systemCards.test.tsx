// 【阶段 P2-7 - 2026-06-16 续 19】CpuCard / MemoryCard / DashboardSkeleton 组件测试
// 覆盖:CpuCard 进度/温度染色/cpuInfo 渲染/核心展开/MemoryCard 进度/展开详情/Swap 染色/
//       DashboardSkeleton 骨架屏 + 加载文案
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import CpuCard from './CpuCard';
import MemoryCard from './MemoryCard';
import DashboardSkeleton from './DashboardSkeleton';
import type { UnraidSystemInfo } from '../../services';

function makeSystem(overrides: Partial<UnraidSystemInfo> = {}): UnraidSystemInfo {
  return {
    name: 'tower',
    cpu: 25,
    cpuTemp: 45,
    memory: 40,
    memoryUsage: 40,
    uptime: '5h',
    arrayStatus: 'Started',
    ...overrides,
  } as UnraidSystemInfo;
}

describe('CpuCard', () => {
  it('systemInfo=null → 显示 "CPU" 标题 + "0.0%"', () => {
    render(<CpuCard systemInfo={null} />);
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('基本渲染:显示 cpu 百分比和 brand', () => {
    const info = makeSystem({
      cpu: 35.7,
      cpuInfo: { cores: 8, threads: 16, brand: 'AMD Ryzen 7 5800X' },
    });
    render(<CpuCard systemInfo={info} />);
    // 35.7% 在顶部大数字 + ProgressBar 各显示一次,getAllByText 验证 ≥ 2
    expect(screen.getAllByText('35.7%').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('AMD Ryzen 7 5800X')).toBeInTheDocument();
    expect(screen.getByText(/8 核心 \/ 16 线程/)).toBeInTheDocument();
  });

  it('cpuInfo 缺失 → 不显示品牌行', () => {
    render(<CpuCard systemInfo={makeSystem({ cpu: 50 })} />);
    // 没有 brand 文本
    expect(screen.queryByText(/AMD/)).not.toBeInTheDocument();
    // 没有 "X 核心 / X 线程" 行
    expect(screen.queryByText(/\d+ 核心/)).not.toBeInTheDocument();
  });

  it('cpuTemp > 80 → 红色样式 class', () => {
    const info = makeSystem({
      cpuTemp: 90,
      cpuInfo: { cores: 4, threads: 8 },
    });
    const { container } = render(<CpuCard systemInfo={info} />);
    expect(container.innerHTML).toMatch(/text-red-600/);
  });

  it('cpuTemp 在 60-80 之间 → 黄色样式 class', () => {
    const info = makeSystem({
      cpuTemp: 70,
      cpuInfo: { cores: 4, threads: 8 },
    });
    const { container } = render(<CpuCard systemInfo={info} />);
    expect(container.innerHTML).toMatch(/text-yellow-600/);
  });

  it('cpuTemp ≤ 60 → 绿色样式 class', () => {
    const info = makeSystem({
      cpuTemp: 50,
      cpuInfo: { cores: 4, threads: 8 },
    });
    const { container } = render(<CpuCard systemInfo={info} />);
    expect(container.innerHTML).toMatch(/text-green-600/);
  });

  it('cpuTemp = 0 → 不渲染温度(条件 cpuTemp > 0)', () => {
    render(<CpuCard systemInfo={makeSystem({ cpuTemp: 0 })} />);
    expect(screen.queryByText(/°C/)).not.toBeInTheDocument();
  });

  it('cpus 数组 → 显示"展开"按钮和核心数', () => {
    const info = makeSystem({
      cpus: [
        { percentTotal: 10, percentUser: 8, percentSystem: 2, percentIdle: 90 },
        { percentTotal: 20, percentUser: 15, percentSystem: 5, percentIdle: 80 },
      ],
    });
    render(<CpuCard systemInfo={info} />);
    expect(screen.getByRole('button', { name: /展开/ })).toBeInTheDocument();
    expect(screen.getByText(/\(2 核心\)/)).toBeInTheDocument();
  });

  it('点击展开 → 显示每核心 user/system bar;再点收起 → 隐藏', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      cpus: [
        { percentTotal: 30, percentUser: 25, percentSystem: 5, percentIdle: 70 },
        { percentTotal: 60, percentUser: 50, percentSystem: 10, percentIdle: 40 },
      ],
    });
    render(<CpuCard systemInfo={info} />);
    // 默认收起:不显示 User/Sys 图例
    expect(screen.queryByText(/^User$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /展开/ }));
    // 展开后:User/Sys 图例出现,每个核心一个 bar
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Sys')).toBeInTheDocument();
    // 再点收起 → 图例消失
    await user.click(screen.getByRole('button', { name: /收起/ }));
    expect(screen.queryByText(/^User$/)).not.toBeInTheDocument();
  });

  it('cpus 空数组 → 不显示展开按钮', () => {
    render(<CpuCard systemInfo={makeSystem({ cpus: [] })} />);
    expect(screen.queryByRole('button', { name: /展开/ })).not.toBeInTheDocument();
  });
});

describe('MemoryCard', () => {
  it('systemInfo=null → 显示 "0.0%" 和 "0% 已用"', () => {
    render(<MemoryCard systemInfo={null} />);
    expect(screen.getByText('内存')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getByText('0% 已用')).toBeInTheDocument();
  });

  it('基本渲染:memory=60 → 显示 "60.0%"', () => {
    render(<MemoryCard systemInfo={makeSystem({ memory: 60 })} />);
    // 60.0% 在顶部大数字 + ProgressBar 各显示一次
    expect(screen.getAllByText('60.0%').length).toBeGreaterThanOrEqual(2);
  });

  it('memory > 90 → 红色样式', () => {
    const { container } = render(<MemoryCard systemInfo={makeSystem({ memory: 95 })} />);
    expect(container.innerHTML).toMatch(/text-red-600/);
  });

  it('memory 70-90 → 黄色样式', () => {
    const { container } = render(<MemoryCard systemInfo={makeSystem({ memory: 80 })} />);
    expect(container.innerHTML).toMatch(/text-yellow-600/);
  });

  it('memory ≤ 70 → 绿色样式', () => {
    const { container } = render(<MemoryCard systemInfo={makeSystem({ memory: 50 })} />);
    expect(container.innerHTML).toMatch(/text-green-600/);
  });

  it('点击展开 + memoryTotal>0 → 显示"已用/总计/空闲"分段条', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      memoryTotal: 16 * 1024 * 1024 * 1024,
      memoryUsed: 8 * 1024 * 1024 * 1024,
      memoryFree: 8 * 1024 * 1024 * 1024,
    });
    render(<MemoryCard systemInfo={info} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    // 已用/总计/空闲 在 副标题 + 分段条 各显示一次,getAllByText 断言 ≥ 2
    expect(screen.getAllByText(/已用/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/总计/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/空闲/).length).toBeGreaterThanOrEqual(2);
  });

  it('memoryTotal 缺失 → 展开后无分段条', async () => {
    const user: UserEvent = userEvent.setup();
    render(<MemoryCard systemInfo={makeSystem()} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    // 没有分段条时:只显示 "Swap" 行(若 swap 也缺则整个详情区为空 div)
    expect(screen.queryByText(/总计/)).not.toBeInTheDocument();
  });

  it('swap.total > 0 → 展开后显示 Swap 行', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      swap: {
        total: 4 * 1024 * 1024 * 1024,
        used: 0,
        free: 4 * 1024 * 1024 * 1024,
        percentTotal: 0,
      },
    });
    render(<MemoryCard systemInfo={info} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    expect(screen.getByText('Swap')).toBeInTheDocument();
  });

  it('swap.percentTotal > 80 → Swap 百分比红色', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      swap: { total: 1024, used: 900, free: 124, percentTotal: 90 },
    });
    const { container } = render(<MemoryCard systemInfo={info} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    expect(container.innerHTML).toMatch(/text-red-600/);
  });

  it('swap.percentTotal > 50 但 ≤ 80 → 黄色样式', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      swap: { total: 1024, used: 600, free: 424, percentTotal: 60 },
    });
    const { container } = render(<MemoryCard systemInfo={info} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    expect(container.innerHTML).toMatch(/text-yellow-600/);
  });

  it('swap.total = 0 → 不显示 Swap 行', async () => {
    const user: UserEvent = userEvent.setup();
    const info = makeSystem({
      swap: { total: 0, used: 0, free: 0, percentTotal: 0 },
    });
    render(<MemoryCard systemInfo={info} />);
    await user.click(screen.getByRole('button', { name: /展开/ }));
    expect(screen.queryByText('Swap')).not.toBeInTheDocument();
  });
});

describe('DashboardSkeleton', () => {
  it('渲染"首次加载中…"提示', () => {
    render(<DashboardSkeleton />);
    expect(screen.getByText(/首次加载中/)).toBeInTheDocument();
    expect(screen.getByText(/unraid-api 冷启动约 4-5 秒/)).toBeInTheDocument();
  });

  it('包含 animate-pulse 骨架样式', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.innerHTML).toMatch(/animate-pulse/);
  });

  it('渲染多个骨架卡片(至少 5 个 bg-white 卡片)', () => {
    const { container } = render(<DashboardSkeleton />);
    const matches = container.innerHTML.match(/bg-white dark:bg-gray-800/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
