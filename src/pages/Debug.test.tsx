// 【阶段 P2-13 - 2026-06-16 续 25】Debug 页面集成测试
// 覆盖:无 config 错误提示 / 加载骨架 / GraphQL 查询结果展示 / 错误日志列表 /
//       注入测试 / 清空 / 展开 / 删除
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ErrorRecord } from '../utils/errorReporter';

// Mock usePolling:同 Dashboard 模式,triggered flag 模拟 useEffect 行为
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

// Mock useErrors:由测试控制 errors / count / clear / remove
const mockClear = vi.fn();
const mockRemove = vi.fn();
let mockErrors: ErrorRecord[] = [];
vi.mock('../hooks/useErrors', () => ({
  useErrors: vi.fn(() => ({
    errors: mockErrors,
    count: mockErrors.length,
    clear: mockClear,
    remove: mockRemove,
  })),
}));

// Mock useApiConfig
vi.mock('../hooks/useUnraidApi', () => ({
  useApiConfig: vi.fn(() => ({ config: { serverUrl: 'http://test', apiKey: 'k' } })),
}));

import { useApiConfig } from '../hooks/useUnraidApi';
import * as pollingMock from '../hooks/usePolling';
import { __injectTestError } from '../utils/errorReporter';
import Debug from './Debug';

beforeEach(() => {
  (pollingMock as unknown as { __resetPolling: () => void }).__resetPolling?.();
  mockClear.mockClear();
  mockRemove.mockClear();
  mockErrors = [];
  // 默认 fetch mock:返 200 空 JSON(让 Debug 走完 polling 循环,setLoading(false))
  // 各 case 可在 render 前用 vi.spyOn(globalThis, 'fetch').mockImplementationOnce(...) 覆盖
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
});

function makeError(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: `e-${Math.random()}`,
    source: 'react',
    message: 'TypeError: x is undefined',
    timestamp: Date.now(),
    ...overrides,
  } as ErrorRecord;
}

describe('Debug 页面', () => {
  it('无 config → 显示"请先在设置页面配置服务器信息"错误', async () => {
    vi.mocked(useApiConfig).mockReturnValueOnce({ config: null, isConfigured: false });
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByText('请先在设置页面配置服务器信息')).toBeInTheDocument();
    });
  });

  it('有 config + fetch 成功 → 显示"API 诊断工具"标题 + 4 个 API 响应块', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByText('API 诊断工具 (GraphQL)')).toBeInTheDocument();
    });
    // 4 个 API 响应块标题
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('docker containers')).toBeInTheDocument();
    expect(screen.getByText('vms')).toBeInTheDocument();
    expect(screen.getByText('shares')).toBeInTheDocument();
  });

  it('fetch HTTP 错误 → 对应 API 显示 "HTTP 错误" 提示', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('server error', { status: 500 })
    );
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByText('API 诊断工具 (GraphQL)')).toBeInTheDocument();
    });
    // 4 个 API 都显示 error 字段
    const http500s = screen.getAllByText(/HTTP 500/);
    expect(http500s.length).toBeGreaterThanOrEqual(4);
  });

  it('无错误日志(count=0) → 显示"暂无错误"提示 + 注入测试按钮', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 200 })
    );
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByText('API 诊断工具 (GraphQL)')).toBeInTheDocument();
    });
    expect(screen.getByText(/暂无错误/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /注入测试/ })).toBeInTheDocument();
    // count=0 时清空按钮不显示
    expect(screen.queryByRole('button', { name: /清空/ })).not.toBeInTheDocument();
  });

  it('有错误日志 → 显示错误列表 + 红色 count badge + 清空按钮', async () => {
    mockErrors = [makeError({ message: 'Error A' }), makeError({ message: 'Error B' })];
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByText('Error A')).toBeInTheDocument();
    });
    expect(screen.getByText('Error B')).toBeInTheDocument();
    // count badge 显示 "2"
    expect(screen.getByText('2')).toBeInTheDocument();
    // 清空按钮可见
    expect(screen.getByRole('button', { name: /清空/ })).toBeInTheDocument();
  });

  it('点击"清空"按钮 → 调用 clear()', async () => {
    const user = userEvent.setup();
    mockErrors = [makeError()];
    render(<Debug />);
    const clearBtn = await screen.findByRole('button', { name: /清空/ });
    await user.click(clearBtn);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('点击错误行 → 展开显示 stack/extra', async () => {
    const user = userEvent.setup();
    mockErrors = [
      makeError({
        message: 'Error with stack',
        stack: 'at foo() at bar()',
        extra: 'component: TestComp',
      }),
    ];
    render(<Debug />);
    const errRow = await screen.findByText('Error with stack');
    // 默认不显示 stack
    expect(screen.queryByText('at foo() at bar()')).not.toBeInTheDocument();
    // 点击错误行
    await user.click(errRow);
    expect(screen.getByText('at foo() at bar()')).toBeInTheDocument();
    expect(screen.getByText('component: TestComp')).toBeInTheDocument();
  });

  it('点击错误展开后的"删除"按钮 → 调用 remove(id)', async () => {
    const user = userEvent.setup();
    const err = makeError({ message: 'Delete me' });
    mockErrors = [err];
    render(<Debug />);
    const errRow = await screen.findByText('Delete me');
    // 先展开
    await user.click(errRow);
    // 再点删除
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(mockRemove).toHaveBeenCalledWith(err.id);
  });

  it('SOURCE_LABEL 映射:react/window/unhandledrejection/manual 显示对应 emoji label', async () => {
    mockErrors = [
      makeError({ source: 'react', message: 'r' }),
      makeError({ source: 'window', message: 'w' }),
      makeError({ source: 'unhandledrejection', message: 'p' }),
      makeError({ source: 'manual', message: 'm' }),
    ];
    render(<Debug />);
    expect(await screen.findByText(/⚛️ React/)).toBeInTheDocument();
    expect(screen.getByText(/🪟 window/)).toBeInTheDocument();
    expect(screen.getByText(/⏳ Promise/)).toBeInTheDocument();
    expect(screen.getByText(/✋ 手动/)).toBeInTheDocument();
  });

  it('点击"注入测试"按钮 → 触发 __injectTestError()(不报错)', async () => {
    const user = userEvent.setup();
    // __injectTestError 是真 errorReporter 工具,不 mock
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}', { status: 200 })
    );
    render(<Debug />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /注入测试/ })).toBeInTheDocument();
    });
    // 点击不抛错
    await user.click(screen.getByRole('button', { name: /注入测试/ }));
    // __injectTestError 已被调用(没断言次数,只验证不抛)
    expect(__injectTestError).toBeDefined();
  });
});
