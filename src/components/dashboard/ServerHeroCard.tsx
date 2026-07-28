// 【续 68 GUI 焕新】Dashboard 门面头卡
// 主色渐变(from/to-primary-* 跟随用户自选主色,usePrimaryColor 注入的 CSS 覆盖),
// 白字显示服务器名 + 阵列状态 pill + uptime + 幽灵刷新按钮。
// 替换原「黑字标题 + 灰色 uptime」朴素头部(Dashboard.tsx)。
import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import Icon from '../ui/Icon';
import StaleBadge from '../ui/StaleBadge';

interface ServerHeroCardProps {
  name?: string;
  uptime?: string;
  arrayStatus?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** 【续 45.7】dashboard 数据 cache age(ms),>threshold 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function ServerHeroCard({
  name,
  uptime,
  arrayStatus,
  isRefreshing,
  onRefresh,
  cacheAgeMs,
}: ServerHeroCardProps) {
  const isStarted = arrayStatus === 'Started';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-500 dark:from-primary-800 dark:to-primary-600 p-4 sm:p-5 text-white shadow-md">
      {/* 装饰光斑(纯 CSS,不干扰交互) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-14 right-16 w-32 h-32 rounded-full bg-white/5"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold truncate">{name || 'unRAID Server'}</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isStarted ? 'bg-green-300' : 'bg-yellow-300'
                }`}
              />
              {arrayStatus || 'Unknown'}
            </span>
          </div>
          <p className="text-sm text-white/80 mt-1">运行时长: {uptime || 'N/A'}</p>
        </div>

        {/* 幽灵刷新按钮:invalidate cache + 强制 fetch(不拉磁盘,不唤醒硬盘) */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="手动刷新 Dashboard 数据"
          title="立即拉新数据(不拉磁盘,不唤醒硬盘)"
        >
          <Icon icon={RefreshCw} size={12} className={isRefreshing ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {(isRefreshing || cacheAgeMs != null) && (
        <div className="relative flex items-center gap-2 mt-2.5">
          {isRefreshing && (
            <span className="text-xs text-white/85 bg-white/15 rounded-full px-3 py-0.5">
              后台刷新中…
            </span>
          )}
          <StaleBadge
            cacheAgeMs={cacheAgeMs}
            thresholdMs={60 * 1000}
            title="Dashboard 缓存数据,点「刷新」拉最新"
            className="!text-amber-200"
          />
        </div>
      )}
    </div>
  );
}

export default memo(ServerHeroCard);
