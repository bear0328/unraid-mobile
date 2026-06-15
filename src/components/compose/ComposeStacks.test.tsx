// 【续 47 2026-07-19】Compose 页面集成测试
// 【续 48 2026-07-19】Compose 页并入 Containers 页 compose tab,被测对象改为 ComposeStacks 组件
// 覆盖: 列表渲染 / 错误提示 / 未配置提示 / 点栈开详情弹窗 / 启动操作调 service
// 【续 50 C7】异步操作轮询:按 lastResult 报成功/失败 + 90 次轮询上限
// 【续 50 C10】刷新 toast 成败分支
// 【续 50 C-补充】401 提示按 status 判定
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeApiError, type ComposeStack, type ComposeStackDetail } from '../../services/composeApi';

vi.mock('../../hooks/useUnraidApi', () => ({
  useApiConfig: vi.fn(() => ({ config: { serverUrl: 'http://test', apiKey: 'k' }, isConfigured: true })),
}));

// 【续 50】toast 断言:useToast mock 成 vi.fn 组
const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

const mockGetStacks = vi.fn();
const mockGetStack = vi.fn();
const mockGetStackLog = vi.fn();
const mockStackAction = vi.fn();
vi.mock('../../services/composeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/composeApi')>();
  return {
    ...actual,
    getStacks: (...args: unknown[]) => mockGetStacks(...args),
    getStack: (...args: unknown[]) => mockGetStack(...args),
    getStackLog: (...args: unknown[]) => mockGetStackLog(...args),
    stackAction: (...args: unknown[]) => mockStackAction(...args),
  };
});

import { useApiConfig } from '../../hooks/useUnraidApi';
import ComposeStacks from './ComposeStacks';

function makeStack(overrides: Partial<ComposeStack> = {}): ComposeStack {
  return {
    name: 'emby',
    project: 'emby',
    status: 'running(1)',
    running: true,
    autostart: true,
    lastResult: null,
    composeFile: 'compose.yaml',
    ...overrides,
  };
}

function makeDetail(stack: ComposeStack): ComposeStackDetail {
  return {
    stack,
    composeYaml: 'services:\n  emby:\n    image: emby/embyserver\n',
    overrideYaml: null,
    lastCmdLog: '',
    opRunning: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useApiConfig).mockReturnValue({
    config: { serverUrl: 'http://test', apiKey: 'k' },
    isConfigured: true,
  });
  mockGetStacks.mockResolvedValue([
    makeStack(),
    makeStack({ name: 'lucky', status: null, running: false, autostart: false }),
  ]);
});

afterEach(() => {
  // C7 轮询用例用 fake timers,兜底还原
  vi.useRealTimers();
});

describe('ComposeStacks 组件(容器页 compose tab)', () => {
  it('渲染栈列表:名称 / 状态 / 自启标记 / 统计行', async () => {
    render(<ComposeStacks />);
    expect(await screen.findByText('emby')).toBeInTheDocument();
    expect(screen.getByText('lucky')).toBeInTheDocument();
    expect(screen.getByText('running(1)')).toBeInTheDocument();
    expect(screen.getByText('未运行')).toBeInTheDocument();
    expect(screen.getByText('自启')).toBeInTheDocument();
    expect(screen.getByText('2 个栈 · 1 个运行中')).toBeInTheDocument();
  });

  it('加载失败 → 显示错误信息', async () => {
    mockGetStacks.mockRejectedValueOnce(new Error('网络错误: compose-api 不可达'));
    render(<ComposeStacks />);
    expect(await screen.findByText(/compose-api 不可达/)).toBeInTheDocument();
  });

  // 【续 49.3】公开版优雅降级:后端不存在(404/502/503)→ 安装指引空态,不显示报错
  it.each([404, 502, 503])('后端缺失(%i)→ 安装指引空态,无错误横幅', async (status) => {
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(status, 'backend missing'));
    render(<ComposeStacks />);
    expect(await screen.findByTestId('compose-backend-missing')).toBeInTheDocument();
    expect(screen.getByText(/Compose 后端未安装/)).toBeInTheDocument();
    expect(screen.getByText(/install-compose-api\.sh/)).toBeInTheDocument();
    // 不显示原始报错,也不显示"未发现项目"空态
    expect(screen.queryByText(/backend missing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/未发现 compose.manager 项目/)).not.toBeInTheDocument();
  });

  it('后端缺失空态 → 点「重新检测」→ 后端恢复后显示栈列表', async () => {
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(404, 'not found'));
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await user.click(await screen.findByText('重新检测'));
    // beforeEach 的默认 mockResolvedValue 生效 → 列表出现
    expect(await screen.findByText('emby')).toBeInTheDocument();
    expect(screen.queryByTestId('compose-backend-missing')).not.toBeInTheDocument();
  });

  it('401 不算后端缺失 → 保留错误横幅样式', async () => {
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(401, '未授权: X-Api-Key 无效'));
    render(<ComposeStacks />);
    expect(await screen.findByText(/未授权/)).toBeInTheDocument();
    expect(screen.queryByTestId('compose-backend-missing')).not.toBeInTheDocument();
  });

  it('未配置 → 显示配置提示,不请求', async () => {
    vi.mocked(useApiConfig).mockReturnValue({ config: null, isConfigured: false });
    render(<ComposeStacks />);
    expect(await screen.findByText(/请先在设置页配置/)).toBeInTheDocument();
    expect(mockGetStacks).not.toHaveBeenCalled();
  });

  it('点栈 → 打开详情弹窗(加载 getStack,显示操作按钮和 yaml)', async () => {
    const stack = makeStack();
    mockGetStack.mockResolvedValue(makeDetail(stack));
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await user.click(await screen.findByText('emby'));
    expect(await screen.findByText('启动')).toBeInTheDocument();
    expect(screen.getByText('停止')).toBeInTheDocument();
    expect(screen.getByText('重启')).toBeInTheDocument();
    expect(screen.getByText('拉取镜像')).toBeInTheDocument();
    expect(screen.getByText('重建')).toBeInTheDocument();
    expect(mockGetStack).toHaveBeenCalledWith('emby');
    // yaml 内容可见
    expect(screen.getByText(/emby\/embyserver/)).toBeInTheDocument();
  });

  it('详情弹窗点启动 → stackAction(up),成功后刷新列表', async () => {
    mockGetStack.mockResolvedValue(makeDetail(makeStack()));
    mockStackAction.mockResolvedValue({ exitCode: 0, output: 'started' });
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await user.click(await screen.findByText('emby'));
    await user.click(await screen.findByText('启动'));
    await waitFor(() => expect(mockStackAction).toHaveBeenCalledWith('emby', 'up'));
    // 成功后重新拉列表(初次 1 次 + onChanged 1 次)
    await waitFor(() => expect(mockGetStacks.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('点停止 → 持久确认条:不自动消失,点「确认执行」才调 stackAction,点「取消」复位', async () => {
    mockGetStack.mockResolvedValue(makeDetail(makeStack()));
    mockStackAction.mockResolvedValue({ exitCode: 0, output: 'stopped' });
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await user.click(await screen.findByText('emby'));
    // 第一次点:确认条出现,不执行
    await user.click(await screen.findByText('停止'));
    expect(await screen.findByTestId('op-confirm-banner')).toBeInTheDocument();
    expect(mockStackAction).not.toHaveBeenCalled();
    // 取消:确认条消失
    await user.click(screen.getByText('取消'));
    expect(screen.queryByTestId('op-confirm-banner')).not.toBeInTheDocument();
    // 再点停止 → 确认条 → 确认执行:真正执行
    await user.click(screen.getByText('停止'));
    await user.click(await screen.findByText('确认执行'));
    await waitFor(() => expect(mockStackAction).toHaveBeenCalledWith('emby', 'down'));
  });

  // ---------- 【续 50 C10】刷新 toast 成败分支 ----------
  it('刷新成功 → 弹「已刷新」', async () => {
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await screen.findByText('emby');
    await user.click(screen.getByLabelText('刷新'));
    await waitFor(() => expect(mockToast.info).toHaveBeenCalledWith('已刷新'));
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('刷新失败 → 不弹「已刷新」,改弹错误 toast', async () => {
    const user = userEvent.setup();
    render(<ComposeStacks />);
    await screen.findByText('emby');
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(500, 'HTTP 500'));
    await user.click(screen.getByLabelText('刷新'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(mockToast.info).not.toHaveBeenCalledWith('已刷新');
  });

  // ---------- 【续 50 C-补充】401 提示按 status 判定,不再靠 message 字符串匹配 ----------
  it('401 → 错误横幅附「请检查设置页的 API Key」', async () => {
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(401, '未授权: X-Api-Key 无效'));
    render(<ComposeStacks />);
    expect(await screen.findByText(/请检查设置页的 API Key/)).toBeInTheDocument();
  });

  it('非 401 错误(message 碰巧含 "401" 字样)→ 不附 API Key 提示', async () => {
    mockGetStacks.mockRejectedValueOnce(new ComposeApiError(500, '端口 4010 连接失败'));
    render(<ComposeStacks />);
    expect(await screen.findByText(/4010 连接失败/)).toBeInTheDocument();
    expect(screen.queryByText(/请检查设置页的 API Key/)).not.toBeInTheDocument();
  });
});

// ---------- 【续 50 C7】异步操作(pull/rebuild)轮询:结果判定 + 上限 ----------
// 轮询间隔 2s × 上限 90 次,必须用 fake timers
// 写法跟随 Dashboard.test.tsx(续 45.2): 原生 .click() + advanceTimersByTimeAsync,均包 act
describe('ComposeStacks 异步操作轮询(C7)', () => {
  /** act 包裹的定时器推进(setState 不告警) */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  /** fake timers 下:开弹窗 → 点「拉取镜像」→ 轮询已启动(getStackLog 恒 running:true) */
  async function startPullWithFakeTimers(): Promise<ComposeStack> {
    vi.useFakeTimers();
    const stack = makeStack();
    mockGetStack.mockResolvedValue(makeDetail(stack));
    mockStackAction.mockResolvedValue({ async: true });
    mockGetStackLog.mockResolvedValue({ log: '执行中…', running: true });
    render(<ComposeStacks />);
    await advance(10); // getStacks → 栈列表
    await act(async () => {
      screen.getByText('emby').click();
    });
    await advance(10); // getStack → 详情弹窗
    await act(async () => {
      screen.getByText('拉取镜像').click();
    });
    await advance(10); // stackAction({async:true}) → 启动轮询
    expect(mockStackAction).toHaveBeenCalledWith('emby', 'pull');
    return stack;
  }

  it('轮询结束 + lastResult=success → toast.success(完成)', async () => {
    const stack = await startPullWithFakeTimers();
    // 下一次轮询:running=false;完成后取详情拿到本次 success 结果
    mockGetStackLog.mockResolvedValue({ log: 'Pulled\n', running: false });
    mockGetStack.mockResolvedValue(
      makeDetail({
        ...stack,
        lastResult: {
          result: 'success',
          exit_code: 0,
          operation: 'pull',
          timestamp: '2026-07-19T01:00:00Z',
        },
      })
    );
    await advance(2100); // 触发一次轮询
    expect(mockToast.success).toHaveBeenCalledWith('拉取镜像完成');
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('轮询结束 + lastResult=error → toast.error(带 exit code 和日志摘要),不再误报成功', async () => {
    const stack = await startPullWithFakeTimers();
    mockGetStackLog.mockResolvedValue({ log: 'Step 1/2\nError: manifest unknown\n', running: false });
    // 完成后详情(getStack)里: lastResult=error,日志最后一行非空行进 toast 摘要
    const d = makeDetail({
      ...stack,
      lastResult: {
        result: 'error',
        exit_code: 1,
        operation: 'pull',
        timestamp: '2026-07-19T01:00:00Z',
      },
    });
    d.lastCmdLog = 'Step 1/2\nError: manifest unknown\n';
    mockGetStack.mockResolvedValue(d);
    await advance(2100);
    expect(mockToast.error).toHaveBeenCalledWith('拉取镜像失败(exit 1): Error: manifest unknown');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('轮询超上限(90 次 × 2s)→ toast.error(超时)并停止轮询', async () => {
    await startPullWithFakeTimers(); // getStackLog 恒 running:true,永不结束
    await advance(2000 * 95); // 越过 90 次上限
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('超时'));
    expect(mockToast.success).not.toHaveBeenCalled();
    // 已停止:再推进时间也不再发起轮询
    const calls = mockGetStackLog.mock.calls.length;
    await advance(20000);
    expect(mockGetStackLog.mock.calls.length).toBe(calls);
  });
});
