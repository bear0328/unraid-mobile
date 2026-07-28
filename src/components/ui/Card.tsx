// 【续 68 GUI 焕新】卡片体系统一样式常量
// 统一:圆角 2xl + 柔和 shadow(续 68.1 去掉 ring 描边 — 用户反馈方框感不好看)
// 图标:主色单色,无底块(续 68.2 去掉色块方框 — 同上反馈)
export const cardClass = 'bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm';

export const iconChipClass =
  'inline-flex items-center justify-center w-8 h-8 text-primary-600 dark:text-primary-400 shrink-0';

// 列表行(容器/VM/共享等密度更高的行卡):同语言,内边距更小
export const rowCardClass =
  'bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-sm transition-colors';
