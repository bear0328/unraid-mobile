// 【阶段 P1-toast - 2026-06-17 续 29-5】全局 Toast 渲染
// 挂在 App 顶层(Layout 之外,fixed top-right)
// 监听 useToast 的事件总线,自动消失
// 支持可选 action 按钮(用于 "撤销" 等交互)
import { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { useToastList, type ToastItem, type ToastType } from '../hooks/useToast';
import Icon from './ui/Icon';

const ICON: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLOR: Record<ToastType, string> = {
  success: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  info: 'bg-blue-500 text-white',
  warning: 'bg-yellow-500 text-white',
};

function ToastView({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  // 自动消失
  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(onClose, toast.duration);
    return () => clearTimeout(t);
  }, [toast.duration, onClose]);

  return (
    <div
      role="alert"
      className={`flex items-center gap-2 ${COLOR[toast.type]} px-4 py-2.5 rounded-lg shadow-lg min-w-[200px] max-w-[90vw] anim-toast`}
    >
      <Icon icon={ICON[toast.type]} size={18} className="shrink-0" />
      <span className="flex-1 text-sm break-all">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          className="text-sm font-medium underline hover:no-underline shrink-0 px-1"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onClose}
        className="text-white/80 hover:text-white leading-none shrink-0 p-0.5"
        aria-label="关闭"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, remove } = useToastList();
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed z-toast flex flex-col gap-2"
      style={{
        top: 'calc(env(safe-area-inset-top) + 0.5rem)',
        right: '0.5rem',
        left: '0.5rem',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastView toast={t} onClose={() => remove(t.id)} />
        </div>
      ))}
    </div>
  );
}
