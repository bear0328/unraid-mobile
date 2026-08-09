interface ProgressBarProps {
  /** 标签文本;【续 90】传 '' 时不渲染标签行(占比交给卡片大数字/sparkline current 显示,去重) */
  label: string;
  value: number;
  max?: number;
  color?: 'blue' | 'green' | 'yellow' | 'red';
  showPercent?: boolean;
}

export default function ProgressBar({
  label,
  value,
  max = 100,
  color = 'blue',
  showPercent = true,
}: ProgressBarProps) {
  const percent = Math.min((value / max) * 100, 100);

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="mb-4">
      {/* 【续 90】label==='' 时整行不渲染(原来渲染空标签 + 重复百分比) */}
      {label !== '' && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
          {showPercent && (
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {percent.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className={`${colorClasses[color]} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
