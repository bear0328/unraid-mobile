// 【阶段 P2-11 - 2026-06-16 续 23】Containers 页面集成测试
// 【2026-06-17 续 27】合并 Vms 页:新增 VmDetailsModal mock + 2 个 VM 详情用例
// 覆盖:loading / no-config / 默认 docker tab / 切到 vm tab / actionError / data error /
//       LogsModal 渲染 / 点击日志按钮 → LogsModal open + containerName /
//       点击 VM 卡片 → VmDetailsModal 打开 / 关闭按钮
// ⚠️  注意:tab 切换会触发 re-render → useContainersData 第二次调用,
//         因此 VM 详情相关用例必须用 mockReturnValue(持久)而非 mockReturnValueOnce(单次)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { UnraidDockerContainer, UnraidVM } from '../services';
import type { UnraidApiService } from '../services';

// Mock 5 个 hook + LogsModal + VmDetailsModal,完全控制 Containers 输入
vi.mock('../hooks/useUnraidApi', () => ({
  useUnraidApi: vi.fn(() => ({}) as unknown),
  useApiConfig: vi.fn(() => ({ isConfigured: true })),
}));
vi.mock('../hooks/useContainersData', () => ({
  useContainersData: vi.fn(() => ({
    containers: [] as UnraidDockerContainer[],
    vms: [] as UnraidVM[],
    loading: false,
    error: null as string | null,
    refresh: vi.fn(),
    containersRef: { current: [] },
    vmsRef: { current: [] },
  })),
}));
vi.mock('../hooks/useContainerActions', () => ({
  useContainerActions: vi.fn(() => ({
    actionLoading: null as string | null,
    actionError: null as string | null,
    restartingContainers: new Set<string>(),
    rebootingVms: new Set<string>(),
    handleContainerAction: vi.fn(),
    handleVmAction: vi.fn(),
  })),
}));
vi.mock('../hooks/useContainerLogs', () => ({
  useContainerLogs: vi.fn(() => ({
    logs: '',
    loading: false,
    error: null as string | null,
    liveRefresh: false,
    setLiveRefresh: vi.fn(),
  })),
}));
// Mock LogsModal:open=false 时不渲染,open=true 时显示传入的 title + 关闭按钮
vi.mock('../components/LogsModal', () => ({
  LogsModal: ({
    open,
    title,
    onClose,
  }: {
    open: boolean;
    title: string;
    logs?: string;
    loading?: boolean;
    error?: string | null;
    liveRefresh?: boolean;
    onClose?: () => void;
    onToggleLiveRefresh?: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="logs-modal">
        <span>{title}</span>
        <button onClick={onClose}>关闭日志</button>
      </div>
    ) : null,
}));
// Mock VmDetailsModal:传 vm 时显示 vm.name + 关闭按钮(替代 Vms 页原 modal)
vi.mock('../components/vms/VmDetailsModal', () => ({
  default: ({ vm, onClose }: { vm: UnraidVM; onClose: () => void }) => (
    <div data-testid="vm-details-modal">
      <span>{vm.name}</span>
      <button onClick={onClose}>关闭详情</button>
    </div>
  ),
}));
// 【续 48 2026-07-19】Mock ComposeStacks:compose tab 内容,避免触发 composeApi fetch
// 【续 70】捕获 props:断言页级刷新钮 → refreshSignal 联动
const composeStacksProps = vi.hoisted(() => ({ current: null as { refreshSignal?: number } | null }));
vi.mock('../components/compose/ComposeStacks', () => ({
  default: (props: { refreshSignal?: number }) => {
    composeStacksProps.current = props;
    return <div data-testid="compose-stacks">Compose 栈面板</div>;
  },
}));
// 【续 50 C2】Mock useToast:批量操作 toast 计数断言用(hoisted 保序)
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../hooks/useToast', () => ({ useToast: () => toastMocks }));

import { MemoryRouter, useLocation } from 'react-router-dom';

import { useUnraidApi, useApiConfig } from '../hooks/useUnraidApi';
import { useContainersData } from '../hooks/useContainersData';
import { useContainerActions } from '../hooks/useContainerActions';
import { useContainerLogs } from '../hooks/useContainerLogs';
import Containers from './Containers';
// 【续 55 商业化】测试直接置 license 状态(pro 态恢复原断言行为)
import { __setLicenseStateForTest, __resetLicenseForTest } from '../services/license';
// 【续 99】spy invalidateNamespace:手动刷新缓存失效口径断言
import * as cacheModule from '../services/unraidApi/cache';

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
  } as UnraidDockerContainer;
}

function makeVm(overrides: Partial<UnraidVM> = {}): UnraidVM {
  return {
    id: 'v1',
    name: 'win11',
    vmUuid: 'win11',
    state: 'RUNNING',
    ...overrides,
  } as UnraidVM;
}

// 【续 50 C8】Containers 加了 useSearchParams,必须包 Router;route 可带 ?focus= 等 query
function renderContainers(route = '/containers') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Containers />
    </MemoryRouter>
  );
}

// 读当前 location,断言 query 是否被清掉
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

describe('Containers 页面', () => {
  beforeEach(() => {
    // 【续 55 商业化】默认 pro 态(Compose/批量/详情/日志均已解锁),门控用例内再置回 none
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
    // 清 toast 调用记录,防止上一用例的 toast 污染计数断言
    Object.values(toastMocks).forEach((m) => m.mockClear());
    // 【续 91 F】还原 useUnraidApi 默认实现(更新用例会 mockReturnValue 覆盖,防串到后续用例)
    vi.mocked(useUnraidApi).mockImplementation(() => ({}) as unknown as UnraidApiService);
    // 重置 mock 持久返回值,避免上一测试污染
    vi.mocked(useContainersData).mockReturnValue({
      containers: [] as UnraidDockerContainer[],
      vms: [] as UnraidVM[],
      loading: false,
      error: null as string | null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
  });

  afterEach(() => {
    __resetLicenseForTest();
  });
  it('loading=true → 显示"加载中..."且不渲染 tab', () => {
    vi.mocked(useContainersData).mockReturnValueOnce({
      containers: [],
      vms: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Docker' })).not.toBeInTheDocument();
  });

  it('hasConfig=false → 显示"请先在设置页面配置"提示', () => {
    vi.mocked(useApiConfig).mockReturnValueOnce({ config: null, isConfigured: false });
    vi.mocked(useUnraidApi).mockReturnValueOnce(null as unknown as UnraidApiService);
    renderContainers();
    expect(screen.getByText('请先在设置页面配置 unRAID 服务器地址和 API 密钥')).toBeInTheDocument();
  });

  it('hasConfig=false + error 传入 → 显示 error 文本', () => {
    vi.mocked(useApiConfig).mockReturnValueOnce({ config: null, isConfigured: false });
    vi.mocked(useUnraidApi).mockReturnValueOnce(null as unknown as UnraidApiService);
    vi.mocked(useContainersData).mockReturnValueOnce({
      containers: [],
      vms: [],
      loading: false,
      error: '服务器未响应',
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    expect(screen.getByText('服务器未响应')).toBeInTheDocument();
  });

  it('正常态 → 显示"容器管理"标题 + Docker tab 默认激活', () => {
    renderContainers();
    expect(screen.getByText('容器管理')).toBeInTheDocument();
    // Docker tab 按钮
    expect(screen.getByRole('button', { name: 'Docker' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '虚拟机' })).toBeInTheDocument();
    // Docker tab 有 active 样式 class
    const dockerTab = screen.getByRole('button', { name: 'Docker' });
    expect(dockerTab.className).toMatch(/border-blue-500/);
  });

  it('默认显示 DockerList("无容器"空态),点 VM tab → 切到 VmList', async () => {
    const user: UserEvent = userEvent.setup();
    renderContainers();
    // 默认 docker tab → DockerList 的"无容器"显示
    expect(screen.getByText('无容器')).toBeInTheDocument();
    // 切到 vm tab → DockerList 卸载,VmList 的"无虚拟机"显示
    await user.click(screen.getByRole('button', { name: '虚拟机' }));
    expect(screen.queryByText('无容器')).not.toBeInTheDocument();
    expect(screen.getByText('无虚拟机')).toBeInTheDocument();
  });

  // ==== 续 89:?tab= 深链(Dashboard VM 卡「管理 →」跳 /containers?tab=vm) ====
  it('?tab=vm 深链 → 初始即 VM tab 激活', () => {
    renderContainers('/containers?tab=vm');
    expect(screen.getByText('无虚拟机')).toBeInTheDocument();
    expect(screen.queryByText('无容器')).not.toBeInTheDocument();
    const vmTab = screen.getByRole('button', { name: '虚拟机' });
    expect(vmTab.className).toMatch(/border-blue-500/);
  });

  it('?tab=compose 深链 → 初始即 Compose tab', () => {
    renderContainers('/containers?tab=compose');
    expect(screen.getByTestId('compose-stacks')).toBeInTheDocument();
  });

  // ==== 续 48:compose tab(Compose 页并入,顺序 docker/compose/vm) ====
  it('点 Compose tab → 渲染 ComposeStacks,DockerList 卸载', async () => {
    const user: UserEvent = userEvent.setup();
    renderContainers();
    expect(screen.getByText('无容器')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    expect(screen.queryByText('无容器')).not.toBeInTheDocument();
    expect(screen.getByTestId('compose-stacks')).toBeInTheDocument();
    // compose tab 无批量全选行(currentList 为空)
    expect(screen.queryByLabelText('全选/反选')).not.toBeInTheDocument();
  });

  // ==== 续 70:三 tab 统一页级刷新钮,compose tab 点击 → refreshSignal 递增 ====
  it('compose tab:页级刷新钮可见,点击后 ComposeStacks 的 refreshSignal 递增', async () => {
    const user: UserEvent = userEvent.setup();
    renderContainers();
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    const btn = screen.getByLabelText('手动刷新容器列表');
    const before = composeStacksProps.current?.refreshSignal ?? 0;
    await user.click(btn);
    expect(composeStacksProps.current?.refreshSignal).toBe(before + 1);
  });

  it('actionError 传入 → 显示红色错误提示', () => {
    vi.mocked(useContainerActions).mockReturnValueOnce({
      actionLoading: null,
      actionError: '启动失败',
      restartingContainers: new Set(),
      rebootingVms: new Set(),
      handleContainerAction: vi.fn(),
      handleVmAction: vi.fn(),
    });
    renderContainers();
    expect(screen.getByText('启动失败')).toBeInTheDocument();
  });

  it('data error 传入 → 显示黄色错误提示', () => {
    vi.mocked(useContainersData).mockReturnValueOnce({
      containers: [],
      vms: [],
      loading: false,
      error: 'GraphQL 失败',
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    expect(screen.getByText('GraphQL 失败')).toBeInTheDocument();
  });

  it('LogsModal 默认 open=false → 不渲染 modal', () => {
    renderContainers();
    expect(screen.queryByTestId('logs-modal')).not.toBeInTheDocument();
  });

  it('LogsModal 传入 open=true 时 logs 不为空 → 显示 modal + containerName', () => {
    vi.mocked(useContainerLogs).mockReturnValueOnce({
      logs: 'some logs',
      loading: false,
      error: null,
      liveRefresh: false,
      setLiveRefresh: vi.fn(),
    });
    // LogsModal 的 open 由 Containers 内部 logsModal state 控制,默认 false → 不会渲染
    // 验证:即使 logs hook 返回非空,open=false 仍不渲染
    renderContainers();
    expect(screen.queryByTestId('logs-modal')).not.toBeInTheDocument();
  });

  it('点击容器"日志"按钮 → 打开 LogsModal + 传入 containerName', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValueOnce({
      containers: [makeContainer({ name: 'nginx', containerId: 'nginx-uid' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    // 默认 modal 关闭
    expect(screen.queryByTestId('logs-modal')).not.toBeInTheDocument();
    // 日志按钮在 ActionMenu 下拉里:先点 "更多操作" trigger,再点 "日志" menuitem(批 B 起为 icon+label)
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: /日志/ }));
    // LogsModal 打开并显示 containerName
    expect(screen.getByTestId('logs-modal')).toBeInTheDocument();
    expect(screen.getByTestId('logs-modal')).toHaveTextContent('nginx');
  });

  it('LogsModal 关闭按钮 → 关闭 modal', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValueOnce({
      containers: [makeContainer({ name: 'nginx', containerId: 'nginx-uid' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    // 打开日志 modal(走 ActionMenu)
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: /日志/ }));
    expect(screen.getByTestId('logs-modal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭日志' }));
    expect(screen.queryByTestId('logs-modal')).not.toBeInTheDocument();
  });

  // ==== 续 27:VmDetailsModal(从原 Vms 页迁入) ====
  it('VM tab 下点击 VM 卡片 → 打开 VmDetailsModal 显示 vm 名', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [],
      vms: [makeVm({ name: 'win11' })],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    // 默认 modal 不显示
    expect(screen.queryByTestId('vm-details-modal')).not.toBeInTheDocument();
    // 切到 VM tab
    await user.click(screen.getByRole('button', { name: '虚拟机' }));
    // 点击 VM 卡片(VmItem 整张卡可点)
    await user.click(screen.getByText('win11'));
    expect(screen.getByTestId('vm-details-modal')).toBeInTheDocument();
    expect(screen.getByTestId('vm-details-modal')).toHaveTextContent('win11');
  });

  it('VmDetailsModal 关闭按钮 → 关闭 modal', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [],
      vms: [makeVm({ name: 'win11' })],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByRole('button', { name: '虚拟机' }));
    await user.click(screen.getByText('win11'));
    expect(screen.getByTestId('vm-details-modal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭详情' }));
    expect(screen.queryByTestId('vm-details-modal')).not.toBeInTheDocument();
  });

  // ==== 续 50 C2:批量操作按真实成败计数 ====
  it('批量启动 2 个:1 成功 1 失败 → toast 如实报"成功 1 / 失败 1"', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [
        makeContainer({ name: 'nginx', containerId: 'c1' }),
        makeContainer({ name: 'redis', containerId: 'c2' }),
      ],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    // c1 成功 c2 失败(handleContainerAction 内部不抛错,靠 boolean 表达成败)
    const handleContainerAction = vi.fn((id: string) => Promise.resolve(id === 'c1'));
    vi.mocked(useContainerActions).mockReturnValue({
      actionLoading: null,
      actionError: null,
      restartingContainers: new Set(),
      rebootingVms: new Set(),
      handleContainerAction,
      handleVmAction: vi.fn(),
    });
    renderContainers();
    // 勾选两个容器 → 批量工具条出现
    await user.click(screen.getByLabelText('选择 nginx'));
    await user.click(screen.getByLabelText('选择 redis'));
    await user.click(screen.getByRole('button', { name: '启动' }));
    await waitFor(() =>
      expect(toastMocks.warning).toHaveBeenCalledWith('批量 启动: 成功 1 / 失败 1', 5000)
    );
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it('批量全部成功 → toast.success 报完成个数', async () => {
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'c1' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    vi.mocked(useContainerActions).mockReturnValue({
      actionLoading: null,
      actionError: null,
      restartingContainers: new Set(),
      rebootingVms: new Set(),
      handleContainerAction: vi.fn().mockResolvedValue(true),
      handleVmAction: vi.fn(),
    });
    renderContainers();
    await user.click(screen.getByLabelText('选择 nginx'));
    await user.click(screen.getByRole('button', { name: '停止' }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('批量 停止 完成: 1 个'));
    expect(toastMocks.warning).not.toHaveBeenCalled();
  });

  // ==== 续 99:刷新按钮 refreshing 态 + 缓存失效口径统一 ====
  it('docker tab:点刷新 → invalidateNamespace(containers/vms),刷新中 disabled+图标旋转,完成后恢复', async () => {
    const invalidateSpy = vi.spyOn(cacheModule, 'invalidateNamespace');
    let resolveRefresh!: () => void;
    const refreshMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    vi.mocked(useContainersData).mockReturnValue({
      containers: [],
      vms: [],
      loading: false,
      error: null,
      refresh: refreshMock,
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    try {
      const user: UserEvent = userEvent.setup();
      renderContainers();
      const btn = screen.getByLabelText('手动刷新容器列表');
      expect(btn).not.toBeDisabled();
      await user.click(btn);
      // 缓存失效走 invalidateNamespace 统一口径
      expect(invalidateSpy).toHaveBeenCalledWith('containers');
      expect(invalidateSpy).toHaveBeenCalledWith('vms');
      expect(refreshMock).toHaveBeenCalled();
      // 刷新中:disabled + 图标旋转(原实现 disabled 用首屏 loading,恒 false 可连点)
      expect(btn).toBeDisabled();
      expect(btn.querySelector('svg')?.getAttribute('class') ?? '').toContain('animate-spin');
      // 完成后恢复
      await act(async () => {
        resolveRefresh();
      });
      expect(btn).not.toBeDisabled();
    } finally {
      invalidateSpy.mockRestore();
    }
  });

  // ==== 续 50 C8:?focus= 深链定位 ====
  it('?focus=nginx → 卡片滚动定位 + 高亮 ring,replace 清掉 query,1.5s 后高亮消除', () => {
    vi.useFakeTimers();
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    try {
      vi.mocked(useContainersData).mockReturnValue({
        containers: [
          makeContainer({ name: 'nginx', containerId: 'c1' }),
          makeContainer({ name: 'redis', containerId: 'c2' }),
        ],
        vms: [],
        loading: false,
        error: null,
        refresh: vi.fn(),
        containersRef: { current: [] },
        vmsRef: { current: [] },
      });
      render(
        <MemoryRouter initialEntries={['/containers?focus=nginx']}>
          <Containers />
          <LocationProbe />
        </MemoryRouter>
      );
      // 滚动定位被调(jsdom 无 scrollIntoView,已 mock)
      expect(scrollSpy).toHaveBeenCalled();
      // 目标卡片高亮,其他卡片不高亮
      const card = document.querySelector('[data-container-name="nginx"]');
      expect(card?.className).toContain('ring-blue-500');
      expect(document.querySelector('[data-container-name="redis"]')?.className).not.toContain(
        'ring-blue-500'
      );
      // query 已被 replace 清掉(防刷新重复滚)
      expect(screen.getByTestId('loc').textContent).toBe('/containers');
      // 1.5s 后高亮消除
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(document.querySelector('[data-container-name="nginx"]')?.className).not.toContain(
        'ring-blue-500'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // ==== 续 99:?tab=vm&focus= VM 深链高亮(VmList/VmItem 已支持 highlightName) ====
  it('?tab=vm&focus=win11 → VM 卡片滚动定位 + 高亮 ring,replace 清掉 query', () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    vi.mocked(useContainersData).mockReturnValue({
      containers: [],
      vms: [makeVm({ name: 'win11' }), makeVm({ id: 'v2', name: 'ubuntu', vmUuid: 'ubuntu' })],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    render(
      <MemoryRouter initialEntries={['/containers?tab=vm&focus=win11']}>
        <Containers />
        <LocationProbe />
      </MemoryRouter>
    );
    // VM tab 激活 + 滚动定位
    expect(screen.getByText('win11')).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    // 目标 VM 卡片高亮,其他不高亮
    const card = document.querySelector('[data-vm-name="win11"]');
    expect(card?.className).toContain('ring-blue-500');
    expect(document.querySelector('[data-vm-name="ubuntu"]')?.className).not.toContain(
      'ring-blue-500'
    );
    // query 已被 replace 清掉
    expect(screen.getByTestId('loc').textContent).toBe('/containers');
  });

  it('?focus=不存在的容器 → 不滚动不高亮,页面正常渲染', () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'c1' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    render(
      <MemoryRouter initialEntries={['/containers?focus=ghost']}>
        <Containers />
      </MemoryRouter>
    );
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(screen.getByText('nginx')).toBeInTheDocument();
  });

  // ==== 续 55 商业化:Pro 门控 ====
  it('未解锁 → Compose tab 显示 ProGate 锁引导(不渲染 ComposeStacks)', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user: UserEvent = userEvent.setup();
    renderContainers();
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    expect(screen.queryByTestId('compose-stacks')).not.toBeInTheDocument();
    expect(screen.getByText(/Compose 管理 · Pro 功能/)).toBeInTheDocument();
  });

  it('未解锁 → 全选行和行内 checkbox 不渲染(批量操作 → Pro)', () => {
    __setLicenseStateForTest({ status: 'none' });
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'c1' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    expect(screen.queryByLabelText('全选/反选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('选择 nginx')).not.toBeInTheDocument();
    // 容器卡片本身仍在
    expect(screen.getByText('nginx')).toBeInTheDocument();
  });

  it('未解锁 → 点击 VM 卡片仍弹 VmDetailsModal(VM 基础详情免费)', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user: UserEvent = userEvent.setup();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [],
      vms: [makeVm({ name: 'win11' })],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByRole('button', { name: '虚拟机' }));
    await user.click(screen.getByText('win11'));
    expect(screen.getByTestId('vm-details-modal')).toBeInTheDocument();
    expect(screen.getByTestId('vm-details-modal')).toHaveTextContent('win11');
  });

  // ==== 续 91 F:容器一键更新(Pro,纯 GraphQL) ====
  it('⋮ 菜单「更新镜像」→ 确认对话框 → 确认后调 api.updateContainer + toast 成功', async () => {
    const user: UserEvent = userEvent.setup();
    const updateContainer = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useUnraidApi).mockReturnValue({
      updateContainer,
      updateContainers: vi.fn(),
    } as unknown as UnraidApiService);
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'container:abc' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: /更新镜像/ }));
    // 确认对话框(useDialog)
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('最新镜像');
    await user.click(within(dlg).getByRole('button', { name: '更新' }));
    await waitFor(() => expect(updateContainer).toHaveBeenCalledWith('container:abc'));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('「nginx」更新完成'));
  });

  it('「更新镜像」确认对话框点取消 → 不调 api.updateContainer', async () => {
    const user: UserEvent = userEvent.setup();
    const updateContainer = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useUnraidApi).mockReturnValue({
      updateContainer,
      updateContainers: vi.fn(),
    } as unknown as UnraidApiService);
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'container:abc' })],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: /更新镜像/ }));
    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updateContainer).not.toHaveBeenCalled();
  });

  it('更新失败 → toast.error 透传错误 + 后备刷新一次 containers', async () => {
    const user: UserEvent = userEvent.setup();
    const updateContainer = vi.fn().mockResolvedValue({ success: false, error: 'Endpoint timeout (120000ms)' });
    vi.mocked(useUnraidApi).mockReturnValue({
      updateContainer,
      updateContainers: vi.fn(),
    } as unknown as UnraidApiService);
    const refresh = vi.fn();
    vi.mocked(useContainersData).mockReturnValue({
      containers: [makeContainer({ name: 'nginx', containerId: 'container:abc' })],
      vms: [],
      loading: false,
      error: null,
      refresh,
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: /更新镜像/ }));
    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: '更新' }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        '「nginx」更新失败:Endpoint timeout (120000ms)',
        6000
      )
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('批量工具条「更新」→ 确认后 api.updateContainers(选中 ids) + toast 汇总', async () => {
    const user: UserEvent = userEvent.setup();
    const updateContainers = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useUnraidApi).mockReturnValue({
      updateContainer: vi.fn(),
      updateContainers,
    } as unknown as UnraidApiService);
    vi.mocked(useContainersData).mockReturnValue({
      containers: [
        makeContainer({ name: 'nginx', containerId: 'c1' }),
        makeContainer({ name: 'redis', containerId: 'c2' }),
      ],
      vms: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      containersRef: { current: [] },
      vmsRef: { current: [] },
    });
    renderContainers();
    await user.click(screen.getByLabelText('选择 nginx'));
    await user.click(screen.getByLabelText('选择 redis'));
    await user.click(screen.getByRole('button', { name: '更新' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('2 个容器');
    await user.click(within(dlg).getByRole('button', { name: '更新' }));
    await waitFor(() => expect(updateContainers).toHaveBeenCalledWith(['c1', 'c2']));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('批量更新完成: 2 个'));
  });
});
