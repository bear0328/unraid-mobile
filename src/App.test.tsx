// 【续 50 B7/D2】App 级测试
// B7:unhealthy 不再一律误判"鉴权失败" — 仅 graphql 端点 401 才 dispatch unraid-auth-error,
//     断网/超时等其他 unhealthy 停留 4 端点诊断屏(UnhealthyState),不被路由抢走
// D2:未知 URL 命中 path="*" 渲染 NotFound,不再白屏
// mock 说明:useApiHealth 直接给状态/报告(不真发 fetch);Layout/全局挂件/页面组件全部
// 打桩,聚焦 App 的门禁与路由逻辑(Layout 里 RouteErrorBoundary 的接线在
// components/RouteErrorBoundary.test.tsx 单独覆盖)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useApiHealth } from './hooks/useApiHealth';
import type { HealthReport } from './services/unraidApi/healthCheck';

vi.mock('./hooks/useApiHealth', () => ({
  useApiHealth: vi.fn(),
}));

// 全局挂件打桩:避免 fetch/订阅等副作用,本文件只测 App 门禁 + 路由
vi.mock('./components/AuthErrorListener', () => ({ default: () => null }));
vi.mock('./components/ErrorToastBridge', () => ({ default: () => null }));
vi.mock('./components/ToastContainer', () => ({ default: () => null }));
vi.mock('./components/InstallPrompt', () => ({ default: () => null }));
vi.mock('./components/PerformanceBudgetAlert', () => ({ default: () => null }));
vi.mock('./components/ContainerEventWatcher', () => ({ default: () => null }));
vi.mock('./components/VitalsAutoRecorder', () => ({ default: () => null }));
vi.mock('./components/RemoteReporter', () => ({ default: () => null }));

// Layout 打桩成纯 Outlet(RouteErrorBoundary 接线在 RouteErrorBoundary.test.tsx 覆盖)
vi.mock('./components/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Outlet /> };
});

// lazy 页面打桩,避免真页面加载时的 fetch/重依赖
vi.mock('./pages/Dashboard', () => ({ default: () => <div>仪表盘页</div> }));
vi.mock('./pages/Containers', () => ({ default: () => <div>容器页</div> }));
vi.mock('./pages/Shares', () => ({ default: () => <div>共享页</div> }));
vi.mock('./pages/Logs', () => ({ default: () => <div>日志页</div> }));
vi.mock('./pages/Settings', () => ({ default: () => <div>设置页</div> }));
vi.mock('./pages/Debug', () => ({ default: () => <div>调试页</div> }));
vi.mock('./pages/Notifications', () => ({ default: () => <div>通知页</div> }));

const mockUseApiHealth = vi.mocked(useApiHealth);

function makeReport(graphqlOverride: Partial<HealthReport['endpoints']['graphql']>): HealthReport {
  return {
    ok: false,
    endpoints: {
      healthz: { ok: true, latencyMs: 1 },
      graphql: { ok: false, latencyMs: 1, error: 'some error', ...graphqlOverride },
      config: { ok: true, latencyMs: 1 },
      files: { ok: true, latencyMs: 1 },
    },
    startedAt: Date.now(),
    durationMs: 5,
  };
}

function mockHealth(status: 'healthy' | 'unhealthy', report: HealthReport | null) {
  mockUseApiHealth.mockReturnValue({
    status,
    report,
    recheck: vi.fn(),
    isConfigured: true,
  });
}

describe('App (B7/D2)', () => {
  let authErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // 已配置状态:getApiConfig() 读到配置 → 跳过启动加载直接进 App
    localStorage.setItem('unraid-mobile-server-url', 'http://nas.local');
    localStorage.setItem('unraid-mobile-api-key', 'test-key');
    window.history.pushState({}, '', '/containers');
    authErrorSpy = vi.fn();
    window.addEventListener('unraid-auth-error', authErrorSpy);
  });

  afterEach(() => {
    window.removeEventListener('unraid-auth-error', authErrorSpy);
    window.history.pushState({}, '', '/');
  });

  it('unhealthy 但非 401(超时/断网)→ 不 dispatch unraid-auth-error,停留诊断屏', () => {
    mockHealth('unhealthy', makeReport({ error: 'Endpoint timeout (3000ms)' }));
    render(<App />);
    // 诊断屏在(4 端点列表 + 部分异常标题)
    expect(screen.getByText('unRAID 服务器部分异常')).toBeInTheDocument();
    expect(screen.getByTestId('healthz-endpoint-graphql')).toBeInTheDocument();
    // 不派发鉴权失败事件
    expect(authErrorSpy).not.toHaveBeenCalled();
  });

  it('unhealthy 且 graphql 404/500 → 同样不 dispatch,停留诊断屏', () => {
    mockHealth('unhealthy', makeReport({ status: 500, error: 'HTTP 500' }));
    render(<App />);
    expect(screen.getByText('unRAID 服务器部分异常')).toBeInTheDocument();
    expect(authErrorSpy).not.toHaveBeenCalled();
  });

  it('unhealthy 且 graphql 401 → dispatch unraid-auth-error(真鉴权失败)', () => {
    mockHealth('unhealthy', makeReport({ status: 401, error: 'Unauthenticated' }));
    render(<App />);
    expect(authErrorSpy).toHaveBeenCalledTimes(1);
    const evt = authErrorSpy.mock.calls[0][0] as CustomEvent;
    expect(evt.detail.reason).toBe('invalid-api-key');
  });

  it('graphql 401 但当前已在 /settings → 不重复 dispatch', async () => {
    window.history.pushState({}, '', '/settings');
    mockHealth('unhealthy', makeReport({ status: 401, error: 'Unauthenticated' }));
    render(<App />);
    // /settings 放行 children,设置页正常渲染
    expect(await screen.findByText('设置页')).toBeInTheDocument();
    expect(authErrorSpy).not.toHaveBeenCalled();
  });

  it('healthy + 未知路径 → 渲染 NotFound(不再白屏),给回仪表盘链接', () => {
    window.history.pushState({}, '', '/no-such-page');
    mockHealth('healthy', null);
    render(<App />);
    expect(screen.getByText('页面不存在')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回仪表盘' })).toHaveAttribute('href', '/');
  });

  it('healthy + 已知路径 → 正常渲染对应页面', async () => {
    mockHealth('healthy', null);
    render(<App />);
    expect(await screen.findByText('容器页')).toBeInTheDocument();
    expect(screen.queryByText('页面不存在')).not.toBeInTheDocument();
  });
});
