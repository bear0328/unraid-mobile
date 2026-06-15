// 【阶段 1 P0 - 2026-06-15】存储阵列状态卡片
// 从 Dashboard.tsx 拆出：arrayStatus 标签 + data 磁盘平均使用率
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装(配合 Dashboard 数据刷新时减少不必要 re-render)
import { memo } from 'react';
import { UnraidSystemInfo, UnraidDisk } from '../../services';
import ProgressBar from '../ProgressBar';
import { getDiskUsage } from '../../utils/formatters';
import StaleBadge from '../ui/StaleBadge';

interface ArrayCardProps {
  systemInfo: UnraidSystemInfo | null;
  disks: UnraidDisk[];
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function ArrayCard({ systemInfo, disks, cacheAgeMs }: ArrayCardProps) {
  const dataDisks = disks.filter((d) => d.type === 'data');
  const avgUsage =
    dataDisks.length > 0
      ? dataDisks.reduce((acc, d) => acc + getDiskUsage(d), 0) / dataDisks.length
      : 0;

  const isStarted = systemInfo?.arrayStatus === 'Started';
  const statusClass = isStarted
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">存储阵列状态</h3>
          <StaleBadge
            cacheAgeMs={cacheAgeMs}
            thresholdMs={60 * 1000}
            title="磁盘数据不会自动刷新(避免唤醒 array),点磁盘卡片上的「刷新磁盘」按钮主动刷新"
          />
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusClass}`}>
          {systemInfo?.arrayStatus || 'Unknown'}
        </span>
      </div>

      {/* 【续 46.3】无磁盘数据时不再显示误导性的 0% 进度条(冷启动不自动拉磁盘) */}
      {dataDisks.length > 0 ? (
        <ProgressBar label="阵列使用率" value={avgUsage} color="blue" />
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          磁盘数据未加载 — 点磁盘卡片上的「🌡️ 刷新磁盘」加载后显示使用率
        </p>
      )}
    </div>
  );
}

export default memo(ArrayCard);
