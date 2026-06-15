// 【阶段 1 P0 - 2026-06-15】内存卡片
// 从 Dashboard.tsx 拆出：内存使用率 + 展开/收起详情 + Swap
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
// 【阶段 P2-监控图 - 2026-06-17 续 32-7】接收 history 显示折线图
import { useState, memo } from 'react';
import { UnraidSystemInfo } from '../../services';
import ProgressBar from '../ProgressBar';
import { formatBytes, getMemoryColor } from '../../utils/formatters';
import MiniSparkline from './MiniSparkline';
import StaleBadge from '../ui/StaleBadge';

interface MemoryCardProps {
  systemInfo: UnraidSystemInfo | null;
  /** 过去 N 次内存% 采样(0-100),用于折线图 */
  history?: number[];
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function MemoryCard({ systemInfo, history, cacheAgeMs }: MemoryCardProps) {
  const [memoryCollapsed, setMemoryCollapsed] = useState(true);
  const memory = systemInfo?.memory || 0;
  const memColor = getMemoryColor(memory);
  const colorClass =
    memColor === 'red'
      ? 'text-red-600 dark:text-red-400'
      : memColor === 'yellow'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          <span className="text-2xl mr-2">🧠</span>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">内存</h3>
              <StaleBadge
                cacheAgeMs={cacheAgeMs}
                thresholdMs={60 * 1000}
                title="Dashboard 缓存数据,点 🔄 刷新拉最新"
              />
            </div>
            {!memoryCollapsed && systemInfo?.memoryTotal && systemInfo.memoryTotal > 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                已用 {formatBytes(systemInfo.memoryUsed || 0)} / 总计{' '}
                {formatBytes(systemInfo.memoryTotal)}
                {systemInfo?.memoryFree && (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    空闲 {formatBytes(systemInfo.memoryFree)}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {systemInfo?.memory?.toFixed(0) || '0'}% 已用
              </p>
            )}
          </div>
        </div>
        <div className={`text-2xl font-bold ${colorClass}`}>
          {systemInfo?.memory?.toFixed(1) || '0'}%
        </div>
      </div>

      <ProgressBar label="" value={memory} color={memColor} />

      {/* 【续 32-7】趋势折线图(过去 10 分钟) */}
      {history && history.length > 1 && (
        <div className="mt-2 -mb-1">
          <MiniSparkline
            data={history}
            color="#a855f7"
            fillColor="rgba(168, 85, 247, 0.15)"
            height={40}
            label="趋势 (10 分钟)"
            current={`${memory.toFixed(0)}%`}
          />
        </div>
      )}

      <button
        onClick={() => setMemoryCollapsed(!memoryCollapsed)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <span>{memoryCollapsed ? '▶' : '▼'}</span>
        <span>{memoryCollapsed ? '展开' : '收起'}</span>
      </button>

      {!memoryCollapsed && (
        <div className="mt-3 space-y-3">
          {/* 已用/总计/空闲分段条 */}
          {systemInfo?.memoryTotal && systemInfo.memoryTotal > 0 && (
            <div className="space-y-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-blue-500"
                  style={{
                    width: `${((systemInfo.memoryUsed || 0) / systemInfo.memoryTotal) * 100}%`,
                  }}
                  title={`已用: ${formatBytes(systemInfo.memoryUsed || 0)}`}
                />
                <div
                  className="h-full bg-green-500"
                  style={{
                    width: `${((systemInfo.memoryFree || 0) / systemInfo.memoryTotal) * 100}%`,
                  }}
                  title={`空闲: ${formatBytes(systemInfo.memoryFree || 0)}`}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded mr-1" />
                  已用 {formatBytes(systemInfo.memoryUsed || 0)}
                </span>
                <span>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded mr-1" />
                  空闲 {formatBytes(systemInfo.memoryFree || 0)}
                </span>
                <span className="text-gray-400">总计 {formatBytes(systemInfo.memoryTotal)}</span>
              </div>
            </div>
          )}

          {/* Swap 信息 */}
          {systemInfo?.swap && systemInfo.swap.total > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Swap
                  <span className="ml-2 text-gray-400 dark:text-gray-500">
                    {formatBytes(systemInfo.swap.used)} / {formatBytes(systemInfo.swap.total)}
                  </span>
                </span>
                <span
                  className={`text-xs font-medium ${
                    systemInfo.swap.percentTotal > 80
                      ? 'text-red-600 dark:text-red-400'
                      : systemInfo.swap.percentTotal > 50
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {systemInfo.swap.percentTotal.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    systemInfo.swap.percentTotal > 80
                      ? 'bg-red-500'
                      : systemInfo.swap.percentTotal > 50
                        ? 'bg-yellow-500'
                        : 'bg-gray-400 dark:bg-gray-500'
                  }`}
                  style={{ width: `${Math.min(systemInfo.swap.percentTotal, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(MemoryCard);
