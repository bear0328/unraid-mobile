// 【续 74】全局统一的「更新于 HH:MM:SS」文本
// 所有页签顶部刷新钮旁挂同一个,显示全局上次刷新时间(lastRefresh.ts)。
// null(从未刷新)时不渲染。
import { memo } from 'react';
import { useLastRefresh } from '../../hooks/useLastRefresh';

interface LastRefreshTextProps {
  className?: string;
}

function LastRefreshText({ className = '' }: LastRefreshTextProps) {
  const ts = useLastRefresh();
  if (!ts) return null;
  return (
    <span className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      更新于 {new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })}
    </span>
  );
}

export default memo(LastRefreshText);
