// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
// StatusCard 全是 primitive props，Object.is 浅比较稳定，memo 有效
import { memo } from 'react';

interface StatusCardProps {
  title: string;
  value: string | number;
  icon: string;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

function StatusCard({ title, value, icon, subtitle, color = 'blue' }: StatusCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${colorClasses[color]} p-3 rounded-lg`}>
          <span className="text-2xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

export default memo(StatusCard);
