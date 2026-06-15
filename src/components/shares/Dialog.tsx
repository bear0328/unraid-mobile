// 【阶段 P0-c - 2026-06-15 续 4】useDialog 的渲染层
// 处理 confirm（双按钮）+ alert（单按钮）两种状态
import { SheetModal, ActionButtons } from './SheetModal';
import type { useDialog } from '../../hooks/useDialog';

type DialogApi = ReturnType<typeof useDialog>;

export default function Dialog({ state, close }: DialogApi) {
  if (!state) return null;

  if (state.type === 'confirm') {
    const { title, message, confirmText, danger } = state.opts;
    return (
      <SheetModal title={title} onClose={() => close(false)}>
        <p className="text-sm text-gray-700 dark:text-gray-200 mb-4 whitespace-pre-line">
          {message}
        </p>
        <ActionButtons
          confirmText={confirmText}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
          loading={false}
          disabled={false}
          confirmClass={danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
        />
      </SheetModal>
    );
  }

  // alert
  const { title, message, okText } = state.opts;
  return (
    <SheetModal title={title} onClose={() => close(false)}>
      <p className="text-sm text-gray-700 dark:text-gray-200 mb-4 whitespace-pre-line">{message}</p>
      <button
        onClick={() => close(false)}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
      >
        {okText}
      </button>
    </SheetModal>
  );
}
