// 【阶段 P2-UI - 2026-06-17 续 31-2】卡片操作下拉菜单
// 替代平铺按钮,手机端节省横向空间
// 行为:点击 ⋮ 展开,点击外部关闭,Esc 关闭
// a11y:button aria-label / 菜单 role="menu" / 选项 role="menuitem"
import { useEffect, useId, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export default function ActionMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'up' | 'down'>('up');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // focus-trap 接管 Esc
  const trapRef = useFocusTrap(open, () => setOpen(false));

  // 展开时:判断方向(底部空间不够则向上)
  useEffect(() => {
    if (!open) return;
    setAlign(estimateDirection());
  }, [open]);

  function estimateDirection(): 'up' | 'down' {
    const btn = triggerRef.current;
    if (!btn) return 'up';
    const rect = btn.getBoundingClientRect();
    const bottomSpace = window.innerHeight - rect.bottom;
    // 假设菜单最多 4 项 * 36px = 144px
    return bottomSpace < 160 ? 'up' : 'down';
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ⋮
      </button>
      {open && (
        <div
          ref={trapRef as unknown as React.RefObject<HTMLDivElement>}
          id={menuId}
          role="menu"
          className={`absolute right-0 z-20 min-w-[120px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 ${
            align === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
