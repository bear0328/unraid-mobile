import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Layout from './components/Layout';
import AuthErrorListener from './components/AuthErrorListener';
import ErrorToastBridge from './components/ErrorToastBridge';
import ToastContainer from './components/ToastContainer';
import InstallPrompt from './components/InstallPrompt';
import PerformanceBudgetAlert from './components/PerformanceBudgetAlert';
import ContainerEventWatcher from './components/ContainerEventWatcher';
import VitalsAutoRecorder from './components/VitalsAutoRecorder';
import RemoteReporter from './components/RemoteReporter';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { getApiConfig, loadConfigFromFile, saveApiConfig, subscribeApiConfigChange } from './services/unraidApi';
import { checkServerBinding } from './services/licenseBinding';
import { useApiHealth } from './hooks/useApiHealth';

// Code splitting: 5 个 tab 拆 chunk(续 27 删 /vms,容器和 VM 合并到 /containers)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Containers = lazy(() => import('./pages/Containers'));
// 【续 48 2026-07-19】Compose 页并入 /containers 的 compose tab,旧 /compose 路由重定向
const Shares = lazy(() => import('./pages/Shares'));
const Logs = lazy(() => import('./pages/Logs'));
const Settings = lazy(() => import('./pages/Settings'));
const Debug = lazy(() => import('./pages/Debug'));
const Notifications = lazy(() => import('./pages/Notifications'));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60dvh]">
    <div className="text-center">
      <div className="text-3xl mb-2 animate-pulse">⏳</div>
      <p className="text-gray-400 text-xs">加载页面…</p>
    </div>
  </div>
);

// 【续 50 D2】404 页:旧代码没有 path="*" 路由,未知 URL 渲染空白页,用户以为 app 挂了
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
      <div className="text-5xl mb-3">🧭</div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">页面不存在</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        您访问的地址没有对应的页面
      </p>
      <Link
        to="/"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
      >
        返回仪表盘
      </Link>
    </div>
  );
}

function App() {
  const [initDone, setInitDone] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const stored = getApiConfig();
    if (stored) {
      setInitDone(true);
    } else {
      // 【续 46.5 2026-07-19】LS 空 → 尝试从服务器 settings.json 恢复并直接放行。
      // 旧行为(42.5.3):即使 file config 恢复成功也强制 needsSetup=true 跳 /settings,
      // 语义是"用户主动清 LS = 想重新配"。
      // 服务器 settings.json 本就是设计好的配置恢复源(46.4 PUT 已修),
      // 恢复成功即放行;恢复失败(首次使用/服务器没配置)才落 /settings。
      // 【续 49】settings.json 不再存 apiKey — 只恢复出 serverUrl 时仍落 /settings
      // (apiKey 需用户输一次,存 localStorage 后冷启动不再丢),但 serverUrl 已预填
      loadConfigFromFile().then((fileConfig) => {
        if (fileConfig) {
          // 写回 LS,useApiConfig / useApiHealth 后续流程能跑
          saveApiConfig(fileConfig);
          setNeedsSetup(!fileConfig.apiKey);
        } else {
          setNeedsSetup(true);
        }
        setInitDone(true);
      });
    }
  }, []);

  // 【续 46.3 2026-07-18】配置保存后解除 needsSetup — 旧代码 needsSetup 只在启动时算一次,
  // 首配/LS 被清的用户在 Settings 保存成功后点仪表盘仍被 index 路由弹回 /settings 困死,
  // 只能手动刷新页面(用户实测踩到)。订阅配置变化,有配置即放行
  // 【续 59 2026-07-22】同一订阅点:服务器配置变化(含切换服务器/首配完成)后
  // 重跑 license 绑机检查 —— 切到未绑定的服务器时 Pro 门即锁(mismatch)
  useEffect(() => {
    checkServerBinding(); // 启动一次(initLicense 已在 main.tsx 完成首验)
    return subscribeApiConfigChange(() => {
      if (getApiConfig()) setNeedsSetup(false);
      checkServerBinding();
    });
  }, []);

  if (!initDone) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100 dark:bg-gray-900">
        <div className="text-center px-6">
          <div className="text-5xl mb-4 animate-pulse">⚙️</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">正在加载配置...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthErrorListener />
        <ErrorToastBridge />
        <ToastContainer />
        <InstallPrompt />
        <PerformanceBudgetAlert />
        <ContainerEventWatcher />
        <VitalsAutoRecorder />
        <RemoteReporter />
        {/* 【续 39-1 候选 - 2026-06-18】启动期 API 健康自检门:healthy 才放行 */}
        <AppReadyGate>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route
                index
                element={
                  needsSetup ? (
                    <Navigate to="/settings" />
                  ) : (
                    <Suspense fallback={<PageFallback />}>
                      <Dashboard />
                    </Suspense>
                  )
                }
              />
              <Route
                path="containers"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Containers />
                  </Suspense>
                }
              />
              <Route
                path="compose"
                element={<Navigate to="/containers" replace />}
              />
              <Route
                path="shares/*"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Shares />
                  </Suspense>
                }
              />
              <Route
                path="logs"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Logs />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Settings />
                  </Suspense>
                }
              />
              <Route
                path="debug"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Debug />
                  </Suspense>
                }
              />
              <Route
                path="notifications"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <Notifications />
                  </Suspense>
                }
              />
              {/* 【续 50 D2】兜底 404:未知 URL 不再白屏 */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AppReadyGate>
      </BrowserRouter>
    </ThemeProvider>
  );
}

/**
 * 【续 39-1 候选 - 2026-06-18】启动期 API 健康自检门
 * - 未配置:放行(由 needsSetup 流程跳 /settings)
 * - checking:显示 splash
 * - unhealthy:显示 UnhealthyState(端点级错误 + 重试 + 跳设置)
 * - healthy:放行
 *
 * 【续 42 2026-06-18】UnhealthyState 升级:展示 4 端点(/healthz /graphql /config /files)状态
 * 任一端点 fail 给针对性提示(nginx 挂 / 鉴权错 / 挂载问题)
 */
type HealthEndpointName = 'healthz' | 'graphql' | 'config' | 'files';
// 【续 42.1 2026-06-18】按 HTTP status 给针对性 hint,免得用户看到 403/404 不知道该看哪里
const ENDPOINT_META: Record<
  HealthEndpointName,
  {
    label: string;
    /** 通用 fallback hint */
    hint: string;
    /** 401 鉴权失败 */
    hint401: string;
    /** 403 nginx 拒绝(权限/alias 路径错) */
    hint403: string;
    /** 404 路由不存在 */
    hint404: string;
    /** 5xx 后端异常 */
    hint5xx: string;
    /** 网络/超时(无 status) */
    timeoutHint: string;
  }
> = {
  healthz: {
    label: 'nginx 服务',
    hint: '容器没启动或 nginx 配置错误',
    hint401: 'healthz 端点不应返 401,nginx 配置异常',
    hint403: 'healthz 端点不应返 403,nginx 配置异常',
    hint404: 'healthz 端点不应返 404,default.conf 缺 location = /healthz',
    hint5xx: 'nginx 内部错误,检查 default.conf 语法',
    timeoutHint: '容器没启动 / 防火墙挡 80 端口 / nginx 进程死',
  },
  graphql: {
    label: 'unRAID API',
    hint: 'API Key 错或 GraphQL 后端没运行',
    hint401: 'API Key 错(在 Settings 改)或 unraid GraphQL 鉴权配置变',
    hint403: 'unraid GraphQL 后端拒绝,检查 /graphql 代理配置',
    hint404: 'unraid GraphQL 后端路径变了,检查 proxy_pass 192.168.6.140:8001/graphql',
    hint5xx: 'unraid GraphQL 后端崩,看 unraid 系统日志',
    timeoutHint: '192.168.6.140:8001 unraid API 不可达 / 防火墙挡',
  },
  config: {
    label: '配置存储',
    hint: './config 目录挂载或权限异常',
    hint401: 'config 不应返 401,nginx 配置异常',
    hint403: 'config 目录权限错(nginx 进程没读权限)或 alias 路径错',
    hint404: 'config 目录可访问,首次装无 settings.json(正常,进 Settings 配)',
    hint5xx: 'config 后端异常,看 nginx 错误日志',
    timeoutHint: 'config 目录不可达,检查 docker mount',
  },
  files: {
    label: '文件系统',
    hint: '/mnt/user 共享目录挂载异常',
    hint401: 'files 端点不应返 401',
    hint403: '/mnt/user 或 /mnt/cache 权限错',
    hint404: '/mnt/user 目录空或挂载路径错',
    hint5xx: 'nginx 内部错误,检查 autoindex 配置',
    timeoutHint: '/mnt/user 不可达,检查 shfs / 缓存池挂载',
  },
};

function AppReadyGate({ children }: { children: React.ReactNode }) {
  const health = useApiHealth();
  // 【续 42.4 2026-06-19】用户主动来 /settings 改 apiKey → 放行 children,不被 unhealthy 屏拦死
  // 不然形成死循环:unhealthy → 点"打开设置" → /settings 仍跑 healthCheck(用错 key)→ unhealthy → 看不到表单
  const location = useLocation();
  const isOnSettings = location.pathname === '/settings';

  // 【续 42.4 2026-06-19 Step 6 修】用户切页面 + health 状态变 unhealthy → 派发 unraid-auth-error
  // 让 AuthErrorListener 弹 toast + 跳 /settings
  // 不调 health.recheck()(会死循环:recheck → checking → unhealthy → useEffect 跑 → 再 recheck)
  // 依赖加 health.status:saveApiConfig 后 useApiHealth 正在 checkHealth 时切到 /containers,
  // 之后 status 从 checking → unhealthy 必须再触发一次
  // 【续 50 B7】旧逻辑把任何 unhealthy(断网/超时/nginx 挂/404/500)都误判成"鉴权失败",
  // toast 误导 + 200ms 后抢走路由,下方精心做的 4 端点诊断屏(UnhealthyState)只闪一下就没了。
  // 改为仅 graphql 端点 status=401(真 API Key 错,见 healthCheck.ts 对 [鉴权失败] 的 sniff)
  // 才派发事件跳 /settings;其余 unhealthy 留在诊断屏由用户重试/排障。
  // graphql.ts 在请求返 401/UNAUTHENTICATED 时已派过同名事件,AuthErrorListener 做了 1s 去重,不会双 toast
  useEffect(() => {
    const graphqlAuthFailed = health.report?.endpoints.graphql.status === 401;
    if (health.status === 'unhealthy' && graphqlAuthFailed && !isOnSettings) {
      window.dispatchEvent(
        new CustomEvent('unraid-auth-error', {
          detail: { reason: 'invalid-api-key', source: 'AppReadyGate-health-401' },
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, health.status, health.report]);

  // 【续 42.5 2026-06-19 修 #8】未配置 → 用 <Navigate> 立即重定向到 /settings
  // 之前 useEffect + return children → 跑 children 渲染 + 导航竞态
  if (!health.isConfigured && !isOnSettings) {
    return <Navigate to="/settings" replace />;
  }

  if (isOnSettings) {
    return <>{children}</>;
  }

  if (health.status === 'checking' || health.status === 'idle') {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100 dark:bg-gray-900">
        <div className="text-center px-6">
          <div className="text-5xl mb-4 animate-pulse">🔌</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">正在连接 unRAID 服务器...</p>
          {health.report && health.status === 'checking' && (
            <p className="text-xs text-gray-400 mt-2">上次耗时 {health.report.durationMs}ms</p>
          )}
        </div>
      </div>
    );
  }
  if (health.status === 'unhealthy') {
    const report = health.report;
    const failedNames = report
      ? Object.entries(report.endpoints)
          .filter(([, r]) => !r.ok)
          .map(([n]) => n)
      : [];
    const allFailed = failedNames.length === 4;
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100 dark:bg-gray-900 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
          <div className="text-center">
            <div className="text-5xl mb-3">🚫</div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {allFailed ? 'nginx 服务不可达' : 'unRAID 服务器部分异常'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {report ? `总耗时 ${report.durationMs}ms` : ''}
            </p>
            {report && (
              <ul className="text-left text-xs space-y-1.5 mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                {(Object.keys(ENDPOINT_META) as HealthEndpointName[]).map((name) => {
                  const r = report.endpoints[name];
                  const meta = ENDPOINT_META[name];
                  // 【续 42.1 2026-06-18】按 HTTP status 给针对性诊断 hint
                  const statusHint = !r.status
                    ? meta.timeoutHint
                    : r.status === 401
                      ? meta.hint401
                      : r.status === 403
                        ? meta.hint403
                        : r.status === 404
                          ? meta.hint404
                          : r.status >= 500
                            ? meta.hint5xx
                            : meta.hint;
                  return (
                    <li
                      key={name}
                      className="flex items-start gap-2"
                      data-testid={`healthz-endpoint-${name}`}
                    >
                      <span
                        className={
                          r.ok
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {r.ok ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            {meta.label}
                          </span>
                          <span className="text-gray-400 tabular-nums">{r.latencyMs}ms</span>
                        </div>
                        {!r.ok && (
                          <div className="text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                            {r.error || '未知错误'}
                            {r.status ? ` (HTTP ${r.status})` : ''}
                            <span className="text-gray-400"> — {statusHint}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => void health.recheck()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
              >
                🔄 重试
              </button>
              <button
                // 【续 42.1 2026-06-18】AppReadyGate unhealthy 拦死 Routes,navigate 不到未渲染路由
                // 改用 window.location 强制整页 reload,新页面重新跑 healthCheck
                onClick={() => {
                  window.location.href = '/settings';
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg"
              >
                ⚙️ 打开设置
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default App;
// build: 1780968869
