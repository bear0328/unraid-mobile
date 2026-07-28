// 【阶段 1 P0 - 2026-06-15】磁盘状态卡片
// 从 Dashboard.tsx 拆出：单盘使用率 + 温度
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
// 【续 39-1 候选 - 2026-06-18】每盘加 ⏱ 温度历史 sparkline
// 【续 45.8 2026-07-04】头部 🔄 不再刷磁盘(避免唤醒 array),本卡加独立的"刷新磁盘"按钮
import { memo } from 'react';
import { Thermometer, RefreshCw, Timer, Moon, HardDrive } from 'lucide-react';
import { UnraidDisk } from '../../services';
import ProgressBar from '../ProgressBar';
import Icon from '../ui/Icon';
import { formatBytes, getDiskUsage } from '../../utils/formatters';
import { useDiskHistory } from '../../utils/diskHistory';
import StaleBadge from '../ui/StaleBadge';
import { cardClass, iconChipClass } from '../ui/Card';

interface DiskCardProps {
  disks: UnraidDisk[];
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
  /** 【续 45.8 2026-07-04】显式刷新磁盘按钮(会唤醒休眠的 array 盘) */
  onRefreshDisks?: () => void;
  /** 刷新中状态(给按钮 disabled + 文案) */
  isRefreshing?: boolean;
  /** 【续 66】休眠状态 name → isSpinning(轻查询常拉,不唤盘);优先于 disk.isSpinning */
  spinMap?: Map<string, boolean>;
}

/** 统一取休眠状态:spinMap(新) → disk.isSpinning(显式刷新时) → undefined(未知) */
function spinningOf(spinMap: Map<string, boolean> | undefined, disk: UnraidDisk): boolean | undefined {
  const v = spinMap?.get(disk.name);
  if (typeof v === 'boolean') return v;
  return disk.isSpinning;
}

/** 【续 66】休眠徽章(灰底月亮);转动时不渲染,减少噪音 */
export function SleepBadge() {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded flex-shrink-0"
      title="磁盘休眠中(数据不会自动刷新,避免唤醒)"
    >
      <Icon icon={Moon} size={11} />
      休眠
    </span>
  );
}

function DiskCard({ disks, cacheAgeMs, onRefreshDisks, isRefreshing, spinMap }: DiskCardProps) {
  // 【续 46.3 2026-07-18】冷启动不再自动拉磁盘(防唤盘) — 空态渲染说明卡+显式加载入口,
  // 取代旧的 return null(否则新设备/LS 被清的用户永远看不到加载按钮)
  if (disks.length === 0) {
    return (
      <div className={cardClass}>
        <div className="flex items-center mb-2">
          <span className={`${iconChipClass} mr-2`}>
            <Icon icon={HardDrive} size={18} />
          </span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">磁盘状态</h3>
          {onRefreshDisks && (
            <button
              onClick={onRefreshDisks}
              disabled={isRefreshing}
              className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="刷新磁盘数据(会唤醒休眠的阵列盘)"
              title="拉取最新磁盘温度/容量(会唤醒休眠的 array 盘)"
            >
              {isRefreshing ? (
                <>
                  <Icon icon={RefreshCw} size={12} className="animate-spin" />
                  刷新中…
                </>
              ) : (
                <>
                  <Icon icon={Thermometer} size={12} />
                  刷新磁盘
                </>
              )}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          磁盘数据未加载 — 为避免唤醒休眠盘,打开页面不再自动拉取;点右上角「刷新磁盘」显式加载。
        </p>
        {/* 【续 66】未加载温度也能看休眠状态(轻查询常拉,不唤盘) */}
        {spinMap && spinMap.size > 0 && (
          <div className="mt-2 space-y-1.5">
            {Array.from(spinMap.entries()).map(([name, spinning]) => (
              <div key={name} className="flex items-center gap-2 text-sm">
                <Icon
                  icon={HardDrive}
                  size={14}
                  className="text-gray-400 dark:text-gray-500 shrink-0"
                />
                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  {name.toUpperCase()}
                </span>
                {spinning ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    转动中
                  </span>
                ) : (
                  <SleepBadge />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-1.5 mb-4">
        <span className={`${iconChipClass} mr-1`}>
          <Icon icon={HardDrive} size={18} />
        </span>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">磁盘状态</h3>
        <StaleBadge
          cacheAgeMs={cacheAgeMs}
          thresholdMs={60 * 1000}
          title="磁盘数据不会自动刷新(避免唤醒 array),点右侧按钮主动刷新"
        />
        {onRefreshDisks && (
          <button
            onClick={onRefreshDisks}
            disabled={isRefreshing}
            className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="刷新磁盘数据(会唤醒休眠的阵列盘)"
            title="拉取最新磁盘温度/容量(会唤醒休眠的 array 盘)"
          >
            {isRefreshing ? (
              <>
                <Icon icon={RefreshCw} size={12} className="animate-spin" />
                刷新中…
              </>
            ) : (
              <>
                <Icon icon={Thermometer} size={12} />
                刷新磁盘
              </>
            )}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {disks.map((disk) => (
          <DiskRow key={disk.name} disk={disk} spinning={spinningOf(spinMap, disk)} />
        ))}
      </div>
    </div>
  );
}

function DiskRow({ disk, spinning }: { disk: UnraidDisk; spinning?: boolean }) {
  const isBootOrFlash = disk.type === 'boot';
  const sleeping = spinning === false;
  const usagePercent = getDiskUsage(disk);
  const sizeBytes = Number(disk.size) || 0;
  const usedBytes = Number(disk.used) || 0;
  const tempColor =
    disk.temperature > 50
      ? 'text-red-500'
      : disk.temperature > 40
        ? 'text-yellow-500'
        : 'text-gray-500';
  const usageColor = usagePercent > 80 ? 'red' : usagePercent > 60 ? 'yellow' : 'green';

  const history = useDiskHistory(disk.name);
  const tempSeries = history.map((s) => s.temp).filter((v): v is number => typeof v === 'number');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center min-w-0">
          <span className="mr-2">{disk.name.toUpperCase()}</span>
          {isBootOrFlash && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded flex-shrink-0">
              系统
            </span>
          )}
          {sleeping && <SleepBadge />}
        </span>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {formatBytes(usedBytes)} / {formatBytes(sizeBytes)}
          </span>
          {/* 【续 66】休眠盘温度显示 —(休眠时 GraphQL temp 为 null,此前会误导显示 0°C) */}
          {sleeping ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${tempColor}`}>
              <Icon icon={Thermometer} size={12} />
              {disk.temperature}°C
            </span>
          )}
        </div>
      </div>
      <ProgressBar label="" value={usagePercent} color={usageColor} showPercent={true} />
      {tempSeries.length >= 1 && <DiskTempSparkline data={tempSeries} hot={disk.temperature > 50} />}
    </div>
  );
}

function DiskTempSparkline({ data, hot }: { data: number[]; hot: boolean }) {
  const W = 280;
  const H = 18;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? W / (data.length - 1) : W;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const normalized = (v - min) / range;
    const y = H - 2 - normalized * (H - 4);
    return { x, y };
  });
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const color = hot ? '#ef4444' : '#6b7280';
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-400" title="过去 16 小时温度">
      <Icon icon={Timer} size={12} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="flex-1"
        style={{ height: H }}
        aria-label="温度历史"
      >
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-mono">
        {min}–{max}°C
      </span>
    </div>
  );
}

export default memo(DiskCard);
