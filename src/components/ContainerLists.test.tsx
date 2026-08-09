// 【阶段 P2-5 - 2026-06-16 续 17 + 续 43 2026-06-20】ContainerLists 组件测试
// 覆盖:DockerList / VmList 渲染 / 状态驱动的按钮显示(running/stopped/paused)/ 日志点击 / onClick
//
// 【续 43 2026-06-20 修复】组件把按钮放进 ActionMenu 折叠菜单,文案带图标前缀:
//   '重启' / '停止' / '启动' 等菜单项 label + lucide 图标
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

// 【续 55 商业化】组件用了 useNavigate(锁占位菜单项/VM 卡片跳设置),必须包 Router
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

  it('【续 68】状态 pill:running → 「运行中」,stopped → 「已停止」', () => {
    const containers = [
      makeContainer({ name: 'nginx', state: 'running' }),
      makeContainer({ name: 'redis', containerId: 'redis', state: 'stopped' }),
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
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('已停止')).toBeInTheDocument();
  });

  it('【续 68】isUpdateAvailable=true → 橙色「更新」徽章;null/false 不显示', () => {
    const containers = [
      makeContainer({ name: 'nginx', isUpdateAvailable: true }),
      makeContainer({ name: 'redis', containerId: 'redis', isUpdateAvailable: null }),
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
    expect(screen.getByText('更新')).toBeInTheDocument();
    expect(screen.getAllByText('更新')).toHaveLength(1); // redis(null) 不显示
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

  it('restartingContainers 包含 id → 显示"等待恢复运行…"标记', () => {
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set(['nginx'])}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    expect(screen.getByText('等待恢复运行…')).toBeInTheDocument();
  });

  it('actionLoading 命中但不在 restarting → 显示"执行中…"标记', () => {
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading="nginx"
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
      />
    );
    expect(screen.getByText('执行中…')).toBeInTheDocument();
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

  // ==== 续 90 门控调整:详情/日志(纯 GraphQL 查看)免费,启停/重启操作 → Pro ====
  it('未解锁 → 详情/日志菜单项仍免费可用(不再带锁)', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onViewLogs = vi.fn();
    const onViewDetails = vi.fn();
    const container = makeContainer({ state: 'running' });
    renderWithRouter(
      <DockerList
        containers={[container]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={onViewLogs}
        onViewDetails={onViewDetails}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /详情/ }));
    expect(onViewDetails).toHaveBeenCalledWith(container);
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /日志/ }));
    expect(onViewLogs).toHaveBeenCalledWith(container);
  });

  it('未解锁 → 启停/重启菜单项换锁占位,点击跳设置页不调 onAction', async () => {
    __setLicenseStateForTest({ status: 'none' });
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
    // 操作项 label 保留(换 🔒 占位),点击不调真实动作
    await user.click(screen.getByRole('menuitem', { name: /重启/ }));
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /停止/ }));
    expect(onAction).not.toHaveBeenCalled();
  });

  // ==== 续 90 详情入口统一:docker 整行可点进详情 ====
  it('点击容器卡片 → onViewDetails(container)(未解锁同样生效)', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const container = makeContainer({ name: 'nginx' });
    renderWithRouter(
      <DockerList
        containers={[container]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onViewDetails={onViewDetails}
      />
    );
    await user.click(screen.getByText('nginx'));
    expect(onViewDetails).toHaveBeenCalledWith(container);
  });

  it('点击 ⋮ 更多操作 → 不穿透触发卡片 onClick(不开详情)', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer()]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onViewDetails={onViewDetails}
      />
    );
    await openActionMenu(user);
    expect(screen.getByRole('menuitem', { name: /日志/ })).toBeInTheDocument();
    expect(onViewDetails).not.toHaveBeenCalled();
  });

  it('点击行内 checkbox → 只勾选不穿透触发卡片 onClick', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onToggleOne = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer()]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onViewDetails={onViewDetails}
        selected={new Set()}
        onToggleOne={onToggleOne}
      />
    );
    await user.click(screen.getByLabelText('选择 nginx'));
    expect(onToggleOne).toHaveBeenCalledWith('nginx');
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

  // ==== 续 91 F:「更新镜像」菜单项(Pro,纯 GraphQL 一键更新) ====
  it('已解锁 → 菜单显示「更新镜像」,点击调 onUpdate(container)', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const container = makeContainer({ state: 'running' });
    renderWithRouter(
      <DockerList
        containers={[container]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onUpdate={onUpdate}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /更新镜像/ }));
    expect(onUpdate).toHaveBeenCalledWith(container);
  });

  it('isUpdateAvailable=true →「更新镜像」菜单项带橙点高亮;null 无橙点', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ isUpdateAvailable: true })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onUpdate={() => {}}
      />
    );
    await openActionMenu(user);
    const item = screen.getByRole('menuitem', { name: /更新镜像/ });
    expect(item.querySelector('.bg-orange-500')).not.toBeNull();
  });

  it('未解锁 →「更新镜像」换 🔒 占位,点击跳设置不调 onUpdate', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ state: 'running' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onUpdate={onUpdate}
      />
    );
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /更新镜像/ }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('updatingId 命中 → 行内显示「更新中…」反馈', () => {
    renderWithRouter(
      <DockerList
        containers={[makeContainer({ containerId: 'nginx' })]}
        actionLoading={null}
        restartingContainers={new Set()}
        onAction={() => {}}
        onViewLogs={() => {}}
        onUpdate={() => {}}
        updatingId="nginx"
      />
    );
    expect(screen.getByText('更新中…')).toBeInTheDocument();
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

  it('rebootingVms 包含 uuid → 显示"等待恢复运行…"标记', () => {
    renderWithRouter(
      <VmList
        vms={[makeVm({ state: 'RUNNING' })]}
        actionLoading={null}
        rebootingVms={new Set(['win11'])}
        onAction={() => {}}
      />
    );
    expect(screen.getByText('等待恢复运行…')).toBeInTheDocument();
  });

  // ==== 续 90 门控调整:VM 详情(点卡片)免费,VM 启停/重启/暂停/恢复操作 → Pro ====
  it('未解锁 → 点击 VM 卡片仍调 onVmClick(详情免费),操作菜单项换锁不调 onAction', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user = userEvent.setup();
    const onVmClick = vi.fn();
    const onAction = vi.fn();
    const vm = makeVm({ name: 'win11', state: 'STOPPED' });
    renderWithRouter(
      <VmList
        vms={[vm]}
        actionLoading={null}
        rebootingVms={new Set()}
        onAction={onAction}
        onVmClick={onVmClick}
      />
    );
    // 详情免费:点卡片直接开
    await user.click(screen.getByText('win11'));
    expect(onVmClick).toHaveBeenCalledWith(vm);
    // 操作 → Pro:启动项换 🔒 占位,点击不调真实动作
    await openActionMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /启动/ }));
    expect(onAction).not.toHaveBeenCalled();
  });
});
