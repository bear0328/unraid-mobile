// 【D4 2026-06-14】WebDAV 密码配置 localStorage(续 49 起从 sessionStorage 改,推翻 D4 的"只本 session 用")
// 【5.1.b 2026-06-14】日志密码配置 localStorage(同上)
// 【阶段 1 P0 2026-06-15】useTheme 拆出到 useTheme.ts,修 fast-refresh warning
// 【阶段 P2-多服务器 - 2026-06-17 续 33-10】集成 ServerList 组件
// 【阶段 P2-备份 - 2026-06-17 续 34-1】加备份/导入 section
// 【续 45.8b+ 2026-07-09】多个 setTimeout 加 cleanup:用 timersRef 跟踪所有 timer,
//   unmount 时 clearAll 避免 setState on unmounted component 警告
import { useTheme } from '../context/useTheme';
import { useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPollInterval, setPollInterval } from '../utils/pollInterval';
import { saveApiConfig, loadConfigFromFile } from '../services';
import { useApiConfig } from '../hooks/useUnraidApi';
import { checkHealth, type EndpointName } from '../services/unraidApi/healthCheck';

const ENDPOINT_LABEL: Record<EndpointName, string> = {
  healthz: 'nginx 服务',
  graphql: 'unRAID API',
  config: '配置存储',
  files: '文件系统',
};
import ServerList from '../components/ServerList';
import LicenseSection from '../components/LicenseSection';
import PrimaryColorPicker from '../components/PrimaryColorPicker';
import ProGate from '../components/ProGate';
import { useToast } from '../hooks/useToast';
import { exportBackup, importBackup } from '../utils/backup';
import { getDavAuthHeader } from '../components/shares/davAuth';
import { useWebhookConfig, sendWebhook, type WebhookProvider } from '../utils/webhook';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import {
  DEFAULT_REPORTER_CONFIG,
  resetCooldowns,
  runReporterCheck,
  type RemoteReporterConfig,
  getRemoteReporterConfig,
  setRemoteReporterConfig,
} from '../utils/remoteReporter';

const DAV_PASSWORD_KEY = 'unraid-mobile-dav-password';
const LOG_PASSWORD_KEY = 'unraid-mobile-log-password';

export default function Settings() {
  const { theme, toggleTheme, auto, setAuto } = useTheme();
  // 【续 55 商业化】ProGate 跳来时(state.focusLicense)滚动到 License 区
  const location = useLocation();
  useEffect(() => {
    if ((location.state as { focusLicense?: boolean } | null)?.focusLicense) {
      document.getElementById('license-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.state]);
  // 【修 #3 #4 2026-06-24】主题切换加 toast 反馈 — 修 Settings 页 toggleTheme 不弹 toast bug
  const handleToggleTheme = () => {
    toggleTheme();
    // theme 是旧值(异步更新),用当前 theme 推导目标值
    const next = theme === 'dark' || theme === 'hc-dark' ? 'light' : 'dark';
    const labels: Record<string, string> = {
      light: '浅色',
      dark: '深色',
      'hc-light': '高对比度浅色',
      'hc-dark': '高对比度深色',
    };
    toast.success(`已切换到 ${labels[next] ?? next}`);
  };
  const { config: existingConfig } = useApiConfig();
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  // 【D4】WebDAV 密码状态：localStorage 读写
  const [davPassword, setDavPassword] = useState('');
  // 【5.1.b】日志密码状态：localStorage 读写
  const [logPassword, setLogPassword] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDavPassword, setShowDavPassword] = useState(false);
  const [showLogPassword, setShowLogPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [davSaved, setDavSaved] = useState(false);
  const [logSaved, setLogSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  // 【续 42 2026-06-18】4 端点测试结果 — endpoints 列表给 inline UI 用,msg 给 toast summary
  const [testResult, setTestResult] = useState<{
    kind: 'ok' | 'err';
    msg: string;
    endpoints: Array<{ name: EndpointName; ok: boolean; latencyMs: number; error?: string }>;
    durationMs: number;
  } | null>(null);
  const toast = useToast();

  // 【续 45.8b+ 2026-07-09】setTimeout 跟踪 — 收集所有 timer id,unmount 时 clearAll
  // 之前 5 处 setTimeout(setSaved/setTestResult/setDavSaved/setLogSaved) 都没 cleanup,
  // 2s/30s 后 callback 仍 setState,触发 React "Can't perform state update on unmounted component" 警告
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const trackTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  };
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (existingConfig) {
      setServerUrl(existingConfig.serverUrl);
      setApiKey(existingConfig.apiKey);
    } else {
      loadConfigFromFile().then((fileConfig) => {
        if (fileConfig) {
          setServerUrl(fileConfig.serverUrl);
          setApiKey(fileConfig.apiKey);
          saveApiConfig(fileConfig);
        }
      });
    }
    // 加载 WebDAV 密码
    if (typeof window !== 'undefined') {
      const davStored = localStorage.getItem(DAV_PASSWORD_KEY);
      if (davStored) setDavPassword(davStored);
      // 【5.1.b】加载日志密码
      const logStored = localStorage.getItem(LOG_PASSWORD_KEY);
      if (logStored) setLogPassword(logStored);
    }
  }, [existingConfig]);

  const handleSaveSettings = async () => {
    if (!serverUrl || !apiKey) {
      alert('请填写完整的服务器地址和 API 密钥');
      return;
    }
    // 1. 先存到 localStorage（续 49:apiKey 也存 LS,杀进程不丢）
    saveApiConfig({ serverUrl, apiKey });

    // 2. 写回宿主机 settings.json（跨设备共享 serverUrl）
    //    nginx /config/  location 已加 dav_methods PUT
    //    【续 49】settings.json 只写 serverUrl — GET 无鉴权,apiKey 明文落盘是发布 blocker;
    //    apiKey 只存浏览器 localStorage,不上服务器
    //    【续 50】PUT 已加 auth_basic(复用 .davpasswd)防覆写投毒 — 需带 DAV 凭证,
    //    未配置 DAV 密码时 401,仅影响跨设备同步,本地配置仍生效
    try {
      const resp = await fetch('/config/settings.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getDavAuthHeader() },
        body: JSON.stringify({ serverUrl }),
      });
      if (!resp.ok) {
        // 【续 50.2】nginx 鉴权失败改返 403(防浏览器原生弹窗),401/403 同判
        if (resp.status === 401 || resp.status === 403) {
          throw new Error('服务器同步需要先在下方配置 WebDAV 密码');
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      setSaved(true);
      trackTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(
        '已保存到本地，但写回服务器文件失败: ' + msg + '\n该设备配置仍然生效，但其他设备不会同步。'
      );
    }
  };

  // 【续 39-1 候选 - 2026-06-18】轻量探活测试 — 用当前输入框的值,不依赖已保存的 liveApi
  // (这样配错 key 时也能立即反馈,不需要先保存)
  // 【QA-2 2026-06-18】同时写按钮下方的 inline status,3s 自动消失 — toast 弹得太快(<100ms)用户看不到,inline 兜底
  // 【续 42 2026-06-18】升级到 4 端点并发测试(/healthz /graphql /config /files),inline 显示每个端点状态
  const handleTestConnection = async () => {
    if (!serverUrl || !apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const report = await checkHealth(serverUrl, apiKey, true);
      const endpoints = (Object.keys(ENDPOINT_LABEL) as EndpointName[]).map((name) => {
        const r = report.endpoints[name];
        return { name, ok: r.ok, latencyMs: r.latencyMs, error: r.error };
      });
      const failed = endpoints.filter((e) => !e.ok);
      const summary = report.ok
        ? `✓ 4/4 端点正常 (${report.durationMs}ms)`
        : failed.length === 4
          ? `✗ 全部端点异常 (${report.durationMs}ms)`
          : `✗ ${failed.length}/4 端点异常 (${report.durationMs}ms)`;
      if (report.ok) {
        toast.success(summary);
        setTestResult({ kind: 'ok', msg: summary, endpoints, durationMs: report.durationMs });
      } else {
        toast.error(summary);
        setTestResult({ kind: 'err', msg: summary, endpoints, durationMs: report.durationMs });
      }
    } catch (e) {
      const msg = `测试异常: ${e instanceof Error ? e.message : String(e)}`;
      toast.error(msg);
      // 【续 42.1 2026-06-18】catch 兜底不空 endpoints,UI ul 仍能渲染(4 个红叉「未测试」)
      setTestResult({
        kind: 'err',
        msg,
        endpoints: (Object.keys(ENDPOINT_LABEL) as EndpointName[]).map((name) => ({
          name,
          ok: false,
          latencyMs: 0,
          error: '测试未完成(异常)',
        })),
        durationMs: 0,
      });
    } finally {
      setTesting(false);
      // 【续 42.1 2026-06-18】延长 inline UI 时长 5s → 30s,让用户有时间看 4 端点列表
      // 【续 45.8b+ 2026-07-09】改 trackTimeout,unmount 时自动 clear
      trackTimeout(() => setTestResult(null), 30000);
    }
  };

  // 【D4】WebDAV 密码单独保存（仅 localStorage，不入服务器文件）
  const handleSaveDavPassword = () => {
    if (!davPassword) {
      localStorage.removeItem(DAV_PASSWORD_KEY);
      setDavSaved(true);
      trackTimeout(() => setDavSaved(false), 2000);
      return;
    }
    localStorage.setItem(DAV_PASSWORD_KEY, davPassword);
    setDavSaved(true);
    trackTimeout(() => setDavSaved(false), 2000);
  };

  // 【5.1.b】日志密码单独保存（仅 localStorage，不入服务器文件）
  const handleSaveLogPassword = () => {
    if (!logPassword) {
      localStorage.removeItem(LOG_PASSWORD_KEY);
      setLogSaved(true);
      trackTimeout(() => setLogSaved(false), 2000);
      return;
    }
    localStorage.setItem(LOG_PASSWORD_KEY, logPassword);
    setLogSaved(true);
    trackTimeout(() => setLogSaved(false), 2000);
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">设置</h2>

      {/* 【续 33-10】服务器列表管理(在「服务器连接」之上,默认折叠感不强,常驻) */}
      <ServerList />

      {/* 【续 55 商业化】License 区(Pro 激活/状态/解绑) */}
      <LicenseSection />

      {/* Server Connection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">服务器连接</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              服务器地址
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              unRAID WebGUI 地址，不需要加 trailing slash
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API 密钥
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入您的 unRAID API 密钥"
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
              >
                {showApiKey ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              在 unRAID 设置 → API Keys 中生成
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg
                     font-medium transition-colors"
          >
            {saved ? '✓ 已保存' : '保存设置'}
          </button>

          {/* 【续 39-1 候选 - 2026-06-18】轻量探活测试(不阻塞保存) */}
          <button
            onClick={handleTestConnection}
            disabled={testing || !serverUrl || !apiKey}
            className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            {testing ? '🔌 测试中…' : '🔌 测试连接(轻量)'}
          </button>
          {/* 【QA-2 2026-06-18】inline 状态显示 — toast 太快看不到,按钮下方兜底 */}
          {/* 【续 42 2026-06-18】4 端点列表(每行绿勾/红叉 + 延迟),整体 summary 在第一行 */}
          {testResult && (
            <div data-testid="test-connection-result" className="text-xs mt-1.5 space-y-1.5">
              <p
                className={
                  testResult.kind === 'ok'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {testResult.msg}
              </p>
              {testResult.endpoints.length > 0 && (
                <ul className="bg-gray-50 dark:bg-gray-900/50 rounded p-2 space-y-0.5">
                  {testResult.endpoints.map((e) => (
                    <li
                      key={e.name}
                      data-testid={`test-endpoint-${e.name}`}
                      className="flex items-center gap-2"
                    >
                      <span
                        className={
                          e.ok
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {e.ok ? '✓' : '✗'}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 flex-1">
                        {ENDPOINT_LABEL[e.name]}
                      </span>
                      <span className="text-gray-400 tabular-nums">{e.latencyMs}ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 【D4 2026-06-14】WebDAV 鉴权密码 - 文件管理页用 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          WebDAV 鉴权密码
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          用于文件管理页的 上传 / 下载 / 删除 / 重命名 / 移动 / 拷贝 操作，以及服务器配置同步、文件浏览鉴权。
          仅保存在本浏览器（localStorage），不写入服务器。
        </p>
        <div className="space-y-4">
          <div className="relative">
            <input
              type={showDavPassword ? 'text' : 'password'}
              value={davPassword}
              onChange={(e) => setDavPassword(e.target.value)}
              placeholder="WebDAV 密码（与 nginx .davpasswd 一致）"
              className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowDavPassword(!showDavPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            >
              {showDavPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <button
            onClick={handleSaveDavPassword}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg
                     font-medium transition-colors"
          >
            {davSaved ? '✓ 已保存' : '保存 WebDAV 密码'}
          </button>
        </div>
      </div>

      {/* 【阶段 5.1.b 2026-06-14】日志鉴权密码 - 系统日志页用 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">日志鉴权密码</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          用于「日志」页查看系统日志（syslog 等）。 syslog 可能含 sshd 失败日志、docker token
          等敏感信息，加密码保护。 仅保存在本浏览器（localStorage），不写入服务器。
        </p>
        <div className="space-y-4">
          <div className="relative">
            <input
              type={showLogPassword ? 'text' : 'password'}
              value={logPassword}
              onChange={(e) => setLogPassword(e.target.value)}
              placeholder="日志密码（与 nginx .logpasswd 一致）"
              className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowLogPassword(!showLogPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            >
              {showLogPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <button
            onClick={handleSaveLogPassword}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg
                     font-medium transition-colors"
          >
            {logSaved ? '✓ 已保存' : '保存日志密码'}
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">外观</h3>

        {/* 【续 34-3】主题色 */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">主题色</p>
          <PrimaryColorPicker />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">深色模式</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {auto ? '跟随系统' : theme === 'dark' || theme === 'hc-dark' ? '已开启' : '已关闭'}
            </p>
          </div>
          <button
            onClick={handleToggleTheme}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              theme === 'dark' || theme === 'hc-dark' ? 'bg-primary-600' : 'bg-gray-300'
            }`}
            disabled={auto}
            title={auto ? '关闭"跟随系统"后可手动切换' : ''}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                theme === 'dark' || theme === 'hc-dark' ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 【续 36-1】跟随系统开关 */}
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary-600"
          />
          <span>🌓 跟随系统主题(系统切深色/浅色时自动同步)</span>
        </label>
      </div>

      {/* 【续 46 2026-07-12】数据刷新间隔 */}
      <PollIntervalSection />

      {/* 【续 48.1 2026-07-19】诊断入口(原底部 🔧 tab 收起,/debug 路由保留) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">诊断</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          API 诊断工具:逐个探测后端端点,排查连接/鉴权/挂载问题
        </p>
        <button
          // 【续 48.1】不用 <Link>:Settings 测试无 Router 包裹;整页跳转也符合 /debug 独立工具定位
          onClick={() => {
            window.location.href = '/debug';
          }}
          className="inline-block px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          🔧 打开诊断工具
        </button>
      </div>

      {/* About */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">关于</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>unRAID Mobile v0.1.0</p>
          <p>为移动端优化的 unRAID 管理界面</p>
        </div>
      </div>

      {/* 【续 34-1】备份与恢复 */}
      <BackupSection />

      {/* 【续 36-2】PWA 安装教程 */}
      <PwaInstallSection />

      {/* 【续 55 商业化】告警通知(Webhook + 阈值越界远程上报) → Pro,未解锁整块换 🔒 引导 */}
      <ProGate feature="告警通知">
        {/* 【续 34-7】Webhook 通知 */}
        <WebhookSection />

        {/* 【续 37-1】远程上报 */}
        <RemoteReporterSection />
      </ProGate>
    </div>
  );
}

// 【续 34-1】备份与恢复 section
function BackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  function handleExport() {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unraid-mobile-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // 【续 50 D6a】备份内容补上 Webhook 设置(key 名修好后导出不再恒 null,token 类密钥仍剔除)
    toast.success('已下载备份文件(含收藏/主题/Dashboard 顺序/Webhook 设置/服务器列表,不含敏感数据)');
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const overwrite = confirm(
      '是否覆盖现有设置?\n• 确定:完整恢复(主题/颜色/顺序全替换)\n• 取消:仅合并收藏和服务器列表'
    );
    try {
      const text = await f.text();
      const r = importBackup(text, { overwrite });
      const parts: string[] = [];
      if (r.favorites > 0) parts.push(`收藏 +${r.favorites}`);
      if (r.servers > 0) parts.push(`服务器 +${r.servers}`);
      if (r.theme) parts.push('主题');
      if (r.primaryColor) parts.push('主题色');
      if (r.dashboardOrder > 0) parts.push(`Dashboard 顺序(${r.dashboardOrder} 项)`);
      if (r.alertKeywords > 0) parts.push(`告警关键字(${r.alertKeywords} 项)`);
      if (r.webhookSettings) parts.push('Webhook');
      toast.success('导入完成: ' + (parts.join(' / ') || '无新内容'));
      // 刷新页面让所有状态应用
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error('导入失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        💾 备份与恢复
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {/* 【续 50 D6a】导出内容补 Webhook 设置;敏感清单补 Webhook token(导出已剔除,导入保留本地) */}
        导出收藏/主题/Dashboard 顺序/Webhook 设置/服务器列表到 JSON 文件。换设备或清缓存后可一键恢复。
        <br />
        <span className="text-yellow-600 dark:text-yellow-400">
          ⚠️ 不含 API 密钥、密码、Webhook token 等敏感数据(请重新配置)。
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleExport}
          className="px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center gap-1.5"
        >
          📤 导出备份
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImport}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg flex items-center gap-1.5"
        >
          📥 导入备份
        </button>
      </div>
    </div>
  );
}

// 【续 34-7】Webhook 通知 section
function WebhookSection() {
  const [cfg, setCfg] = useWebhookConfig();
  const toast = useToast();
  const [testing, setTesting] = useState(false);

  const PROVIDER_INFO: Record<
    WebhookProvider,
    { label: string; desc: string; placeholder: string }
  > = {
    bark: {
      label: 'Bark',
      desc: 'iOS 推送 App,URL 形如 https://api.day.app/your-key',
      placeholder: 'https://api.day.app/your-key',
    },
    telegram: { label: 'Telegram', desc: '通过 bot 发消息到指定 chat', placeholder: '' },
    discord: {
      label: 'Discord',
      desc: 'Webhook URL(频道设置 → 整合)',
      placeholder: 'https://discord.com/api/webhooks/...',
    },
    resend: {
      label: 'Email (Resend)',
      desc: '邮件通知,需 Resend 账号 + 验证发件域名',
      placeholder: 're_xxxxxxxx',
    },
    custom: {
      label: '自定义',
      desc: 'POST JSON 到任意 URL(包含 container/state/server/time/message)',
      placeholder: 'https://your-server.com/hook',
    },
  };

  function update<K extends keyof typeof cfg>(k: K, v: (typeof cfg)[K]) {
    setCfg({ ...cfg, [k]: v });
  }

  async function handleTest() {
    if (!cfg.enabled) {
      toast.warning('请先启用 Webhook');
      return;
    }
    setTesting(true);
    const ok = await sendWebhook(cfg, {
      container: 'test-container',
      state: 'exited',
      server: 'unRAID-test',
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
    setTesting(false);
    if (ok) toast.success('测试消息已发送,检查手机/客户端');
    else toast.error('发送失败,检查配置(URL/token/chatId)');
  }

  const info = PROVIDER_INFO[cfg.provider];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        🔔 容器事件 Webhook
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        容器状态从 运行中 变为 停止/退出 时,推送消息到 Bark / Telegram / Discord / 自定义 HTTP。
        同一容器 60s 冷却,首轮加载不触发。
      </p>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">启用</span>
        <button
          onClick={() => update('enabled', !cfg.enabled)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            cfg.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          aria-label={cfg.enabled ? '已启用' : '已禁用'}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              cfg.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          类型
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(Object.keys(PROVIDER_INFO) as WebhookProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => update('provider', p)}
              className={`px-2 py-1.5 text-xs rounded-lg border ${
                cfg.provider === p
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              }`}
            >
              {PROVIDER_INFO[p].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{info.desc}</p>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          URL
        </label>
        <input
          type="text"
          value={cfg.url}
          onChange={(e) => update('url', e.target.value)}
          placeholder={info.placeholder}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
        />
      </div>

      {cfg.provider === 'telegram' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Bot Token
            </label>
            <input
              type="text"
              value={cfg.token || ''}
              onChange={(e) => update('token', e.target.value)}
              placeholder="123456:ABC-..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Chat ID
            </label>
            <input
              type="text"
              value={cfg.chatId || ''}
              onChange={(e) => update('chatId', e.target.value)}
              placeholder="-1001234567890"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
          </div>
        </div>
      )}

      {/* 【续 36-5】Resend email */}
      {cfg.provider === 'resend' && (
        <div className="space-y-2 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Resend API Key
            </label>
            <input
              type="password"
              value={cfg.token || ''}
              onChange={(e) => update('token', e.target.value)}
              placeholder="re_xxxxxxxxxx"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              在{' '}
              <a
                href="https://resend.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                resend.com/api-keys
              </a>{' '}
              创建;发件域名需在 Resend 后台验证
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                From 邮箱
              </label>
              <input
                type="text"
                value={cfg.from || ''}
                onChange={(e) => update('from', e.target.value)}
                placeholder="alerts@yourdomain.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                收件人
              </label>
              <input
                type="text"
                value={cfg.to || ''}
                onChange={(e) => update('to', e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              主题模板
            </label>
            <input
              type="text"
              value={cfg.subject || ''}
              onChange={(e) => update('subject', e.target.value)}
              placeholder="[{{server}}] {{container}} {{state}}"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              变量: {'{{container}} {{state}} {{server}} {{time}}'}
            </p>
          </div>
        </div>
      )}

      {cfg.provider === 'custom' && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            消息模板
          </label>
          <input
            type="text"
            value={cfg.template || ''}
            onChange={(e) => update('template', e.target.value)}
            placeholder="[{{server}}] {{container}} -> {{state}}"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            变量: {'{{container}} {{state}} {{server}} {{time}}'}
          </p>
        </div>
      )}

      <button
        onClick={handleTest}
        disabled={testing}
        className="w-full py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50"
      >
        {testing ? '发送中…' : '🧪 发送测试消息'}
      </button>
    </div>
  );
}

// 【续 36-2】PWA 安装教程
function PwaInstallSection() {
  const { platform, standalone, canInstall, install, resetDismiss } = useInstallPrompt();
  const toast = useToast();

  if (standalone) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          📱 安装到主屏幕
        </h3>
        <p className="text-sm text-green-600 dark:text-green-400">
          ✓ 已作为 PWA 安装(以独立窗口运行)
        </p>
      </div>
    );
  }

  async function handleInstall() {
    const r = await install();
    if (r === 'accepted') toast.success('已安装,可在主屏幕/App 列表找到');
    else if (r === 'dismissed') toast.info('已取消安装');
    else toast.warning('当前浏览器不支持,按下方步骤手动安装');
  }

  function showIOSSteps() {
    return (
      <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
        <li>
          点击 Safari 底部分享按钮 <span className="font-mono">⎙</span>
        </li>
        <li>向下滑,选择「添加到主屏幕」</li>
        <li>确认名称,点击右上角「添加」</li>
        <li>回主屏幕即可看到 unRAID 图标,点击像 App 一样使用</li>
      </ol>
    );
  }

  function showAndroidSteps() {
    return (
      <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
        <li>
          点击右上角菜单 <span className="font-mono">⋮</span>
        </li>
        <li>选择「安装应用」或「添加到主屏幕」</li>
        <li>确认即可</li>
      </ol>
    );
  }

  function showDesktopSteps() {
    return (
      <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
        <li>Chrome 地址栏右侧会出现安装图标 ⊕</li>
        <li>点击后选择「安装」即可</li>
        <li>或在菜单中找到「安装 unRAID Mobile」</li>
      </ol>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        📱 安装到主屏幕
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        像 App 一样使用,全屏、桌面图标、离线也能打开已访问过的页面。 当前设备:{' '}
        <span className="font-mono">{platform}</span>
      </p>

      {canInstall ? (
        <button
          onClick={handleInstall}
          className="w-full mb-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg"
        >
          ⚡ 立即安装
        </button>
      ) : null}

      {platform === 'ios' && showIOSSteps()}
      {platform === 'android' && showAndroidSteps()}
      {platform === 'desktop' && showDesktopSteps()}
      {platform === 'unknown' && (
        <p className="text-sm text-gray-500">请用 Chrome / Edge / Safari 现代浏览器打开本应用</p>
      )}

      <button
        onClick={() => {
          resetDismiss();
          toast.success('已重置,iOS 用户重新进入会再次看到顶部提示');
        }}
        className="mt-3 text-[10px] text-gray-400 hover:text-primary-600"
      >
        ↺ 重置顶部提示关闭记忆
      </button>
    </div>
  );
}

// 【续 37-1】远程上报配置
function RemoteReporterSection() {
  const [cfg, setCfg] = useState<RemoteReporterConfig>(() => getRemoteReporterConfig());
  const [testing, setTesting] = useState(false);
  const toast = useToast();
  const [wh] = useWebhookConfig();

  function update<K extends keyof RemoteReporterConfig>(k: K, v: RemoteReporterConfig[K]) {
    const next = { ...cfg, [k]: v };
    setCfg(next);
    setRemoteReporterConfig(next);
  }

  async function handleTest() {
    setTesting(true);
    try {
      resetCooldowns();
      await runReporterCheck();
      toast.info('已触发一次检查,如阈值越界会走上方 Webhook 通道;无越界则无消息');
    } catch {
      toast.error('检查失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        📡 远程上报
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        越界时复用上方 Webhook 通道推送(可关)。不开 Webhook 本功能不工作。 Webhook 状态:{' '}
        <span className={wh.enabled ? 'text-green-600' : 'text-red-500'}>
          {wh.enabled ? '已启用' : '未启用'}
        </span>
      </p>

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm">启用 Web Vitals + 错误密度远程上报</span>
      </label>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">LCP 阈值(ms)</div>
          <input
            type="number"
            value={cfg.lcpMs}
            min={500}
            step={100}
            onChange={(e) => update('lcpMs', Math.max(500, Number(e.target.value) || 0))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">CLS 阈值</div>
          <input
            type="number"
            value={cfg.clsThreshold}
            min={0.01}
            step={0.01}
            onChange={(e) => update('clsThreshold', Math.max(0.01, Number(e.target.value) || 0))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">INP 阈值(ms)</div>
          <input
            type="number"
            value={cfg.inpMs}
            min={50}
            step={50}
            onChange={(e) => update('inpMs', Math.max(50, Number(e.target.value) || 0))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">错误数量阈值</div>
          <input
            type="number"
            value={cfg.errorCount}
            min={1}
            step={1}
            onChange={(e) => update('errorCount', Math.max(1, Number(e.target.value) || 1))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">错误窗口(分钟)</div>
          <input
            type="number"
            value={Math.round(cfg.errorWindowMs / 60000)}
            min={1}
            step={1}
            onChange={(e) =>
              update('errorWindowMs', Math.max(1, Number(e.target.value) || 1) * 60_000)
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">检测间隔(秒)</div>
          <input
            type="number"
            value={Math.round(cfg.intervalMs / 1000)}
            min={10}
            step={5}
            onChange={(e) =>
              update('intervalMs', Math.max(10, Number(e.target.value) || 10) * 1000)
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 dark:text-gray-400 mb-1">冷却(分钟)</div>
          <input
            type="number"
            value={Math.round(cfg.cooldownMs / 60000)}
            min={1}
            step={1}
            onChange={(e) =>
              update('cooldownMs', Math.max(1, Number(e.target.value) || 1) * 60_000)
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={cfg.omitStack}
          onChange={(e) => update('omitStack', e.target.checked)}
          className="w-4 h-4"
        />
        <span>不推送错误 stack(只推 message+来源,防泄漏)</span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50"
        >
          {testing ? '检查中…' : '🧪 立即跑一次检查'}
        </button>
        <button
          onClick={() => {
            const next = { ...DEFAULT_REPORTER_CONFIG };
            setCfg(next);
            setRemoteReporterConfig(next);
          }}
          className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ↺ 默认
        </button>
      </div>
    </div>
  );
}

// 【续 46 2026-07-12】数据刷新间隔 slider
function PollIntervalSection() {
  const [secs, setSecs] = useState<number>(() => Math.round(getPollInterval() / 1000));
  const update = (s: number) => {
    const clamped = Math.min(120, Math.max(10, Math.round(s)));
    setSecs(clamped);
    setPollInterval(clamped * 1000);
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        🔄 数据刷新间隔
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Dashboard / 容器数据的自动刷新周期。越长越省(更不易唤醒磁盘),越短数据越新。
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={secs}
          onChange={(e) => update(Number(e.target.value))}
          className="flex-1 accent-primary-600"
          aria-label="数据刷新间隔(秒)"
        />
        <span className="text-sm font-mono w-16 text-right tabular-nums">{secs}s</span>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>10s</span>
        <span>2min</span>
      </div>
      <button
        onClick={() => update(30)}
        className="mt-3 text-[10px] text-gray-400 hover:text-primary-600"
      >
        ↺ 重置默认(30s)
      </button>
    </div>
  );
}
