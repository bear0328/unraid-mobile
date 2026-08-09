// 【阶段 P2-6 - 2026-06-16 续 18】dashboard 卡片组件测试
// 覆盖:DiskCard / NetworkCard / EmptyState 3 个纯展示组件
// 【续 90】ArrayCard 删除(阵列使用率并入 DiskCard 标题),对应用例移到 DiskCard
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiskCard from './DiskCard';
import NetworkCard from './NetworkCard';
import { ConfigRequiredState, NoDataState } from './EmptyState';
import type { UnraidDisk, UnraidNetworkInfo } from '../../services';

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

  it('boot 磁盘显示"启动盘"标签', () => {
    const disks = [makeDisk({ name: 'flash', type: 'boot' })];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('启动盘')).toBeInTheDocument();
  });

  it('cache/parity 磁盘显示"缓存池"/"校验盘"标签', () => {
    const disks = [
      makeDisk({ name: 'cache', type: 'cache' }),
      makeDisk({ name: 'parity', type: 'parity' }),
    ];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('缓存池')).toBeInTheDocument();
    expect(screen.getByText('校验盘')).toBeInTheDocument();
  });

  it('【续 91 L13a】parity 盘不渲染用量行(webGui 同款:校验盘无文件系统)', () => {
    const disks = [
      makeDisk({ name: 'disk1', type: 'data', size: 999, used: 500 }),
      makeDisk({ name: 'parity', type: 'parity', size: 888, used: 0 }),
    ];
    const { container } = render(<DiskCard disks={disks} />);
    // data 盘有用量文本("500B / 999B"),parity 行没有(整卡只有 1 条)
    expect(screen.getAllByText(/\d+B \/ \d+B/)).toHaveLength(1);
    // parity 行也不渲染 ProgressBar(整卡只有 1 条进度条)
    expect(container.querySelectorAll('[class*="bg-gray-200"]')).toHaveLength(1);
  });

  it('【续 91 L13d】temperature null(休眠/未上报)→ 显示 — 而非 0°C', () => {
    const disks = [makeDisk({ name: 'disk1', temperature: null as unknown as number })];
    render(<DiskCard disks={disks} />);
    expect(screen.queryByText(/0°C/)).not.toBeInTheDocument();
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

  it('【续 66】spinMap false → 显示休眠徽章,温度位显示 —(不再是误导的 0°C)', () => {
    const disks = [makeDisk({ name: 'disk1', temperature: 0 })];
    render(<DiskCard disks={disks} spinMap={new Map([['disk1', false]])} />);
    expect(screen.getByText('休眠')).toBeInTheDocument();
    expect(screen.queryByText(/0°C/)).not.toBeInTheDocument();
  });

  it('【续 66】spinMap true → 无休眠徽章,温度正常显示', () => {
    const disks = [makeDisk({ name: 'disk1', temperature: 35 })];
    render(<DiskCard disks={disks} spinMap={new Map([['disk1', true]])} />);
    expect(screen.queryByText('休眠')).not.toBeInTheDocument();
    expect(screen.getByText(/35°C/)).toBeInTheDocument();
  });

  it('【续 66】空态卡 + spinMap → 列出各盘休眠/转动状态(未加载温度也能看)', () => {
    render(
      <DiskCard
        disks={[]}
        spinMap={
          new Map([
            ['disk1', false],
            ['cache', true],
          ])
        }
      />
    );
    expect(screen.getByText('DISK1')).toBeInTheDocument();
    expect(screen.getByText('休眠')).toBeInTheDocument();
    expect(screen.getByText('CACHE')).toBeInTheDocument();
    expect(screen.getByText('转动中')).toBeInTheDocument();
  });

  it('【续 90】标题右侧显示「阵列使用率 X%」(data 盘平均,原 ArrayCard 信息并入)', () => {
    const disks = [
      makeDisk({ name: 'disk1', type: 'data', size: 100, used: 50 }),
      makeDisk({ name: 'disk2', type: 'data', size: 100, used: 70 }),
    ];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('阵列使用率 60%')).toBeInTheDocument();
  });

  it('【续 90】阵列使用率只算 data 盘;无 data 盘不显示', () => {
    const { rerender } = render(
      <DiskCard
        disks={[
          makeDisk({ name: 'disk1', type: 'data', size: 100, used: 50 }),
          makeDisk({ name: 'parity', type: 'parity', size: 100, used: 99 }),
        ]}
      />
    );
    expect(screen.getByText('阵列使用率 50%')).toBeInTheDocument();

    rerender(<DiskCard disks={[makeDisk({ name: 'parity', type: 'parity' })]} />);
    expect(screen.queryByText(/阵列使用率/)).not.toBeInTheDocument();
  });

  it('【续 97 P1-2】阵列使用率按容量加权:1TB 90% + 4TB 10% → 26%(非算术 50%)', () => {
    const disks = [
      makeDisk({ name: 'disk1', type: 'data', size: 100, used: 90 }),
      makeDisk({ name: 'disk2', type: 'data', size: 400, used: 40 }),
    ];
    render(<DiskCard disks={disks} />);
    expect(screen.getByText('阵列使用率 26%')).toBeInTheDocument();
  });

  it('【续 97 P1-2】data 盘 size 全 0(脏数据)→ 不显示阵列使用率', () => {
    render(
      <DiskCard disks={[makeDisk({ name: 'disk1', type: 'data', size: 0, used: 0 })]} />
    );
    expect(screen.queryByText(/阵列使用率/)).not.toBeInTheDocument();
  });

  it('【续 90】>6 盘默认折叠 + 「展开全部 (N)」;展开后全部显示,再点收起还原', async () => {
    const user = userEvent.setup();
    const disks = Array.from({ length: 8 }, (_, i) => makeDisk({ name: `disk${i + 1}` }));
    render(<DiskCard disks={disks} />);
    // 折叠:只显示前 6 盘
    expect(screen.getByText('DISK6')).toBeInTheDocument();
    expect(screen.queryByText('DISK7')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /展开全部 \(8\)/ }));
    expect(screen.getByText('DISK7')).toBeInTheDocument();
    expect(screen.getByText('DISK8')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByText('DISK7')).not.toBeInTheDocument();
  });

  it('【续 90】≤6 盘不显示折叠按钮', () => {
    render(<DiskCard disks={[makeDisk()]} />);
    expect(screen.queryByRole('button', { name: /展开全部/ })).not.toBeInTheDocument();
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
    expect(screen.getByText('网络 IO')).toBeInTheDocument();
    // 【续 90】标题旁显示主网卡名(br0 优先选中)
    expect(screen.getByText('br0')).toBeInTheDocument();
  });

  it('【续 90】isRefreshing=true 也不再显示「刷新中…」(Hero 卡已有刷新态)', () => {
    render(<NetworkCard networks={[makeNetwork()]} isRefreshing={true} />);
    expect(screen.queryByText('刷新中…')).not.toBeInTheDocument();
  });

  it('【续 90】数值用大号等宽样式(text-lg font-semibold tabular-nums)', () => {
    const { container } = render(
      <NetworkCard networks={[makeNetwork()]} isRefreshing={false} />
    );
    const matches = container.innerHTML.match(/text-lg font-semibold tabular-nums/g) || [];
    expect(matches.length).toBe(2); // 接收 + 发送
  });

  it('shim-br0 也被认作主网卡', () => {
    const networks = [
      makeNetwork({ name: 'eth0', rxSec: 100, txSec: 50 }),
      makeNetwork({ name: 'shim-br0', rxSec: 200, txSec: 100 }),
    ];
    render(<NetworkCard networks={networks} isRefreshing={false} />);
    expect(screen.getByText('shim-br0')).toBeInTheDocument();
  });

  it('无 br0/eth → fallback 到第一项', () => {
    const networks = [makeNetwork({ name: 'lo', rxSec: 0, txSec: 0 })];
    render(<NetworkCard networks={networks} isRefreshing={false} />);
    expect(screen.getByText('网络 IO')).toBeInTheDocument();
    expect(screen.getByText('lo')).toBeInTheDocument();
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
