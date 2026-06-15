// 【阶段 1 P0 - 2026-06-17 续 29-1】从 Shares.tsx 拆出批量操作条
// 全选 checkbox + "已选 N/M" 提示 + "批量删除" 按钮
interface BatchActionsBarProps {
  total: number;
  selected: number;
  allSelected: boolean;
  disabled: boolean;
  onToggleAll: (checked: boolean) => void;
  onBatchDelete: () => void;
}

export default function BatchActionsBar({
  total,
  selected,
  allSelected,
  disabled,
  onToggleAll,
  onBatchDelete,
}: BatchActionsBarProps) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="w-4 h-4 accent-primary-600"
          aria-label="全选"
        />
        {allSelected ? '已全选' : `已选 ${selected} / ${total}`}
      </label>
      <button
        onClick={onBatchDelete}
        disabled={disabled}
        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded"
      >
        🗑 批量删除 ({selected})
      </button>
    </div>
  );
}
