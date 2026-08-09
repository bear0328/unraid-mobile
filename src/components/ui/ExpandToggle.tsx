// 【续 90】统一展开/收起入口(原三派:容器/VM 卡底部小字、CPU/内存卡内联按钮、磁盘卡无)
// 整宽居中 text-xs + chevron + 可选计数;容器/VM 卡展开态顶部「收起」按钮复用同组件
import { ChevronDown, ChevronRight } from 'lucide-react';
import Icon from './Icon';

interface ExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
  /** 收起态文案(展开入口),如「展开容器列表」;传 count 自动拼 (N) */
  expandText: string;
  /** 展开态文案,默认「收起」 */
  collapseText?: string;
  /** 可选计数,收起态拼到文案后:(N) */
  count?: number;
}

export default function ExpandToggle({
  expanded,
  onToggle,
  expandText,
  collapseText = '收起',
  count,
}: ExpandToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-center gap-1 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 pt-1 transition-colors"
    >
      <Icon icon={expanded ? ChevronDown : ChevronRight} size={12} />
      {expanded ? collapseText : count != null ? `${expandText} (${count})` : expandText}
    </button>
  );
}
