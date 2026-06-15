// 【阶段 P2-5 - 2026-06-16 续 17 + 续 43 2026-06-20】ContainerLists 组件测试
// 覆盖:DockerList / VmList 渲染 / 状态驱动的按钮显示(running/stopped/paused)/ 日志点击 / onClick
//
// 【续 43 2026-06-20 修复】组件把按钮放进 ActionMenu 折叠菜单,文案加了 emoji 前缀:
//   '重启' → '🔄 重启' / '停止' → '⏹ 停止' / '启动' → '▶ 启动' 等
//   + 点击触发按钮 '更多操作' 才展开菜单
// 测试改用正则 /重启/ /停止/ /启动/ 匹配,点击 case 先展开菜单。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { DockerList, VmList } from './ContainerLists';
import type { UnraidDockerContainer, UnraidVM } from '../services';
import { __setLicenseStateForTest, __resetLicenseForTest } from '../services/license';

// 【续 55 商业化】组件用了 useNavigate(🔒 菜单项/VM 卡片跳设置),必须包 Router
const renderWithRouter = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

// 【续 55 商业化】默认置 pro 态(原断言都是已解锁行为);门控用例内再手动置回 none
beforeEach(() => {
  __setLicenseStateForTest({
    status: 'active',
    info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
  });
});
afterEach(() => {
  __resetLicenseForTest();
});

function makeContainer(overrides: Partial<UnraidDockerContainer> = {}): UnraidDockerContainer {
  return {
    id: 'c1',
    name: 'nginx',
    containerId: 'nginx',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    created: '2026-06-15T12:00:00Z',
    ports: ['80:80'],
    ...overrides,
  };
}

function makeVm(overrides: Partial<UnraidVM> = {}): UnraidVM {
  return {
    id: 'v1',
    name: 'win11',
    vmUuid: 'win11',
    state: 'RUNNING',
    uuid: 'win11',
    ...overrides,
  } as unknown as UnraidVM;
}

// ActionMenu 折叠菜单:点击 '更多操作' 触发按钮展开后,菜单项 menuitem 才可见
async function openActionMenu(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: '更多操作' }));
}

describe('DockerList', () => {
  it('空数组 → 显示"无容器"', () => {
    renderWithRouter(
      <DockerList
        containers={[]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    expect(screen.getByText('无容器')).toBeInTheDocument();
  });

  it('渲染多个容器(每个显示 name 和 image)', () => {
    const containers = [
      makeContainer({ name: 'nginx', image: 'nginx:1.25' }),
      makeContainer({ name: 'redis', containerId: 'redis', image: 'redis:7' }),
    ];
    renderWithRouter(
      <DockerList
        containers={containers}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getByText('nginx:1.25')).toBeInTheDocument();
    expect(screen.getByText('redis:7')).toBeInTheDocument();
  });

  it('running 状态展开菜单后显示 重启 + 停止', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /重启/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /停止/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /启动/ })).not.toBeInTheDocument();
  });

  it('stopped 状态展开菜单后显示 启动(不显示 重启/停止)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'stopped' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /启动/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /重启/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /停止/ })).not.toBeInTheDocument();
  });

  it('paused 状态展开菜单后显示 启动(同 stopped)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'paused' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /启动/ })).toBeInTheDocument();
  });

  it('点击 重启 → onAction(containerId, "restart")', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ containerId: 'nginx-uid' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={onAction}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /重启/ }));
    expect(onAction).toHaveBeenCalledWith('nginx-uid', 'restart');
  });

  it('点击 停止 → onAction(id, "stop")', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={onAction}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /停止/ }));
    expect(onAction).toHaveBeenCalledWith('nginx', 'stop');
  });

  it('点击 启动 → onAction(id, "start")(stopped 容器)', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'stopped' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={onAction}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /启动/ }));
    expect(onAction).toHaveBeenCalledWith('nginx', 'start');
  });

  it('点击 日志 → onViewLogs(container) 传整个容器对象', async () => {
    const user = userEvent.setup();
    const onViewLogs = vi.fn();
    const container = makeContainer({ name: 'nginx' });
    renderWithRouter(
      <DockerList
        containers={[container]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={onViewLogs}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /日志/ }));
    expect(onViewLogs).toHaveBeenCalledWith(container);
  });

  it('restartingContainers 包含 id → 显示"重启中..."标记', () => {
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set(['nginx'])}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    expect(screen.getByText('重启中...')).toBeInTheDocument();
  });

  it('actionLoading 命中 containerId → 菜单项 disabled', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading="nginx"
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /重启/ })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /停止/ })).toBeDisabled();
  });

  // ==== 续 55 商业化:容器详情/日志 → Pro(单个动作保持免费) ====
  it('未解锁 → 详情/日志菜单项带 🔒,点击不调 onViewLogs/onViewDetails', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onViewLogs = vi.fn();
    const onViewDetails = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={onViewLogs}
        onViewDetails={onViewDetails}
      />
    );
    await openActionMenu(user);
    // 锁占位项在,原动作项(重启/停止)保持免费不受影响
    expect(screen.getByRole('menuitem', { name: /🔒 详情/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /重启/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /🔒 日志/ }));
    expect(onViewLogs).not.toHaveBeenCalled();
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it('未解锁 → 行内批量 checkbox 隐藏(批量操作 → Pro)', () => {
    __setLicenseStateForTest({ status: 'none' });
    renderWithRouter(
      <DockerList
        containers={[makeContainer()]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        selected={new Set()}
        onToggleOne={() => {}}
      />
    );
    expect(screen.queryByLabelText('选择 nginx')).not.toBeInTheDocument();
  });
});

describe('VmList', () => {
  it('空数组 → 显示"无虚拟机"', () => {
    renderWithRouter(<VmList vms={[]} actionLoading={null} rebootingVms={new Set()} onAction={() => {}} />);
    expect(screen.getByText('无虚拟机')).toBeInTheDocument();
  });

  it('渲染多个 VM', () => {
    const vms = [makeVm({ name: 'win11' }), makeVm({ name: 'ubuntu', vmUuid: 'ubuntu' })];
    renderWithRouter(<VmList vms={vms} actionLoading={null} rebootingVms={new Set()} onAction={() => {}} />);
    expect(screen.getByText('win11')).toBeInTheDocument();
    expect(screen.getByText('ubuntu')).toBeInTheDocument();
  });

  it('RUNNING 状态展开菜单后显示 重启 + 暂停 + 停止', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'RUNNING' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /重启/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /暂停/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /停止/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /启动/ })).not.toBeInTheDocument();
  });

  it('PAUSED 状态展开菜单后显示 恢复', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'PAUSED' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /恢复/ })).toBeInTheDocument();
  });

  it('STOPPED 状态展开菜单后显示 启动', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'STOPPED' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={() => {}}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /启动/ })).toBeInTheDocument();
  });

  it('点击 VM 卡片 → onVmClick(vm)', async () => {
    const user = userEvent.setup();
    const onVmClick = vi.fn();
    const vm = makeVm({ name: 'win11' });
    renderWithRouter(
      <VmList
        vms={[vm]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={() => {}}
        onVmClick={onVmClick}
      />
    );
    // 点击容器外层(找 name 的祖先 div)
    await user.click(screen.getByText('win11'));
    expect(onVmClick).toHaveBeenCalledWith(vm);
  });

  it('点击 启动 → onAction(uuid, "start")', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'STOPPED' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={onAction}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /启动/ }));
    expect(onAction).toHaveBeenCalledWith('win11', 'start');
  });

  it('点击 暂停 → onAction(uuid, "pause")', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'RUNNING' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={onAction}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /暂停/ }));
    expect(onAction).toHaveBeenCalledWith('win11', 'pause');
  });

  it('点击按钮不冒泡触发 onVmClick(按钮在 onClick stopPropagation div 内)', async () => {
    const user = userEvent.setup();
    const onVmClick = vi.fn();
    const onAction = vi.fn();
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'RUNNING' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={onAction}
        onVmClick={onVmClick}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /暂停/ }));
    expect(onAction).toHaveBeenCalledWith('win11', 'pause');
    expect(onVmClick).not.toHaveBeenCalled();
  });

  it('rebootingVms 包含 uuid → 显示"重启中..."标记', () => {
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'RUNNING' })]}
        actionLoading={null}
        rebootingVms={new Set(['win11'])}
        onAction={() => {}}
      />
    );
    expect(screen.getByText('重启中...')).toBeInTheDocument();
  });

  // ==== 续 55 商业化:VM 详情(点卡片) → Pro(动作按钮保持免费) ====
  it('未解锁 → 点击 VM 卡片不调 onVmClick(跳设置页),动作菜单仍可用', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onVmClick = vi.fn();
    const onAction = vi.fn();
    renderWithRouter(
      <VmList
        vms={[makeVm({ name: 'win11', state: 'STOPPED' })]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={onAction}
        onVmClick={onVmClick}
      />
    );
    await user.click(screen.getByText('win11'));
    expect(onVmClick).not.toHaveBeenCalled();
    // 免费的启动动作不受影响
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /启动/ }));
    expect(onAction).toHaveBeenCalledWith('win11', 'start');
  });
});
