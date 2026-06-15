// 【阶段 P1-a11y - 2026-06-17 续 29-3】容器日志 modal
// 加 role="dialog" / aria-modal / aria-labelledby / focus-trap
// 【续 53 2026-07-19】行首 [ISO8601] 显示为 [HH:MM:SS](仅渲染层转换,内部 logs 字符串
//   不动 — useContainerLogs 续 50 B8 增量去重依赖 [cursor] 前缀匹配);
//   日志容器补 whitespace-pre-wrap(原缺,换行被 HTML 折叠成一整段)
import { useId } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatLogTimesForDisplay } from '../utils/formatters';

type LogsModalProps = {
  open: boolean;
  title: string;
  loading: boolean;
  logs: string;
  error: string | null;
  liveRefresh: boolean;
  onClose: () => void;
  onToggleLiveRefresh: (value: boolean) => void;
};

export function LogsModal({
  open,
  title,
  loading,
  logs,
  error,
  liveRefresh,
  onClose,
  onToggleLiveRefresh,
}: LogsModalProps) {
  const titleId = useId();
  const containerRef = useFocusTrap(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[80dvh] flex flex-col"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 id={titleId} className="font-bold">
            {title} 日志
          </h2>
          <button onClick={onClose} aria-label="关闭" className="text-gray-500">
            关闭
          </button>
        </div>
        <div
          className="p-4 flex-1 overflow-auto bg-gray-900 text-gray-100 font-mono text-xs whitespace-pre-wrap break-all"
          aria-live="polite"
        >
          {loading ? '加载中...' : formatLogTimesForDisplay(logs) || error || '无日志'}
        </div>
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={liveRefresh}
              onChange={(e) => onToggleLiveRefresh(e.target.checked)}
            />
            实时刷新
          </label>
        </div>
      </div>
    </div>
  );
}
