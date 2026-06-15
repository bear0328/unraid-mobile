// 【续 45.7 2026-07-01】通用 staleness 提示组件
// 替代 inline amber "·Xs 前" 文本 (ContainerSummaryCard 续 45.3 起的 pattern)
// threshold 参数化:Dashboard 30min, 容器 30s, 视情况定
// 格式自适应:Xs / Xm / Xh
import { memo } from 'react';

interface StaleBadgeProps {
  /** cache age (ms);null 或 undefined → 不渲染 */
  cacheAgeMs: number | null | undefined;
  /** 超过多少 ms 才显示。0 表示永远不显示 */
  thresholdMs: number;
  /** hover tooltip 提示 */
  title?: string;
  /** 自定义 className (与默认 amber 文字叠加) */
  className?: string;
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s 前`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m 前`;
  return `${Math.round(ms / 3_600_000)}h 前`;
}

function StaleBadge({ cacheAgeMs, thresholdMs, title, className = '' }: StaleBadgeProps) {
  if (cacheAgeMs == null || thresholdMs <= 0 || cacheAgeMs < thresholdMs) return null;
  return (
    <span
      className={`text-[10px] text-amber-500 dark:text-amber-400 font-normal ${className}`}
      title={title}
    >
      ·{formatAge(cacheAgeMs)}
    </span>
  );
}

export default memo(StaleBadge);
