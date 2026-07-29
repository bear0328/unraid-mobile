// 【阶段 P1-a11y - 2026-06-17 续 29-3】容器日志 modal
// 加 role="dialog" / aria-modal / aria-labelledby / focus-trap
// 【续 53 2026-07-19】行首 [ISO8601] 显示为 [HH:MM:SS](仅渲染层转换,内部 logs 字符串
//   不动 — useContainerLogs 续 50 B8 增量去重依赖 [cursor] 前缀匹配);
//   日志容器补 whitespace-pre-wrap(原缺,换行被 HTML 折叠成一整段)
// 【续 79】ANSI 颜色码渲染成彩色 span(原纯文本直出,moviepilot 等彩色日志
//   显示 [32m [0m 等"乱码");逐行 parseAnsiToSpans,行间补 \n 保持原 pre 布局
// 【续 80 2026-07-29】z-sticky→z-overlay + safe-area padding:底部导航同为 z-sticky
//   且 DOM 更靠后,把 modal 底部"实时刷新"一行挡住了(同 z 后渲染者胜)
// 【续 81 2026-07-29】移动端改底部抽屉(items-end + h-[85dvh],footer 钉在视口底部
//   + safe-area):居中 + max-h-[80dvh] 的布局在 iOS 上 footer 仍不可见(视口/工具栏
//    quirky 无法本地复现),底部抽屉是 SheetModal 已验证可行的模式;桌面端(sm+)
//   保持居中弹窗不变
import { Fragment, useId } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatLogTimesForDisplay } from '../utils/formatters';
import { parseAnsiToSpans } from '../utils/logParser';

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-overlay flex items-end sm:items-center justify-center p-0 sm:p-4 anim-fade">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-[#273244] w-full sm:max-w-2xl h-[85dvh] sm:h-auto sm:max-h-[80dvh] flex flex-col rounded-t-2xl sm:rounded-2xl anim-sheet sm:anim-pop"
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
          {loading
            ? '加载中...'
            : logs
              ? formatLogTimesForDisplay(logs)
                  .split('\n')
                  .map((line, i) => (
                    <Fragment key={i}>
                      {i > 0 ? '\n' : ''}
                      {parseAnsiToSpans(line)}
                    </Fragment>
                  ))
              : error || '无日志'}
        </div>
        <div
          className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
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
