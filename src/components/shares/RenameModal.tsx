// 【阶段 P0-b - 2026-06-15 续 4】从 Modals.tsx 拆出
import { FileItem } from './davAuth';
import { SheetModal, ActionButtons, inputClass } from './SheetModal';

export function RenameModal({
  open,
  onClose,
  onRename,
  item,
  newName,
  onChangeNewName,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onRename: () => void;
  item: FileItem | null;
  newName: string;
  onChangeNewName: (v: string) => void;
  loading: boolean;
}) {
  if (!open || !item) return null;
  return (
    <SheetModal title="重命名" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-2">原名：{item.name}</p>
      <input
        type="text"
        value={newName}
        onChange={(e) => onChangeNewName(e.target.value)}
        style={{ WebkitTextFillColor: 'currentColor' }}
        className={inputClass}
        autoFocus
      />
      <ActionButtons
        confirmText="确认"
        loadingText="重命名中..."
        onConfirm={onRename}
        onCancel={onClose}
        loading={loading}
        disabled={!newName.trim() || newName === item.name}
      />
    </SheetModal>
  );
}
