// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】Dashboard 卡片拖拽包装
// 原生 HTML5 DnD(不引 react-dnd ~40KB)
// 用法:
//   <DraggableCard id="cpu" index={0} onMove={...} totalCount={6}>
//     <CpuCard ... />
//   </DraggableCard>
// 【续 90】移动端拖拽修复:手柄常显(触屏无 hover)+ draggable 移到手柄
//   (整卡不再 draggable,顺带修卡片内链接被误拖);圆角统一 rounded-2xl
// 【续 108】拖拽预览(drag image)改为整卡 clone:浏览器默认预览是手柄快照,
//   透明底被垫白 → 「小白框」;clone 正常大小整卡 + 圆角/阴影/半透明作跟手预览,
//   原卡仍 scale-95 opacity-40 不变
// 【续 109】排序控件改「手柄 + 弹出菜单」:常态只显示 grip(横排三控件 100px 压卡头
//   标题 → 单手柄 36px 不压);点手柄弹上移/下移菜单(32px 触控不变,续 97);
//   桌面拖拽照常,dragstart 标记抑制随后的 click 误弹;
//   去 hover 背景(iOS 粘性 hover 残留白框),只留 active 即时反馈 + focus 环
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import Icon from '../ui/Icon';

interface DraggableCardProps {
  id: string;
  index: number;
  totalCount: number;
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}

export default function DraggableCard({
  id,
  index,
  totalCount,
  onMove,
  children,
}: DraggableCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  // 【续 108】卡片容器 ref + 拖拽预览 clone 引用(dragEnd/卸载时清理)
  const cardRef = useRef<HTMLDivElement>(null);
  const dragImageRef = useRef<HTMLElement | null>(null);
  // 【续 109】排序菜单开关 + 拖拽/点击区分标记(dragstart 后抑制尾随 click)+ 菜单容器
  const [menuOpen, setMenuOpen] = useState(false);
  const hasDragged = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // focus-trap 接管 Esc 关闭(与 ActionMenu 同模式)
  const trapRef = useFocusTrap(menuOpen, () => setMenuOpen(false));

  // 菜单外点击关闭(mousedown,与 ActionMenu 同模式)
  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const cleanupDragImage = () => {
    dragImageRef.current?.remove();
    dragImageRef.current = null;
  };

  // 卸载兜底:dragEnd 未触发(拖出窗口/Esc)时不留残留 clone
  useEffect(() => cleanupDragImage, []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setIsDragging(true);
    // 【续 109】标记本次按压发生了拖拽(抑制尾随 click 误弹菜单)+ 拖起即关菜单
    hasDragged.current = true;
    setMenuOpen(false);

    // 【续 108】跟手预览:clone 整张卡片(正常大小),消浏览器默认「小白框」
    const card = cardRef.current;
    if (!card || typeof e.dataTransfer.setDragImage !== 'function') return;
    const rect = card.getBoundingClientRect();
    const clone = card.cloneNode(true) as HTMLElement;
    clone.style.transform = 'none'; // 去掉 scale-95 等变换,预览保持正常大小
    clone.style.transition = 'none';
    clone.style.position = 'fixed';
    clone.style.left = '0';
    clone.style.top = '-10000px'; // 移出视口但必须渲染(setDragImage 要求)
    clone.style.zIndex = '-1';
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    clone.style.width = `${rect.width}px`; // 脱离 grid 后保持原宽
    clone.style.borderRadius = '0.75rem'; // rounded-xl
    clone.style.boxShadow = '0 25px 50px -12px rgb(0 0 0 / 0.25)'; // shadow-2xl
    clone.style.opacity = '0.9';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
    dragImageRef.current = clone;
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsOver(false);
    cleanupDragImage();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!isNaN(from) && from !== index) {
          onMove(from, index);
        }
      }}
      className={`transition-all rounded-2xl ${
        isDragging ? 'opacity-40 scale-95' : ''
      } ${isOver ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' : ''}`}
      ref={cardRef}
    >
      <div className="relative group">
        {/* 【续 90】拖动手柄常显(触屏无 hover),draggable 在手柄上 —— 整卡不再可拖,
            卡片内链接/按钮不会再被误拖 */}
        {/* 【续 109】上移/下移收进手柄弹出菜单:常态只显示 grip(不再压卡头标题);
            点手柄(未拖动)弹菜单,拖动时 dragstart 标记抑制尾随 click;
            去 hover 背景(iOS 粘性 hover 残留白框),active 即时反馈 + focus 环保留;
            手柄 32px 触控面积(续 97)、方向键上/下排序(续 91)不变 */}
        <div className="absolute top-1 left-1 z-10" ref={menuRef}>
          <div
            draggable
            tabIndex={0}
            role="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onPointerDown={() => {
              // 每次新按压先清拖拽标记:拖完不松 click 时才由 dragstart 置位
              hasDragged.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && index > 0) {
                e.preventDefault();
                onMove(index, index - 1);
              } else if (e.key === 'ArrowDown' && index < totalCount - 1) {
                e.preventDefault();
                onMove(index, index + 1);
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMenuOpen((o) => !o);
              }
            }}
            onClick={() => {
              // 拖拽后的尾随 click 不弹菜单(并重置标记,双保险)
              if (hasDragged.current) {
                hasDragged.current = false;
                return;
              }
              setMenuOpen((o) => !o);
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="p-2 min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 active:bg-gray-200/80 dark:active:bg-gray-600/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 cursor-grab active:cursor-grabbing select-none transition-colors"
            title="拖动重排;点击打开排序菜单(或方向键上/下)"
            aria-label={`拖动重排 ${id} (位置 ${index + 1}/${totalCount})`}
          >
            <Icon icon={GripVertical} size={18} />
          </div>
          {menuOpen && (
            <div
              ref={trapRef}
              role="menu"
              className="absolute left-0 top-full mt-1 z-20 min-w-[104px] bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                disabled={index === 0}
                onClick={() => {
                  setMenuOpen(false);
                  onMove(index, index - 1);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-gray-700 dark:text-gray-200"
              >
                <Icon icon={ChevronUp} size={15} className="shrink-0" />
                上移
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={index >= totalCount - 1}
                onClick={() => {
                  setMenuOpen(false);
                  onMove(index, index + 1);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-gray-700 dark:text-gray-200"
              >
                <Icon icon={ChevronDown} size={15} className="shrink-0" />
                下移
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
