// 【续 68 GUI 焕新】卡片体系统一样式常量
// 统一:圆角 2xl + 柔和 shadow(续 68.1 去掉 ring 描边 — 用户反馈方框感不好看)
// 图标:主色单色,无底块(续 68.2 去掉色块方框 — 同上反馈)
// 【续 71】白天 shadow-sm→shadow-md 加强立体感;夜间卡片底提亮(#273244)+
// 发丝描边(gray-700/60)做模块分隔 —— 暗色下阴影不可见,明度差+1px 低透明
// 分隔线是暗色 UI 标准做法(是"分隔"不是续 68.1 的亮色 ring 方框)
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Icon from './Icon';

export const cardClass =
  'bg-white dark:bg-[#273244] rounded-2xl p-4 shadow-md dark:shadow-lg dark:border dark:border-gray-700/60';

export const iconChipClass =
  'inline-flex items-center justify-center w-8 h-8 text-primary-600 dark:text-primary-400 shrink-0';

// 列表行(容器/VM/共享等密度更高的行卡):同语言,内边距更小
export const rowCardClass =
  'bg-white dark:bg-[#273244] rounded-2xl p-3 shadow-md dark:shadow-lg dark:border dark:border-gray-700/60 transition-colors';

/**
 * 【续 90】统一卡片头:icon + title(text-base font-semibold,见 index.css 约定)
 * + badge 槽(计数/StaleBadge 等,跟在标题后)+ action 槽(右侧链接/按钮),统一 mb-3。
 * 布局特殊的卡(CPU/内存 大数字右置、Hero 渐变卡)保留自定义头。
 */
export function CardHeader({
  icon,
  title,
  badge,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 min-w-0">
        <span className={iconChipClass}>
          <Icon icon={icon} size={18} />
        </span>
        {title}
        {badge}
      </h3>
      {action}
    </div>
  );
}
