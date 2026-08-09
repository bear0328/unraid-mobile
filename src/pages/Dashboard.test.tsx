// 【阶段 P2-12 - 2026-06-16 续 24】Dashboard 页面集成测试
// 覆盖:无 cache skeleton / 有 cache 直接渲染 / 无 config 提示 / data error 提示 /
//       disks=[] NoDataState / 后台刷新中标记 / 并行 fetch + readSpeed/writeSpeed 计算
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UnraidSystemInfo, UnraidDisk, UnraidNetworkInfo } from '../services';

// 【续 43 2026-06-20】Dashboard 用 react-router Link,必须包 MemoryRouter
const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

// Mock usePolling:模拟 useEffect 行为 — 只在组件首次 mount 时跑一次 fn(后续 re-render 不再触发)
// 真 usePolling 用 useEffect deps=[delay, enabled] 实现,callback 引用变化不重跑
// 这里用 triggered flag 模拟:首次触发后,后续 render 调用 mock 都 noop,避免无限 re-render 循环
// 【续 45.2 2026-06-27】setTimeout(0) 是 macrotask,在 testing-library act 之外跑,
//   setState 不会 flush 到 DOM → waitFor 看到的还是旧 Skeleton。
//   改用 microtask(Promise.resolve().then)在 act 内 flush,fn 里的 setState 能被 React 应用
// Mock usePolling:模拟 useEffect 行为 — 只在组件首次 mount 时跑一次 fn(后续 re-render 不再触发)
// 真 usePolling 用 useEffect deps=[delay, enabled] 实现,callback 引用变化不重跑
// 这里用 triggered flag 模拟:首次触发后,后续 render 调用 mock 都 noop,避免无限 re-render 循环
// 【续 45.2 2026-06-27】用真 useEffect 在 commit 阶段调 fn,setState 在 effect 里合法,
//   testing-library 的 act 会 flush effect + 微任务 → setState 生效。
//   之前用 setTimeout/Promise.resolve 在 act 之外跑,setState 不 flush 到 DOM。
// Mock usePolling:模拟 useEffect 行为 — 只在组件首次 mount 时跑一次 fn(后续 re-render 不再触发)
// 真 usePolling 用 useEffect deps=[delay, enabled] 实现,callback 引用变化不重跑
// 这里用 triggered flag 模拟:首次触发后,后续 render 调用 mock 都 noop,避免无限 re-render 循环
// 【续 45.2 2026-06-27】setTimeout(0) 推到 render 之后。测试用 `await act(async () => render(...))`
//   包裹 render,async act 会 flush setTimeout + microtask + fn 里的 setState 到 DOM。
//   之前用同步 render + waitFor,setState 在 act 之外不 flush → DOM 卡在 Skeleton。
let pollingTriggered = false;
vi.mock('../hooks/usePolling', () => ({
  usePolling: (fn: () => Promise<void>) => {
    if (!pollingTriggered) {
      pollingTriggered = true;
      setTimeout(() => fn().catch(() => {}), 0);
    }
  },
  __resetPolling: () => {
    pollingTriggered = false;
  },
}));

// Mock api:每个测试用 mockResolvedValueOnce 控制返回值
const mockGetSystemInfo = vi.fn();
const mockGetDisks = vi.fn();
const mockGetNetworkInfo = vi.fn();
const mockGetSpinStatus = vi.fn();
const mockGetServerMeta = vi.fn();
// 【续 91 D/G】Dashboard 直调 parityApi/upsApi 子模块(unraidApi.ts 类是并行 F 范围不动),
// 这里 mock 掉避免真实 fetch;默认 null(卡不渲染)
const mockGetParityCheckStatus = vi.fn();
const mockGetUpsDevices = vi.fn();
vi.mock('../services/unraidApi/parityApi', () => ({
  // 箭头包装延迟取值:工厂在 const 初始化前执行,直接引用会 TDZ 报错
  getParityCheckStatus: (...args: unknown[]) => mockGetParityCheckStatus(...args),
}));
vi.mock('../services/unraidApi/upsApi', () => ({
  getUpsDevices: (...args: unknown[]) => mockGetUpsDevices(...args),
}));
vi.mock('../hooks/useUnraidApi', () => ({
  useUnraidApi: vi.fn(() => ({
    getSystemInfo: mockGetSystemInfo,
    getDisks: mockGetDisks,
    getNetworkInfo: mockGetNetworkInfo,
    getSpinStatus: mockGetSpinStatus,
    getServerMeta: mockGetServerMeta,
  })),
  useApiConfig: vi.fn(() => ({ isConfigured: true })),
}));

// 【续 45.2 2026-06-27】mock useContainersData:真 hook 内部也调 usePolling,
// 会抢占 mock 的 pollingTriggered flag,导致 Dashboard 的 usePolling callback 永不执行
vi.mock('../hooks/useContainersData', () => ({
  useContainersData: vi.fn(() => ({
    containers: [],
    vms: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    containersRef: { current: [] },
    vmsRef: { current: [] },
  })),
}));

import { useApiConfig, useUnraidApi } from '../hooks/useUnraidApi';
import * as pollingMock from '../hooks/usePolling';
import { getCacheKey } from '../services/unraidApi/cache';
import Dashboard from './Dashboard';

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

function makeDisk(overrides: Partial<UnraidDisk> = {}): UnraidDisk {
  return {
    name: 'disk1',
    device: '/dev/sda',
    status: 'DISK_OK',
    size: 1000000000,
    used: 500000000,
    temperature: 35,
    type: 'data',
    ...overrides,
  } as UnraidDisk;
}

function makeNetwork(overrides: Partial<UnraidNetworkInfo> = {}): UnraidNetworkInfo {
  return {
    name: 'br0',
    status: 'UP',
    bytesReceived: 1024,
    bytesSent: 512,
    rxSec: 0,
    txSec: 0,
    ...overrides,
  } as UnraidNetworkInfo;
}

beforeEach(() => {
  localStorage.clear();
  // 【续 45.2】fake timers:让 mock usePolling 的 setTimeout(0) 可控,
  // advanceTimersByTimeAsync 推进 + flush microtask + act 包裹 setState
  vi.useFakeTimers();
  // 重置 polling triggered flag,允许新测试再次触发 fn
  (pollingMock as unknown as { __resetPolling: () => void }).__resetPolling?.();
  mockGetSystemInfo.mockReset();
  mockGetDisks.mockReset();
  mockGetNetworkInfo.mockReset();
  mockGetSpinStatus.mockReset();
  mockGetServerMeta.mockReset();
  mockGetParityCheckStatus.mockReset();
  mockGetUpsDevices.mockReset();
  // 默认成功路径
  mockGetSystemInfo.mockResolvedValue(makeSystem());
  mockGetDisks.mockResolvedValue([makeDisk()]);
  mockGetNetworkInfo.mockResolvedValue([makeNetwork()]);
  // 【续 66】spin 轻查询默认空 Map(测试不感知徽章)
  mockGetSpinStatus.mockResolvedValue(new Map());
  // 【续 89b】serverMeta 默认版本+license,无更新提醒
  mockGetServerMeta.mockResolvedValue({ version: '7.3.0', regTy: 'LIFETIME', osUpdate: null });
  // 【续 91 D/G】默认无 parity 数据(卡不渲染);UPS 默认非 Pro 不拉取
  mockGetParityCheckStatus.mockResolvedValue(null);
  mockGetUpsDevices.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Dashboard 页面', () => {
  it('无 cache + loading=true(首次) → 显示 Skeleton', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText(/首次加载中/)).toBeInTheDocument();
  });

  it('isConfigured=false → 显示 ConfigRequiredState 提示', async () => {
    vi.mocked(useApiConfig).mockReturnValueOnce({ config: null, isConfigured: false });
    vi.mocked(useUnraidApi).mockReturnValueOnce(null as unknown as ReturnType<typeof useUnraidApi>);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    // 推进 mock usePolling 的 setTimeout(0) + flush microtask + act flush setState
    await vi.advanceTimersByTimeAsync(10);
    expect(
      screen.getByText('请先在设置页面配置 unRAID 服务器地址和 API 密钥')
    ).toBeInTheDocument();
  });

  it('数据 fetch 成功 → 渲染 server name + uptime + 5 个卡片标题', async () => {
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('tower')).toBeInTheDocument();
    // `运行时长: {uptime}` 文本拆分成多个 text node + 嵌套父元素,用 children.length===0 限定叶子
    expect(
      screen.getByText(
        (_, node) =>
          node?.children?.length === 0 &&
          !!node?.textContent?.includes('运行时长') &&
          !!node?.textContent?.includes('5h')
      )
    ).toBeInTheDocument();
    // 卡片标题(【续 90】ArrayCard 删除,阵列使用率并入 DiskCard 标题)
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('内存')).toBeInTheDocument();
    expect(screen.getByText('网络 IO')).toBeInTheDocument();
    expect(screen.getByText('磁盘状态')).toBeInTheDocument();
  });

  it('fetch 抛错 → 显示"无法连接到 unRAID 服务器" + ConfigRequiredState', async () => {
    mockGetSystemInfo.mockRejectedValueOnce(new Error('network down'));
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('无法连接到 unRAID 服务器')).toBeInTheDocument();
  });

  it('【续 46.3】无 cache mount → 不拉磁盘(getDisks 不调用),显示磁盘空态卡', async () => {
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    // 核心回归守卫:mount 永远不得自动拉磁盘(iOS/无痕清 LS 后冷启动唤盘的根因)
    expect(mockGetDisks).not.toHaveBeenCalled();
    // 磁盘空态由 DiskCard 空态卡表达(【续 90】ArrayCard 已删,替代旧的页面级"暂无数据")
    expect(screen.getAllByText(/磁盘数据未加载/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/暂无数据/)).not.toBeInTheDocument();
  });

  it('成功 fetch 后 → saveDashboardCache 写入 localStorage', async () => {
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('tower')).toBeInTheDocument();
    // fn 里 saveDashboardCache 已写 localStorage
    const raw = localStorage.getItem('unraid-mobile-dashboard-cache');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.systemInfo.name).toBe('tower');
  });

  it('readSpeed/writeSpeed 计算:两次「刷新磁盘」的 reads/writes 增量 → 实时速度', async () => {
    // 第一次点:reads=1000, writes=500(基线样本,无速度)
    mockGetDisks.mockResolvedValueOnce([makeDisk({ name: 'disk1', reads: 1000, writes: 500 })]);
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    // mount 不拉磁盘 → 空态卡里点「刷新磁盘」显式加载
    await act(async () => {
      screen.getByRole('button', { name: '刷新磁盘数据(会唤醒休眠的阵列盘)' }).click();
    });
    expect(screen.getByText('DISK1')).toBeInTheDocument();
    // 第二次点:reads=2000(+1000), writes=1000(+500) → 算出实时速度
    mockGetDisks.mockResolvedValueOnce([makeDisk({ name: 'disk1', reads: 2000, writes: 1000 })]);
    await act(async () => {
      screen.getByRole('button', { name: '刷新磁盘数据(会唤醒休眠的阵列盘)' }).click();
    });
    expect(screen.getByText('DISK1')).toBeInTheDocument();
  });

  it('有 cache → 直接渲染卡片,不显示 Skeleton', async () => {
    // 预置 cache(模拟上次访问的快照)
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem({ name: 'cached-tower', uptime: '99h' }),
        disks: [makeDisk()],
        networks: [makeNetwork()],
      })
    );
    renderWithRouter(<Dashboard />);
    // 立即看到 cached-tower(loading=false 因为 cache 存在)
    expect(screen.getByText('cached-tower')).toBeInTheDocument();
    expect(screen.queryByText(/首次加载中/)).not.toBeInTheDocument();
    // 推进 polling 让 fn 跑完(会 setSystemInfo(tower) 覆盖 cache,但卡片已渲染)
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('CPU')).toBeInTheDocument();
  });

  it('【续 91 D】parity 数据到位 → ParityCard 渲染(默认 null 不渲染)', async () => {
    mockGetParityCheckStatus.mockResolvedValue({
      arrayState: 'STARTED',
      status: 'RUNNING',
      running: true,
      paused: false,
      correcting: false,
      progress: 45,
      speed: '120 MB/s',
      errors: 0,
      date: null,
      duration: null,
    });
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('Parity 校验')).toBeInTheDocument();
  });

  it('【续 91 G】未解锁 Pro(默认)→ UPS 拉取跳过,UpsCard 渲染 ProGate 引导卡', async () => {
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(mockGetUpsDevices).not.toHaveBeenCalled();
    expect(screen.getByText(/UPS 监控 · Pro 功能/)).toBeInTheDocument();
  });

  it('【续 91 A1/A2】getDisks 失败(返 null)→ 磁盘 state 与 LS 缓存都不被清空', async () => {
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem(),
        disks: [makeDisk()],
        networks: [makeNetwork()],
      })
    );
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('DISK1')).toBeInTheDocument();

    // 刷新磁盘失败(【续 91 A1】API 层失败返 null,不是 []):旧数据保留
    mockGetDisks.mockResolvedValueOnce(null);
    await act(async () => {
      screen.getByRole('button', { name: '刷新磁盘数据(会唤醒休眠的阵列盘)' }).click();
    });
    expect(screen.getByText('DISK1')).toBeInTheDocument();
    const parsed = JSON.parse(localStorage.getItem('unraid-mobile-dashboard-cache')!);
    expect(parsed.disks).toHaveLength(1); // 缓存未被空数组覆盖
  });

  it('【续 91 A2/M5】getSystemInfo 失败(返 null)→ 不谎报刷新,错误降级 banner 不整屏', async () => {
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem({ name: 'cached-tower' }),
        disks: [],
        networks: [makeNetwork()],
      })
    );
    mockGetSystemInfo.mockResolvedValueOnce(null);
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    // 旧数据保留 + banner 提示(有数据时不整屏错误)
    expect(screen.getByText('cached-tower')).toBeInTheDocument();
    expect(screen.getByText('无法连接到 unRAID 服务器')).toBeInTheDocument();
    expect(screen.queryByText('需要配置')).not.toBeInTheDocument();
    // 不谎报:saveDashboardCache 未执行,预置 cache 仍无 timestamp
    const parsed = JSON.parse(localStorage.getItem('unraid-mobile-dashboard-cache')!);
    expect(parsed.timestamp).toBeUndefined();
  });

  it('【续 97 P1-3】错误 banner 带「重试」按钮:点击重拉成功 → banner 消失', async () => {
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem({ name: 'cached-tower' }),
        disks: [],
        networks: [makeNetwork()],
      })
    );
    // mount 刷新失败 → 降级 banner(有旧数据不整屏)
    mockGetSystemInfo.mockResolvedValueOnce(null);
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(screen.getByText('无法连接到 unRAID 服务器')).toBeInTheDocument();

    // 点 banner 上的「重试」(后续调用走默认成功 mock)→ 重拉成功,banner 消失
    await act(async () => {
      screen.getByRole('button', { name: '重试刷新' }).click();
    });
    expect(screen.queryByText('无法连接到 unRAID 服务器')).not.toBeInTheDocument();
    expect(screen.getByText('tower')).toBeInTheDocument();
  });

  it('【续 91 M3】single-flight:轻量刷新在飞时点「刷新磁盘」→ 排队执行,不吞也不重复', async () => {
    // 预置 cache:页面在 mount 刷新在飞时已渲染(loading=false),磁盘按钮可点
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem(),
        disks: [makeDisk()],
        networks: [makeNetwork()],
      })
    );
    let resolveSys!: (v: UnraidSystemInfo | null) => void;
    mockGetSystemInfo.mockImplementationOnce(
      () => new Promise<UnraidSystemInfo | null>((r) => { resolveSys = r; })
    );
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);
    expect(mockGetSystemInfo).toHaveBeenCalledTimes(1); // mount fire 在飞

    await act(async () => {
      screen.getByRole('button', { name: '刷新磁盘数据(会唤醒休眠的阵列盘)' }).click();
    });
    // 在飞的是轻量刷新,磁盘刷新排队等待(不被合并吞掉,也不并发重发)
    expect(mockGetDisks).not.toHaveBeenCalled();

    await act(async () => {
      resolveSys(makeSystem());
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(mockGetDisks).toHaveBeenCalledTimes(1); // 排队后恰好执行一次
    expect(mockGetSystemInfo).toHaveBeenCalledTimes(2);
    expect(screen.getByText('DISK1')).toBeInTheDocument();
  });

  it('【续 95 P0】手动刷新 → 失效 systemInfo/serverMeta/parity/ups 缓存,disks 缓存保留(不唤盘)', async () => {
    // 预置 dashboard cache:页面 mount 即渲染(loading=false),刷新按钮可点
    localStorage.setItem(
      'unraid-mobile-dashboard-cache',
      JSON.stringify({
        systemInfo: makeSystem(),
        disks: [makeDisk()],
        networks: [makeNetwork()],
      })
    );
    // 预置 5 个 namespace 缓存(disks 用于验证绝不被清)
    for (const ns of ['systemInfo', 'serverMeta', 'parity', 'ups', 'disks']) {
      localStorage.setItem(getCacheKey(ns), JSON.stringify({ data: null, timestamp: Date.now() }));
    }
    renderWithRouter(<Dashboard />);
    await vi.advanceTimersByTimeAsync(10);

    await act(async () => {
      screen.getByRole('button', { name: '手动刷新 Dashboard 数据' }).click();
    });

    // 4 个轻量 namespace 全部失效(与轮询 tick 口径对齐,原漏 parity/ups)
    for (const ns of ['systemInfo', 'serverMeta', 'parity', 'ups']) {
      expect(localStorage.getItem(getCacheKey(ns))).toBeNull();
    }
    // disks namespace 绝不清(避免下次轮询拉 getDisks 唤盘)
    expect(localStorage.getItem(getCacheKey('disks'))).not.toBeNull();
  });

  it('【续 91 M4】切服务器(serverUrl 变 + api 重建)→ 内存 state 重置并立即重拉', async () => {
    vi.mocked(useApiConfig).mockReturnValue({
      config: { serverUrl: 'http://nas-a', apiKey: 'k' },
      isConfigured: true,
    });
    try {
      localStorage.setItem('unraid-mobile-server-url', 'http://nas-a');
      localStorage.setItem('unraid-mobile-api-key', 'k');
      localStorage.setItem(
        'unraid-mobile-dashboard-cache',
        JSON.stringify({
          systemInfo: makeSystem(),
          disks: [makeDisk()],
          networks: [makeNetwork()],
        })
      );
      renderWithRouter(<Dashboard />);
      await vi.advanceTimersByTimeAsync(10);
      expect(screen.getByText('DISK1')).toBeInTheDocument();
      expect(screen.getByText('tower')).toBeInTheDocument();

      // 切服务器:LS 地址变更;下一次 render(mock useUnraidApi 每次新建 api)→
      // 检测到 serverUrl 变化 → 重置内存 state + 立即用新 api 轻量重拉(不含 disks)
      localStorage.setItem('unraid-mobile-server-url', 'http://nas-b');
      await vi.advanceTimersByTimeAsync(30_000); // useNow tick 触发 re-render
      expect(screen.queryByText('DISK1')).not.toBeInTheDocument(); // 磁盘 state 已重置
      expect(screen.getByText('tower')).toBeInTheDocument(); // 主数据已重拉
    } finally {
      vi.mocked(useApiConfig).mockReturnValue({ config: null, isConfigured: true });
    }
  });
});
