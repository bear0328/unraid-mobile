// 【阶段 P0-b - 2026-06-15 续 4】从 Modals.tsx 拆出
import { FileItem } from './davAuth';
import { SheetModal, ActionButtons, inputClass } from './SheetModal';

export function MoveCopyModal({
  open,
  onClose,
  onConfirm,
  item,
  dest,
  onChangeDest,
  loading,
  mode,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  item: FileItem | null;
  dest: string;
  onChangeDest: (v: string) => void;
  loading: boolean;
  mode: 'move' | 'copy';
  currentPath: string;
}) {
  if (!open || !item) return null;
  const title = mode === 'move' ? '移动' : '拷贝';
  return (
    <SheetModal title={title} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-2">源：{item.name}</p>
      <p className="text-xs text-gray-400 mb-3">当前路径：{currentPath}</p>
      <label className="block text-sm font-medium text-gray-700 mb-1">目标路径</label>
      <input
        type="text"
        value={dest}
        onChange={(e) => onChangeDest(e.target.value)}
        placeholder={mode === 'move' ? '例如：/happy/国产/91' : '例如：/backup'}
        style={{ WebkitTextFillColor: 'currentColor' }}
        className={inputClass}
        autoFocus
      />
      <ActionButtons
        confirmText="确认"
        loadingText={mode === 'move' ? '移动中...' : '拷贝中...'}
        onConfirm={onConfirm}
        onCancel={onClose}
        loading={loading}
        disabled={!dest.trim()}
      />
    </SheetModal>
  );
}
