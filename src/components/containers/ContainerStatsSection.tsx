// 【续 78】从 ContainerDetailsModal.tsx 拆出(纯结构移动,不改行为)
// 实时资源区块:CPU/内存进度条 + MiniSparkline 历史曲线
import { RefreshCw, AlertTriangle } from 'lucide-react';
import MiniSparkline from '../dashboard/MiniSparkline';
import Icon from '../ui/Icon';

// 【续 46.4】stats 改订阅源(containerStatsStream):memUsage/memLimit 数字 → memPercent + memUsageText
export interface Stats {
  cpuPercent: number;
  memPercent: number;
  /** 原始字符串(如 "726.1MiB / 31.1GiB") */
  memUsageText: string;
}

interface ContainerStatsSectionProps {
  stats: Stats | null;
  statsLoading: boolean;
  statsError: string | null;
  /** 容器 state(docker stats 仅 running 有数据) */
  containerState: string;
  /** 【续 35-7】CPU 历史(5s polling,60 点) */
  cpuHistory: number[];
  /** 【续 35-7】MEM 历史(5s polling,60 点) */
  memHistory: number[];
}

export default function ContainerStatsSection({
  stats,
  statsLoading,
  statsError,
  containerState,
  cpuHistory,
  memHistory,
}: ContainerStatsSectionProps) {
  const memPct = stats?.memPercent ?? 0;

  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        实时资源
      </h4>
      {statsLoading ? (
        <div className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 py-2">
          <Icon icon={RefreshCw} size={14} className="animate-spin" />
          加载 stats...
        </div>
      ) : containerState !== 'running' ? (
        // 【续 53】docker stats 仅运行中容器有数据,停止的容器不再显示 ❌ 报错
        <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
          容器未运行,无实时资源数据(CPU/内存统计仅运行中可用)
        </div>
      ) : statsError ? (
        <div className="flex items-center gap-1 text-sm text-red-500 py-2">
          <Icon icon={AlertTriangle} size={14} />
          {statsError}
        </div>
      ) : stats ? (
        <div className="space-y-2.5">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">CPU</span>
              <span className="font-mono font-medium">{stats.cpuPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
              />
            </div>
            {cpuHistory.length > 0 && (
              <MiniSparkline
                data={cpuHistory}
                color="#3b82f6"
                fillColor="rgba(59, 130, 246, 0.15)"
                height={36}
                emptyText=""
              />
            )}
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">内存</span>
              <span className="font-mono font-medium">
                {stats.memUsageText || '—'} ({memPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.min(memPct, 100)}%` }}
              />
            </div>
            {memHistory.length > 0 && (
              <MiniSparkline
                data={memHistory}
                color="#a855f7"
                fillColor="rgba(168, 85, 247, 0.15)"
                height={36}
                emptyText=""
              />
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-2">无数据</div>
      )}
    </section>
  );
}
