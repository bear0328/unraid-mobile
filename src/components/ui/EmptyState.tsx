// 【阶段 P2-优化 - 2026-06-17 续 39-1】通用空状态组件
// 替代 6+ 处手写 "📂 空目录" / "暂无数据" 等
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string;
  /** 行动按钮(可选) */
  action?: ReactNode;
  /** 紧凑模式(适合表格/列表底部) */
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  icon = '📭',
  title,
  hint,
  action,
  compact,
  className = '',
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className={`text-center py-6 text-gray-500 dark:text-gray-400 ${className}`}>
        <p className="text-2xl mb-1">{icon}</p>
        <p className="text-sm">{title}</p>
        {hint && <p className="text-xs mt-0.5 text-gray-400">{hint}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-8 sm:p-12 text-center ${className}`}>
      <p className="text-5xl sm:text-6xl mb-3">{icon}</p>
      <p className="text-base font-medium text-gray-700 dark:text-gray-200">{title}</p>
      {hint && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto">{hint}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
