// 【阶段 P0-b - 2026-06-15 续 4】从 Modals.tsx 拆出
import { SheetModal, ActionButtons, inputClass } from './SheetModal';

export function NewFolderModal({
  open,
  onClose,
  onCreate,
  value,
  onChange,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <SheetModal title="新建文件夹" onClose={onClose}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="文件夹名称"
        style={{ WebkitTextFillColor: 'currentColor' }}
        className={inputClass}
        autoFocus
      />
      <ActionButtons
        confirmText="创建"
        loadingText="创建中..."
        onConfirm={onCreate}
        onCancel={onClose}
        loading={loading}
        disabled={!value.trim()}
      />
    </SheetModal>
  );
}
