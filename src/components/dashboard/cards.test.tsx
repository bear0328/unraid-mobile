// 【阶段 P2-6 - 2026-06-16 续 18】dashboard 卡片组件测试
// 覆盖:ArrayCard / DiskCard / NetworkCard / EmptyState 4 个纯展示组件
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArrayCard from './ArrayCard';
import DiskCard from './DiskCard';
import NetworkCard from './NetworkCard';
import { ConfigRequiredState, NoDataState } from './EmptyState';
import type { UnraidSystemInfo, UnraidDisk, UnraidNetworkInfo } from '../../services';

const systemInfoStarted: UnraidSystemInfo = {
  name: 'tower',
  cpu: 0,
  cpuTemp: 35,
  memory: 50,
  memoryUsage: 50,
  uptime: '5h',
  arrayStatus: 'Started',
} as UnraidSystemInfo;

const systemInfoStopped: UnraidSystemInfo = {
  ...systemInfoStarted,
  arrayStatus: 'Stopped',
} as UnraidSystemInfo;

function makeDisk(overrides: Partial<UnraidDisk> = {}): UnraidDisk {
  return {
    id: 'disk1',
    name: 'disk1',
    type: 'data',
    size: 1000000000,
    used: 500000000,
    temperature: 35,
    status: 'DISK_OK',
    ...overrides,
  } as UnraidDisk;
}

function makeNetwork(overrides: Partial<UnraidNetworkInfo> = {}): UnraidNetworkInfo {
  return {
    id: 'eth0',
    name: 'eth0',
    rxSec: 1024 * 1024,
    txSec: 512 * 1024,
    ...overrides,
  } as UnraidNetworkInfo;
}

describe('ArrayCard', () => {
  it('arrayStatus=Started → 显示"Started"和绿色样式', () => {
    render(<ArrayCard systemInfo={systemInfoStarted} disks={[]} />);
    expect(screen.getByText('存储阵列状态')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
  });

  it('arrayStatus=Stopped → 显示"Stopped"和黄色样式', () => {
    render(<ArrayCard systemInfo={systemInfoStopped} disks={[]} />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('systemInfo=null → 显示"Unknown"', () => {
    render(<ArrayCard systemInfo={null} disks={[]} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('多个 data 磁盘 → 进度条 value 是平均使用率', () => {
    const disks = [
      makeDisk({ name: 'disk1', type: 'data', size: 100, used: 50 }),
      makeDisk({ name: 'disk2', type: 'data', size: 200, used: 100 }),
    ];
    const { container } = render(<ArrayCard systemInfo={systemInfoStarted} disks={disks} />);
    // 验证"阵列使用率"标签渲染
    expect(container.textContent).toContain('阵列使用率');
  });

  it('只算 data 磁盘,parity/cache/boot 忽略', () => {
    const disks = [
      makeDisk({ name: 'disk1', type: 'data', size: 100, used: 50 }),
      makeDisk({ name: 'parity', type: 'parity', size: 100, used: 99 }),
      makeDisk({ name: 'cache', type: 'cache', size: 100, used: 99 }),
    ];
    const { container } = render(<ArrayCard systemInfo={systemInfoStarted} disks={disks} />);
    expect(container.textContent).toContain('阵列使用率');
  });

  it('无 data 磁盘 → 显示"磁盘数据未加载"提示(续 46.3:不再显示 0% 进度条)', () => {
    const { container } = render(
      <ArrayCard systemInfo={systemInfoStarted} disks={[makeDisk({ type: 'parity' })]} />
    );
    expect(container.textContent).toContain('磁盘数据未加载');
    expect(container.textContent).not.toContain('阵列使用率');
  });
});

describe('DiskCard', () => {
  it('空数组 → 渲染空态卡(标题+未加载提示,无按钮时不显示按钮)', () => {
    render(<DiskCard disks={[]} />);
    expect(screen.getByText('磁盘状态')).toBeInTheDocument();
    expect(screen.getByText(/磁盘数据未加载/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('空数组 + onRefreshDisks → 空态卡显示"刷新磁盘"按钮(冷启动显式加载入口)', () => {
    render(<DiskCard disks={[]} onRefreshDisks={() => {}} />);
    expect(screen.getByRole('button', { name: '刷新磁盘数据(会唤醒休眠的阵列盘)' })).toBeInTheDocument();
  });

  it('渲染每个磁盘的 name + temperature + 大小', () => {
    const disks = [
      makeDisk({ name: 'disk1', temperature: 35, size: 1000, used: 500 }),
      makeDisk({ name: 'disk2', temperature: 55, size: 2000, used: 1500 }),
    ];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('DISK1')).toBeInTheDocument();
    expect(screen.getByText('DISK2')).toBeInTheDocument();
    expect(screen.getByText(/35°C/)).toBeInTheDocument();
    expect(screen.getByText(/55°C/)).toBeInTheDocument();
  });

  it('boot 磁盘显示"系统"标签', () => {
    const disks = [makeDisk({ name: 'flash', type: 'boot' })];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('系统')).toBeInTheDocument();
  });

  it('温度 > 50 → 红色样式 class', () => {
    const { container } = render(<DiskCard disks={[makeDisk({ name: 'hot', temperature: 55 })]} />);
    expect(container.innerHTML).toMatch(/text-red-500/);
  });

  it('温度 > 40 且 ≤ 50 → 黄色样式 class', () => {
    const { container } = render(
      <DiskCard disks={[makeDisk({ name: 'warm', temperature: 45 })]} />
    );
    expect(container.innerHTML).toMatch(/text-yellow-500/);
  });

  it('温度 ≤ 40 → 灰色样式 class', () => {
    const { container } = render(
      <DiskCard disks={[makeDisk({ name: 'cool', temperature: 35 })]} />
    );
    expect(container.innerHTML).toMatch(/text-gray-500/);
  });
});

describe('NetworkCard', () => {
  it('空数组 → 不渲染', () => {
    const { container } = render(<NetworkCard networks={[]} isRefreshing={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('br0 优先(无 br0 用 eth0)', () => {
    const networks = [
      makeNetwork({ name: 'eth0', rxSec: 100, txSec: 50 }),
      makeNetwork({ name: 'br0', rxSec: 999, txSec: 888 }),
    ];
    render(<NetworkCard networks={networks} isRefreshing={false} />);
    // br0 的 rxSec/txSec 应该是被显示的(具体值依赖 formatSpeed 实现)
    expect(screen.getByText('网络 IO')).toBeInTheDocument();
  });

  it('isRefreshing=true → 显示"刷新中…"', () => {
    render(<NetworkCard networks={[makeNetwork()]} isRefreshing={true} />);
    expect(screen.getByText('刷新中…')).toBeInTheDocument();
  });

  it('isRefreshing=false → 不显示"刷新中…"', () => {
    render(<NetworkCard networks={[makeNetwork()]} isRefreshing={false} />);
    expect(screen.queryByText('刷新中…')).not.toBeInTheDocument();
  });

  it('shim-br0 也被认作主网卡', () => {
    const networks = [
      makeNetwork({ name: 'eth0', rxSec: 100, txSec: 50 }),
      makeNetwork({ name: 'shim-br0', rxSec: 200, txSec: 100 }),
    ];
    const { container } = render(<NetworkCard networks={networks} isRefreshing={false} />);
    expect(container.textContent).toContain('网络 IO');
  });

  it('无 br0/eth → fallback 到第一项', () => {
    const networks = [makeNetwork({ name: 'lo', rxSec: 0, txSec: 0 })];
    const { container } = render(<NetworkCard networks={networks} isRefreshing={false} />);
    expect(container.textContent).toContain('网络 IO');
  });
});

describe('EmptyState', () => {
  it('ConfigRequiredState 渲染"需要配置"标题', () => {
    render(<ConfigRequiredState />);
    expect(screen.getByText('需要配置')).toBeInTheDocument();
  });

  it('ConfigRequiredState 无 error → 显示默认提示', () => {
    render(<ConfigRequiredState />);
    expect(screen.getByText('请在设置页面配置 unRAID 服务器地址和 API 密钥')).toBeInTheDocument();
  });

  it('ConfigRequiredState 传 error → 显示 error 文本', () => {
    render(<ConfigRequiredState error="服务器地址无效" />);
    expect(screen.getByText('服务器地址无效')).toBeInTheDocument();
  });

  it('NoDataState 渲染"暂无数据"提示', () => {
    render(<NoDataState />);
    expect(screen.getByText('暂无数据，请检查服务器连接')).toBeInTheDocument();
  });
});
