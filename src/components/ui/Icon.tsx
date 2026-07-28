import type { LucideIcon, LucideProps } from 'lucide-react';

export interface IconProps extends Omit<LucideProps, 'ref'> {
  icon: LucideIcon;
}

/**
 * 统一图标封装:默认 size=18 / strokeWidth=2 / aria-hidden(装饰性图标,
 * 可访问名由外层 button 的 aria-label 承担)。全项目图标经此出口,便于全局微调。
 */
export default function Icon({ icon: I, size = 18, strokeWidth = 2, ...rest }: IconProps) {
  return <I size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
