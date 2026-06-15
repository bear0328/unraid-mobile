import { useState } from 'react';
import { useApiConfig } from '../hooks/useUnraidApi';
import { usePolling } from '../hooks/usePolling';
import { usePollInterval } from '../hooks/usePollInterval';
import { useErrors } from '../hooks/useErrors';
import { useAudit } from '../hooks/useAudit';
import { useWebVitals } from '../hooks/useWebVitals';
import { getPerfAlertEnabled, setPerfAlertEnabled } from '../components/perfAlertStorage';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../hooks/useToast';
import { useVitalsHistory } from '../utils/webVitals';
import { useAllDiskHistory, clearDiskHistory } from '../utils/diskHistory';
import { useApiHealth } from '../hooks/useApiHealth';
import type { EndpointResult } from '../services/unraidApi/healthCheck';
import { __injectTestError, type ErrorRecord } from '../utils/errorReporter';

const SOURCE_LABEL: Record<ErrorRecord['source'], string> = {
  react: '⚛️ React',
  window: '🪟 window',
  unhandledrejection: '⏳ Promise',
  manual: '✋ 手动',
};

type EndpointName = 'healthz' | 'graphql' | 'config' | 'files';
const ENDPOINT_META: Record<EndpointName, { label: string; hint: string }> = {
  healthz: { label: 'nginx 服务', hint: '容器没启动或 nginx 配置错误' },
  graphql: { label: 'unRAID API', hint: 'API Key 错或 GraphQL 后端没运行' },
  config: { label: '配置存储', hint: './config 目录挂载或权限异常' },
  files: { label: '文件系统', hint: '/mnt/user 共享目录挂载异常' },
};

function endpointStatusHint(r: EndpointResult): string {
  if (r.ok) return '✅ 正常';
  if (!r.status) return `⏱️ 超时/不可达 — ${r.error || '未知'}`;
  if (r.status === 401) return '🔑 鉴权失败 — API Key 错';
  if (r.status === 403) return '🚫 403 — 权限/路径错';
  if (r.status === 404) return '❓ 404 — 端点不存在';
  if (r.status >= 500) return `🔥 ${r.status} — 后端异常`;
  return `❌ HTTP ${r.status}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 【续 33-8】性能指标单元格(value=null 显示"采集中") */
function VitalCell({
  label,
  value,
  unit,
  goodAt,
}: {
  label: string;
  value: number | null;
  unit: string;
  goodAt: number;
}) {
  let color = 'text-gray-400';
  if (value !== null) {
    if (value <= goodAt) color = 'text-green-600 dark:text-green-400';
    else if (value <= goodAt * 1.5) color = 'text-yellow-600 dark:text-yellow-400';
    else color = 'text-red-600 dark:text-red-400';
  }
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 text-center">
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-base font-mono font-semibold ${color}`}>
        {value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
        {value !== null && unit && <span className="text-xs ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

export default function Debug() {
  const { config } = useApiConfig();
  const [apiData, setApiData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const health = useApiHealth();

  const { errors, count, clear, remove } = useErrors();
  const { entries: auditEntries, count: auditCount, clear: clearAudit } = useAudit();
  // 【续 33-8】Web Vitals
  const vitals = useWebVitals();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollInterval = usePollInterval();

  usePolling(async () => {
    if (!config) {
      setError('请先在设置页面配置服务器信息');
      setLoading(false);
      return;
    }

    // GraphQL 查询测试
    const queries = [
      {
        name: 'online',
        query: `query { online }`,
      },
      {
        name: 'docker containers',
        query: `query {
          docker {
            containers { id names image state status autoStart }
          }
        }`,
      },
      {
        name: 'vms',
        query: `query {
          vms {
            id
            domains { id name state }
          }
        }`,
      },
      {
        name: 'shares',
        query: `query {
          shares {
            name
            comment
            size
            free
          }
        }`,
      },
    ];

    const results: Record<string, unknown> = {};

    for (const { name, query } of queries) {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
          },
          body: JSON.stringify({ query }),
        });

        if (response.ok) {
          const data = await response.json();
          results[name] = data;
        } else {
          results[name] = { error: `HTTP ${response.status}` };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results[name] = { error: msg };
      }
    }

    setApiData(results);
    setLoading(false);
  }, pollInterval);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API 诊断工具 (GraphQL)</h2>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        unRAID 7.2+ 使用 GraphQL API，以下是查询结果。
      </p>

      {/* 【阶段 P1-3 - 2026-06-15 续 9】前端错误日志 */}
      <section
        data-testid="error-log-section"
        className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            🐛 前端错误日志
            {count > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                {count}
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => __injectTestError()}
              className="text-xs px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-blue-600"
              title="注入一条测试错误（用于验证上报链路）"
            >
              🧪 注入测试
            </button>
            {count > 0 && (
              <button onClick={clear} className="text-xs px-2 py-1 text-red-600 hover:text-red-700">
                🗑 清空
              </button>
            )}
          </div>
        </div>

        {count === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            暂无错误。遇到问题时回这里查看。ErrorBoundary、window.onerror、unhandledrejection
            都会被采集。
          </p>
        ) : (
          <div className="space-y-2">
            {errors.map((e) => {
              const isOpen = expandedId === e.id;
              return (
                <div
                  key={e.id}
                  className="border border-red-100 dark:border-red-900/40 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : e.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-red-50/50 dark:hover:bg-red-900/10"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{SOURCE_LABEL[e.source]}</span>
                        <span>·</span>
                        <span>{formatTime(e.timestamp)}</span>
                      </div>
                      <div className="text-sm text-red-700 dark:text-red-300 truncate font-mono">
                        {e.message}
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm shrink-0">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 space-y-2">
                      {e.extra && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            来源信息
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 max-h-32 overflow-auto">
                            {e.extra}
                          </pre>
                        </div>
                      )}
                      {e.stack && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                            堆栈
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 max-h-48 overflow-auto">
                            {e.stack}
                          </pre>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={() => remove(e.id)}
                          className="text-xs px-2 py-1 text-red-600 hover:text-red-700"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 【续 42.5 2026-06-19】4 端点健康状态 — 与 AppReadyGate 同步 */}
      <section
        data-testid="endpoints-section"
        className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            🔌 端点健康(4 端点)
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                health.status === 'healthy'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : health.status === 'unhealthy'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : health.status === 'checking'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {health.status}
            </span>
            {health.report && (
              <span className="text-[10px] text-gray-400 font-normal">
                耗时 {health.report.durationMs}ms
              </span>
            )}
          </h3>
          <button
            onClick={() => void health.recheck()}
            disabled={health.status === 'checking' || !health.isConfigured}
            className="text-xs px-2 py-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 disabled:opacity-50"
          >
            🔄 重检
          </button>
        </div>
        {!health.isConfigured ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            未配置服务器,先到 Settings 配置。
          </p>
        ) : !health.report || health.status === 'checking' ? (
          // 【续 42.5 2026-06-19】首屏骨架 4 行,等 checkHealth 完才填数据 — 之前空着用户以为没渲染
          <ul className="text-xs space-y-1.5">
            {(Object.keys(ENDPOINT_META) as EndpointName[]).map((name) => (
              <li
                key={name}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded px-2 py-1.5 animate-pulse"
              >
                <span className="font-mono font-medium text-gray-700 dark:text-gray-200">
                  {ENDPOINT_META[name].label}
                </span>
                <span className="text-[11px] text-gray-400">⏳ 检查中…</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="text-xs space-y-1.5">
            {(Object.keys(ENDPOINT_META) as EndpointName[]).map((name) => {
              const r = health.report!.endpoints[name];
              const meta = ENDPOINT_META[name];
              const hint = endpointStatusHint(r);
              return (
                <li
                  key={name}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-medium text-gray-700 dark:text-gray-200 shrink-0">
                      {meta.label}
                    </span>
                    <code className="text-[10px] text-gray-400 truncate" title={meta.hint}>
                      → {meta.hint}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-400 font-mono">{r.latencyMs}ms</span>
                    <span className="text-[11px]">{hint}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 【阶段 P2-性能 - 2026-06-17 续 33-8】Web Vitals */}
      <section
        data-testid="vitals-section"
        className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          📊 性能指标 (Web Vitals)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <VitalCell label="LCP" value={vitals.lcp} unit="ms" goodAt={2500} />
          <VitalCell label="FCP" value={vitals.fcp} unit="ms" goodAt={1800} />
          <VitalCell
            label="CLS"
            value={vitals.cls === null ? null : Math.round(vitals.cls * 1000) / 1000}
            unit=""
            goodAt={0.1}
          />
          <VitalCell label="INP" value={vitals.inp} unit="ms" goodAt={200} />
        </div>
        {vitals.memory && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
            🧠 JS Heap: {Math.round(vitals.memory.usedJSHeapSize / 1024 / 1024)} MB /{' '}
            {Math.round(vitals.memory.totalJSHeapSize / 1024 / 1024)} MB
          </div>
        )}
        <p className="mt-2 text-[10px] text-gray-400">
          LCP&lt;2.5s / FCP&lt;1.8s / CLS&lt;0.1 / INP&lt;200ms
          视为良好。绿色=达标,黄色=需改进,红色=差。
        </p>
        {/* 【续 34-4】告警开关 */}
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={getPerfAlertEnabled()}
            onChange={(e) => setPerfAlertEnabled(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary-600"
          />
          <span>🐌 性能预算告警 (LCP&gt;4s / CLS&gt;0.25 / INP&gt;500ms 时弹 toast)</span>
        </label>

        {/* 【续 35-5】历史趋势(5min 一次,保留最近 200 条 ≈ 16.6h) */}
        <VitalsTrends />
      </section>

      {/* 【续 39-1 候选 - 2026-06-18】磁盘温度历史 */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          🌡️ 磁盘温度历史
        </h3>
        <DiskTempTrends />
      </section>

      {/* 【续 34-9】通知测试 */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🔔 推送通知</h3>
        <DebugNotifications />
      </section>

      {/* 【阶段 P2-审计 - 2026-06-17 续 31-3】WebDAV 审计日志 */}
      <section
        data-testid="audit-section"
        className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            📋 WebDAV 审计日志
            {auditCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                {auditCount}
              </span>
            )}
          </h3>
          {auditCount > 0 && (
            <button
              onClick={clearAudit}
              className="text-xs px-2 py-1 text-red-600 hover:text-red-700"
            >
              🗑 清空
            </button>
          )}
        </div>
        {auditCount === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            暂无审计记录。删除/移动/重命名/上传文件后会自动记录(保留 7 天)。
          </p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {auditEntries.map((e) => {
              const color =
                e.status === 'success'
                  ? 'text-green-600'
                  : e.status === 'rolled-back'
                    ? 'text-blue-600'
                    : 'text-red-600';
              const icon = e.status === 'success' ? '✅' : e.status === 'rolled-back' ? '↩️' : '❌';
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-xs font-mono py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="shrink-0">{icon}</span>
                  <span className="text-gray-500 dark:text-gray-400 shrink-0">
                    {formatTime(e.timestamp)}
                  </span>
                  <span className={`shrink-0 ${color}`}>{e.action}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={e.path}>
                    {e.path}
                  </span>
                  {e.error && (
                    <span
                      className="text-red-500 dark:text-red-400 shrink-0 truncate max-w-[40%]"
                      title={e.error}
                    >
                      {e.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {Object.entries(apiData).map(([name, data]) => (
        <div key={name} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{name}</h3>
          <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ))}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">GraphQL API 端点</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
          <li>端点：/graphql</li>
          <li>认证：x-api-key header</li>
          <li>方法：POST</li>
          <li>Content-Type：application/json</li>
        </ul>
      </div>
    </div>
  );
}

// 【续 34-9】通知测试小组件
function DebugNotifications() {
  const { status, requestPermission, showLocal, registration } = useNotifications();
  const toast = useToast();

  const STATUS_LABEL: Record<typeof status, { label: string; color: string }> = {
    unsupported: { label: '浏览器不支持', color: 'text-gray-400' },
    default: { label: '未请求', color: 'text-yellow-600 dark:text-yellow-400' },
    granted: { label: '已授权', color: 'text-green-600 dark:text-green-400' },
    denied: { label: '已拒绝(浏览器设置可改)', color: 'text-red-600 dark:text-red-400' },
  };
  const s = STATUS_LABEL[status];

  async function handleTest() {
    const ok = await showLocal('unRAID Mobile 测试', {
      body: `通知时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      tag: 'unraid-mobile-test',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: '/debug' },
    });
    if (ok) toast.success('通知已触发,检查系统通知中心');
    else toast.error('未触发: ' + (status === 'denied' ? '权限被拒绝' : '未知错误'));
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <span>权限:</span>
        <span className={`font-medium ${s.color}`}>{s.label}</span>
        <span>·</span>
        <span>SW:</span>
        <span className={registration ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
          {registration ? '已注册' : '未注册'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === 'default' && (
          <button
            onClick={() => void requestPermission()}
            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded"
          >
            请求通知权限
          </button>
        )}
        <button
          onClick={handleTest}
          disabled={status === 'denied' || status === 'unsupported'}
          className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 rounded disabled:opacity-50"
        >
          🧪 发送测试通知
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        实际推送依赖后端 push service(需订阅端点 + VAPID 密钥)。本测试通过 SW
        直接触发,验证通知链路通畅。 服务器 push payload 格式: {'{ title, body, url?, tag?, icon? }'}
      </p>
    </div>
  );
}

// 【续 39-1 候选 - 2026-06-18】磁盘温度历史趋势
function DiskTempTrends() {
  const map = useAllDiskHistory();
  const toast = useToast();
  const names = Object.keys(map).sort();
  const totalSamples = names.reduce((s, n) => s + (map[n]?.length ?? 0), 0);
  const handleClear = () => {
    clearDiskHistory();
    toast.success(`已清空 ${totalSamples} 个采样点`);
  };
  if (totalSamples === 0) {
    return (
      <p className="text-[10px] text-gray-400">
        暂无磁盘历史(每 5min 自动采一次,首条在加载后 ~5min 出现)
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          {names.length} 个盘 · {totalSamples} 个采样点(每盘最多 200 条)
        </p>
        <button onClick={handleClear} className="text-[10px] text-red-500 hover:text-red-600">
          清空
        </button>
      </div>
      <div className="space-y-1.5">
        {names.map((name) => (
          <DiskRow key={name} name={name} series={map[name]} />
        ))}
      </div>
    </div>
  );
}

function DiskRow({
  name,
  series,
}: {
  name: string;
  series: { ts: number; temp: number | null; used: number | null }[];
}) {
  const temps = series.map((s) => s.temp).filter((v): v is number => typeof v === 'number');
  const last = temps[temps.length - 1] ?? null;
  const min = temps.length ? Math.min(...temps) : null;
  const max = temps.length ? Math.max(...temps) : null;
  const color =
    last === null
      ? 'text-gray-400'
      : last > 50
        ? 'text-red-600 dark:text-red-400'
        : last > 40
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-green-600 dark:text-green-400';
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">
          {name.toUpperCase()}
        </span>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          {min !== null && max !== null && (
            <span>
              {min}–{max}°C
            </span>
          )}
          <span className={`font-mono font-semibold ${color}`}>
            {last === null ? '—' : `${last.toFixed(0)}°C`}
          </span>
        </div>
      </div>
      {temps.length >= 2 ? (
        <TrendLine values={temps} />
      ) : (
        <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded" />
      )}
    </div>
  );
}

// 【续 35-5】Vitals 趋势图(用 MiniSparkline,无新依赖)
function VitalsTrends() {
  const { history, count, clear } = useVitalsHistory();
  if (count === 0) {
    return (
      <p className="mt-3 text-[10px] text-gray-400">
        暂无历史数据(每 5min 自动采一次,首条在加载后 ~5min 出现)
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          趋势: {count} 条快照,最近{' '}
          {count > 1 ? Math.round((history[count - 1].ts - history[0].ts) / 60000) : 0}min
        </p>
        <button onClick={clear} className="text-[10px] text-red-500 hover:text-red-600">
          清空
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <VitalTrend label="LCP" data={history.map((h) => h.lcp)} unit="ms" goodAt={2500} />
        <VitalTrend label="FCP" data={history.map((h) => h.fcp)} unit="ms" goodAt={1800} />
        <VitalTrend
          label="CLS"
          data={history.map((h) => h.cls)}
          unit=""
          goodAt={0.1}
          multiplier={1000}
        />
        <VitalTrend label="INP" data={history.map((h) => h.inp)} unit="ms" goodAt={200} />
      </div>
    </div>
  );
}

function VitalTrend({
  label,
  data,
  unit,
  goodAt,
  multiplier = 1,
}: {
  label: string;
  data: (number | null)[];
  unit: string;
  goodAt: number;
  multiplier?: number;
}) {
  // 转 null → 0(给 sparkline 画图,留空也行但会断)
  const nums = data.map((v) => (v === null ? 0 : v * multiplier));
  const last = data[data.length - 1] ?? null;
  let color = 'text-gray-400';
  if (last !== null) {
    const v = last * multiplier;
    if (v <= goodAt) color = 'text-green-600 dark:text-green-400';
    else if (v <= goodAt * 1.5) color = 'text-yellow-600 dark:text-yellow-400';
    else color = 'text-red-600 dark:text-red-400';
  }
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`text-xs font-mono font-semibold ${color}`}>
          {last === null
            ? '—'
            : (last * multiplier).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
          {last !== null && unit && <span className="text-[10px] ml-0.5">{unit}</span>}
        </span>
      </div>
      <TrendLine values={nums} />
    </div>
  );
}

// 内联小折线(SVG 32x16),避免 import 失败循环
function TrendLine({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded" />;
  }
  const max = Math.max(...values, 1);
  const w = 100,
    h = 24;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ');
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="text-primary-500"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
