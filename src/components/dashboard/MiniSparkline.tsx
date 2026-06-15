// 【阶段 P2-监控图 - 2026-06-17 续 32-7】纯 SVG 折线图(sparkline)
// 不引新依赖(recharts ~200KB gzipped),手写 ~100 行
// 接受数字数组,自动归一化到 0-100 区间(用户给原始值时也支持)
// 用途:显示 CPU%/内存%/网络 过去 N 秒趋势
interface MiniSparklineProps {
  /** 数据点(0-100 百分比 或 任意数值,会自适应) */
  data: number[];
  /** 线条颜色 */
  color?: string;
  /** 高度(px) */
  height?: number;
  /** 标题(右上角小字) */
  label?: string;
  /** 当前值(右上角大字) */
  current?: string;
  /** 渐变填充色(stop 起始) */
  fillColor?: string;
  /** 空数据时显示 */
  emptyText?: string;
}

const WIDTH = 280; // viewBox 宽度(viewport 缩放)

export default function MiniSparkline({
  data,
  color = '#3b82f6', // blue-500
  height = 50,
  label,
  current,
  fillColor = 'rgba(59, 130, 246, 0.15)',
  emptyText = '暂无数据',
}: MiniSparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        {emptyText}
      </div>
    );
  }

  // 自适应:用 min/max 归一化
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // 避免全 0 除零
  const stepX = data.length > 1 ? WIDTH / (data.length - 1) : WIDTH;

  // 构建 path
  const points = data.map((v, i) => {
    const x = i * stepX;
    // 反转 y(顶部 = 100%,底部 = 0%)
    const normalized = (v - min) / range;
    const y = height - normalized * (height - 4) - 2; // 留 2px 边距
    return { x, y };
  });

  const pathLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // 填充区域(折线 + 底部)
  const pathArea = `${pathLine} L${WIDTH.toFixed(1)},${height} L0,${height} Z`;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1">
        {label && <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>}
        {current && (
          <span className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-200">
            {current}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        aria-label={label || '趋势图'}
      >
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path d={pathArea} fill={`url(#spark-${color.replace('#', '')})`} />
        <path
          d={pathLine}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 最后一点高亮 */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="2"
            fill={color}
          />
        )}
      </svg>
    </div>
  );
}
