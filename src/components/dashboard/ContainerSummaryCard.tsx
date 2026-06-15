// 【阶段 P2-Dashboard - 2026-06-17 续 34-5】容器摘要卡片
// 1. 状态分布(running/paused/stopped/exited 的数量 + 占比圆环)
// 2. Top 5 运行中容器列表(显示名 + image)
// 【续 36-3】Top 5 加 CPU/MEM sparkline(每容器 5s polling,单次 GraphQL 拿全部)
// 【续 50 C12b】删掉续 45.5 的 sparkline shouldSkipTick:续 46.4 后 getAllContainerStats
// 只读本地 containerStatsStream 的 Map(零网络),cache 新鲜期跳 tick 不省任何请求,
// 只是单纯不采样,会让 Top5 sparkline 冻结 30 分钟
import { memo, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { UnraidDockerContainer, UnraidApiService } from '../../services';
import { useApiConfig, useUnraidApi } from '../../hooks/useUnraidApi';
import { useMultiContainerStats } from '../../hooks/useMultiContainerStats';
import MiniSparkline from './MiniSparkline';
import StaleBadge from '../ui/StaleBadge';

interface ContainerSummaryCardProps {
  containers: UnraidDockerContainer[];
  loading?: boolean;
  api?: UnraidApiService | null;
  /** 【续 45.3 2026-06-28】容器数据的 cache age(ms),>30s 时显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function stateMeta(state: string): { color: string; label: string } {
  switch (state) {
    case 'running':
      return { color: '#10b981', label: '运行中' };
    case 'paused':
      return { color: '#f59e0b', label: '已暂停' };
    case 'restarting':
      return { color: '#3b82f6', label: '重启中' };
    case 'exited':
    case 'stopped':
      return { color: '#9ca3af', label: '已停止' };
    case 'dead':
      return { color: '#ef4444', label: '异常' };
    default:
      return { color: '#9ca3af', label: state };
  }
}

function ContainerSummaryCard({ containers, loading, api: apiProp, cacheAgeMs }: ContainerSummaryCardProps) {
  // 【续 36-3】如果没显式传 api,从 hook 拿
  const apiHook = useUnraidApi();
  const { config } = useApiConfig();
  const api = apiProp ?? apiHook;
  const apiReady = !!(api && config?.serverUrl);

  // 统计
  const stats = containers.reduce<Record<string, number>>((acc, c) => {
    acc[c.state] = (acc[c.state] || 0) + 1;
    return acc;
  }, {});
  const total = containers.length;
  const runningCount = stats.running || 0;
  const runningPct = total > 0 ? (runningCount / total) * 100 : 0;

  // 圆环
  const R = 38;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - runningPct / 100);

  // Top 5 running(前 5 个 running 容器,sparkline 用)
  const topRunning = useMemo(
    () => containers.filter((c) => c.state === 'running').slice(0, 5),
    [containers]
  );

  // 【续 36-3】多容器 stats 轮询
  const ids = useMemo(() => topRunning.map((c) => c.name), [topRunning]);
  const fetcher = useCallback(
    async (curIds: string[]) => {
      if (!apiReady) return {};
      const r = await api!.getAllContainerStats();
      if (!r.success || !r.data) return {};
      const out: Record<string, { cpuPercent: number; memPercent: number }> = {};
      for (const item of r.data) {
        // stats 返的 id 可能是 normalize 后的名字,匹配到当前 ids 即收
        if (curIds.includes(item.containerId)) {
          out[item.containerId] = { cpuPercent: item.cpuPercent, memPercent: item.memPercent };
        }
      }
      return out;
    },
    [api, apiReady]
  );
  const historyMap = useMultiContainerStats({
    ids,
    fetcher,
    // 【续 50 C12b】不再传 shouldSkipTick:fetcher 读本地订阅 Map(零网络),
    // 每 tick 都采样,sparkline 不再因 cache 新鲜期冻结
  });

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span>📦</span> 容器状态
          {total > 0 && (
            <span className="text-xs text-gray-400 font-normal">
              {runningCount}/{total} 运行中
            </span>
          )}
          {/* 【续 45.3 2026-06-28】staleness 提示:cache age > 30s 时显示,避免 Dashboard 31/33 vs /containers 33 的困惑 */}
          {/* 【续 45.7 2026-07-01】改用 <StaleBadge> 通用组件 */}
          {total > 0 && (
            <StaleBadge
              cacheAgeMs={cacheAgeMs}
              thresholdMs={30_000}
              title="Dashboard 缓存中的容器数据,切到 /containers 页会拉最新"
            />
          )}
        </h3>
        <Link
          to="/containers"
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          管理 →
        </Link>
      </div>

      {total === 0 ? (
        <p className="text-xs text-gray-400">暂无容器数据</p>
      ) : (
        <>
          {/* 状态分布 */}
          <div className="flex items-center gap-4 mb-3">
            <svg
              width="96"
              height="96"
              viewBox="0 0 96 96"
              aria-label={`运行中 ${runningPct.toFixed(0)}%`}
            >
              <circle
                cx="48"
                cy="48"
                r={R}
                fill="none"
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
                strokeWidth="10"
              />
              <circle
                cx="48"
                cy="48"
                r={R}
                fill="none"
                stroke="#10b981"
                strokeWidth="10"
                strokeDasharray={C}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
                style={{ transition: 'stroke-dashoffset 0.5s' }}
              />
              <text
                x="48"
                y="48"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-gray-900 dark:fill-gray-100"
                style={{ fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              >
                {runningPct.toFixed(0)}%
              </text>
            </svg>
            <div className="flex-1 grid grid-cols-2 gap-1.5 text-xs">
              {(['running', 'paused', 'stopped', 'exited', 'restarting', 'dead'] as const).map(
                (state) => {
                  const count = stats[state] || 0;
                  if (count === 0) return null;
                  const m = stateMeta(state);
                  return (
                    <div key={state} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="text-gray-600 dark:text-gray-400 truncate">{m.label}</span>
                      <span className="ml-auto font-mono font-medium tabular-nums">{count}</span>
                    </div>
                  );
                }
              )}
              {Object.keys(stats).length === 0 && <div className="text-gray-400">无数据</div>}
            </div>
          </div>

          {/* Top 5 运行中 */}
          {topRunning.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5">
              {topRunning.map((c) => {
                const h = historyMap[c.name] || [];
                const cpuData = h.map((p) => p.cpuPercent);
                const memData = h.map((p) => p.memPercent);
                const lastCpu = h[h.length - 1]?.cpuPercent ?? 0;
                const lastMem = h[h.length - 1]?.memPercent ?? 0;
                return (
                  <div key={c.containerId} className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">
                        {c.name}
                      </span>
                      <span
                        className="text-gray-400 dark:text-gray-500 font-mono text-[10px] truncate max-w-[100px]"
                        title={c.image}
                      >
                        {c.image}
                      </span>
                    </div>
                    {h.length > 1 && (
                      <div className="grid grid-cols-2 gap-1.5 pl-3.5">
                        <MiniSparkline
                          data={cpuData}
                          color="#3b82f6"
                          fillColor="rgba(59,130,246,0.1)"
                          height={20}
                          current={`${lastCpu.toFixed(0)}%`}
                          label="CPU"
                          emptyText=""
                        />
                        <MiniSparkline
                          data={memData}
                          color="#a855f7"
                          fillColor="rgba(168,85,247,0.1)"
                          height={20}
                          current={`${lastMem.toFixed(0)}%`}
                          label="MEM"
                          emptyText=""
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {runningCount > topRunning.length && (
                <Link
                  to="/containers"
                  className="block text-center text-[10px] text-gray-400 hover:text-primary-600 pt-1"
                >
                  还有 {runningCount - topRunning.length} 个运行中 →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(ContainerSummaryCard);
