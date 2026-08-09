// 【阶段 1 P0 - 2026-06-15】Dashboard 骨架屏
// 从 Dashboard.tsx 拆出，首次加载无 cache 时显示
// 【续 90】按当前默认卡片顺序重写(favorites/cpu/memory/network/containers/vms/disk,
// ArrayCard 已删),头部改 Hero 渐变占位,圆角统一 cardClass(rounded-2xl)
import { cardClass } from '../ui/Card';
import type { ReactNode } from 'react';

/** 通用骨架条 */
function Bar({ className }: { className: string }) {
  return <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />;
}

/** 头部带图标+标题行的卡片骨架 */
function HeaderCardSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className={cardClass}>
      <div className="flex items-center mb-3">
        <Bar className="h-7 w-7 mr-2" />
        <Bar className="h-5 w-24" />
      </div>
      {children}
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {/* Hero 头卡占位:主色渐变,与 ServerHeroCard 同轮廓 */}
      <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-500 dark:from-primary-800 dark:to-primary-600 p-4 shadow-md animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-40 bg-white/20 rounded" />
          <div className="h-5 w-16 bg-white/15 rounded-full" />
        </div>
        <div className="h-4 w-56 bg-white/15 rounded mb-1.5" />
        <div className="h-3 w-32 bg-white/10 rounded" />
      </div>

      {/* favorites:单行紧凑条 */}
      <div className={cardClass}>
        <Bar className="h-4 w-full max-w-[280px]" />
      </div>

      {/* cpu(【续 91】h-10 趋势图占位条,对齐实际卡片高度减 CLS) */}
      <HeaderCardSkeleton>
        <Bar className="h-2 rounded-full" />
        <Bar className="h-10 w-full mt-2" />
      </HeaderCardSkeleton>

      {/* memory(同上) */}
      <HeaderCardSkeleton>
        <Bar className="h-2 rounded-full" />
        <Bar className="h-10 w-full mt-2" />
      </HeaderCardSkeleton>

      {/* network:左右两个数值块 */}
      <HeaderCardSkeleton>
        <div className="flex items-center justify-around">
          <div className="text-center">
            <Bar className="h-6 w-6 mx-auto mb-1" />
            <Bar className="h-3 w-8 mx-auto mb-1" />
            <Bar className="h-4 w-12 mx-auto" />
          </div>
          <div className="text-center">
            <Bar className="h-6 w-6 mx-auto mb-1" />
            <Bar className="h-3 w-8 mx-auto mb-1" />
            <Bar className="h-4 w-12 mx-auto" />
          </div>
        </div>
      </HeaderCardSkeleton>

      {/* containers:圆环 + 计数 */}
      <HeaderCardSkeleton>
        <div className="flex items-center gap-4">
          <Bar className="h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      </HeaderCardSkeleton>

      {/* vms:计数行 */}
      <HeaderCardSkeleton>
        <Bar className="h-3 w-2/3" />
      </HeaderCardSkeleton>

      {/* disk:3 行磁盘条 */}
      <HeaderCardSkeleton>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <Bar className="h-4 w-12" />
                <Bar className="h-3 w-24" />
              </div>
              <Bar className="h-2 rounded-full" />
            </div>
          ))}
        </div>
      </HeaderCardSkeleton>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
        首次加载中…（unraid-api 冷启动约 4-5 秒）
      </p>
    </div>
  );
}
