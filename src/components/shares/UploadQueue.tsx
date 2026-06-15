// 【阶段 1 P0 - 2026-06-15 续 3】多文件上传队列 UI
// 替代原 UploadModal：每行独立进度/状态/操作（取消/重试/移除）
import { useRef, type ChangeEvent } from 'react';
import { SheetModal } from './SheetModal';
import type { UploadItem, UploadStatus } from '../../hooks/useFileUpload';

interface UploadQueueProps {
  open: boolean;
  onClose: () => void;
  items: UploadItem[];
  onAdd: (files: FileList) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
}

const STATUS_ICON: Record<UploadStatus, string> = {
  queued: '⏳',
  uploading: '⏵',
  done: '✓',
  failed: '✗',
  cancelled: '⊘',
};

const STATUS_TEXT: Record<UploadStatus, string> = {
  queued: '等待中',
  uploading: '上传中',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<UploadStatus, string> = {
  queued: 'text-gray-500 dark:text-gray-400',
  uploading: 'text-blue-600 dark:text-blue-400',
  done: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
  cancelled: 'text-gray-400 dark:text-gray-500',
};

const PROGRESS_COLOR: Record<UploadStatus, string> = {
  queued: 'bg-gray-300 dark:bg-gray-500',
  uploading: 'bg-blue-500',
  done: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400 dark:bg-gray-600',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function UploadQueue({
  open,
  onClose,
  items,
  onAdd,
  onCancel,
  onRetry,
  onRemove,
  onClearCompleted,
}: UploadQueueProps) {
  const addInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const hasCompleted = items.some(
    (it) => it.status === 'done' || it.status === 'cancelled' || it.status === 'failed'
  );
  const hasItems = items.length > 0;
  const isAnyUploading = items.some((it) => it.status === 'uploading');

  const handleAddClick = () => addInputRef.current?.click();
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAdd(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <SheetModal title={`上传队列 (${items.length}/10)`} onClose={onClose} disabled={isAnyUploading}>
      <input
        ref={addInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {!hasItems ? (
        <button
          onClick={handleAddClick}
          className="w-full py-8 mb-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <div className="text-2xl mb-1">📁</div>
          <div className="text-gray-600 dark:text-gray-300">点击选择文件（可多选）</div>
        </button>
      ) : (
        <>
          <div className="max-h-[55dvh] overflow-y-auto space-y-2 mb-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <span className="text-xl shrink-0 mt-0.5">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-sm font-medium text-gray-900 dark:text-white truncate"
                      title={item.file.name}
                    >
                      {item.file.name}
                    </span>
                    <span className={`text-xs shrink-0 ${STATUS_COLOR[item.status]}`}>
                      {STATUS_ICON[item.status]} {STATUS_TEXT[item.status]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatSize(item.file.size)}
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all ${PROGRESS_COLOR[item.status]}`}
                      style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }}
                    />
                  </div>
                  {item.status === 'failed' && item.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">
                      {item.error}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {item.status === 'uploading' && (
                    <button
                      onClick={() => onCancel(item.id)}
                      className="w-8 h-8 flex items-center justify-center text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded text-lg"
                      title="取消"
                      aria-label="取消上传"
                    >
                      ⏹
                    </button>
                  )}
                  {(item.status === 'failed' || item.status === 'cancelled') && (
                    <button
                      onClick={() => onRetry(item.id)}
                      className="w-8 h-8 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-lg"
                      title="重试"
                      aria-label="重试上传"
                    >
                      ↻
                    </button>
                  )}
                  {item.status !== 'uploading' && (
                    <button
                      onClick={() => onRemove(item.id)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-lg"
                      title="移除"
                      aria-label="从队列移除"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAddClick}
              className="flex-1 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md"
            >
              + 添加更多
            </button>
            {hasCompleted && (
              <button
                onClick={onClearCompleted}
                className="flex-1 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md"
              >
                🗑 清空已完成
              </button>
            )}
          </div>
        </>
      )}
    </SheetModal>
  );
}
