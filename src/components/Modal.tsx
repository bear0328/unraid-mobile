// 【阶段 P2-质量 - 2026-06-17 续 39-1】通用 Modal 组件
// 封装:backdrop click + body 滚动锁 + safe-area + role="dialog" + aria-modal + aria-labelledby + focus-trap
// 替代 VmDetailsModal / ContainerDetailsModal / Notifications / DiskCleanupModal / ShareModals 的样板
// 子组件 ModalHeader / ModalBody / ModalFooter 单纯 className,不带状态
import { useEffect, useId, type ReactNode } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** 可选,提供则同时作为 title 和 aria-labelledby。无 title 时仅作 dialog。 */
  title?: string;
  /** 容器最大宽度,默认 max-w-md */
  maxWidthClass?: string;
  /** 容器布局:vertical(默认,居中列)/ flex(由 children 自管) */
  layout?: 'vertical' | 'flex';
  /** 容器高度限制(inline style maxHeight,两个布局分支都生效),默认 '90dvh' */
  maxHeight?: string;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  maxWidthClass = 'max-w-md',
  layout = 'vertical',
  maxHeight = '90dvh',
  children,
}: ModalProps) {
  const titleId = useId();
  const containerRef = useFocusTrap(open, onClose);

  // 锁 body 滚动(开 + 闭)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      style={{
        paddingTop: 'calc(1rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // 【续 50 C3】maxHeight 改 inline style:`max-h-[${maxHeight}]` 模板拼接
        //   Tailwind 扫描不到(dist CSS 无该类);且原三元只对 vertical 拼 max-h,
        //   flex 分支无限高、容器非 flex,子级 flex-1 全失效(DiskCleanupModal 小屏溢出)
        className={[
          'bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full',
          maxWidthClass,
          layout === 'vertical'
            ? 'p-5 space-y-4 overflow-y-auto'
            : 'flex flex-col overflow-hidden',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ maxHeight }}
      >
        {title && (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * 常用 header:标题 + 关闭 ×
 * children 可加额外操作(收藏/重命名等)
 */
export function ModalHeader({
  title,
  onClose,
  subtitle,
  children,
}: {
  title: string;
  onClose: () => void;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between -mt-1">
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
        {subtitle != null && <div className="text-sm mt-0.5">{subtitle}</div>}
      </div>
      {children}
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none ml-2"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end pt-1 gap-2">{children}</div>;
}
