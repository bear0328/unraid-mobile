// 【阶段 P0-b - 2026-06-15 续 4】从 Modals.tsx 拆出共享 Modal 组件
// 被 NewFolderModal / RenameModal / MoveCopyModal / UploadQueue 复用
// 【阶段 P1-a11y - 2026-06-17 续 29-3】加 role="dialog" / aria-modal / aria-labelledby / focus-trap
// 【续 42.5.2 2026-06-19】ActionButtons 加 window click 委托兜底 — 同 PrimaryColorPicker
// 【续 42.5.3 2026-06-19 21:30】document.addEventListener 沙箱仍失效
//   改用 ref + .onclick 属性,绕开 addEventListener
// 【2026-07-19】z-50 → z-[80]:底部 Tab 导航也是 z-50 且 DOM 序更靠后,
//   同级 z-index 下导航盖住 bottom sheet 下半截 → 确认/取消按钮被导航栏挡死
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// 通用底部 sheet 模态框
export function SheetModal({
  title,
  onClose,
  disabled,
  children,
}: {
  title: string;
  onClose: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const containerRef = useFocusTrap(true, onClose);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end z-[80]"
      onClick={() => !disabled && onClose()}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-gray-800 w-full rounded-t-2xl p-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            disabled={disabled}
            aria-label="关闭"
            className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 通用 input 样式（修复 iOS Safari 白字白底）
export const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4';

// 通用底部按钮组
export function ActionButtons({
  confirmText,
  loadingText,
  onConfirm,
  onCancel,
  loading,
  disabled,
  confirmClass = 'bg-blue-600 hover:bg-blue-700',
}: {
  confirmText: string;
  loadingText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  disabled: boolean;
  confirmClass?: string;
}) {
  // 【续 42.5.3 2026-06-19 21:30】用 ref + .onclick 属性直接绑定
  // 沙箱 patch 了 addEventListener,但 .onclick property 不受影响
  // 【续 50 C1】按钮上不再同时挂 React onClick:.onclick 与合成事件双绑定
  //   会让真实浏览器一次点击触发两次 onConfirm(重命名"成功仍弹失败 toast"即此因)
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const confirmBtn = confirmRef.current;
    const cancelBtn = cancelRef.current;
    if (confirmBtn) {
      const fn = () => {
        if (!confirmBtn.disabled) onConfirm();
      };
      confirmBtn.onclick = fn;
    }
    if (cancelBtn) {
      const fn = () => {
        if (!cancelBtn.disabled) onCancel();
      };
      cancelBtn.onclick = fn;
    }
    return () => {
      if (confirmBtn) confirmBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
    };
  }, [onConfirm, onCancel, loading, disabled]);

  return (
    <div className="flex gap-3">
      <button
        ref={confirmRef}
        // 【续 50 C1】不挂 React onClick,点击只走上面 effect 里的 .onclick(单触发)
        data-action="confirm-modal"
        disabled={loading || disabled}
        className={`flex-1 py-2.5 ${confirmClass} text-white rounded-lg font-medium disabled:opacity-50 cursor-pointer`}
      >
        {loading && loadingText ? loadingText : confirmText}
      </button>
      <button
        ref={cancelRef}
        // 【续 50 C1】同上,只走 .onclick,避免一次点击 onCancel 触发两次
        data-action="cancel-modal"
        disabled={loading}
        className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 cursor-pointer"
      >
        取消
      </button>
    </div>
  );
}
