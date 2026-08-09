// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】Dashboard 卡片拖拽包装
// 原生 HTML5 DnD(不引 react-dnd ~40KB)
// 用法:
//   <DraggableCard id="cpu" index={0} onMove={...} totalCount={6}>
//     <CpuCard ... />
//   </DraggableCard>
// 【续 90】移动端拖拽修复:手柄常显(触屏无 hover)+ draggable 移到手柄
//   (整卡不再 draggable,顺带修卡片内链接被误拖);圆角统一 rounded-2xl
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
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
    >
      <div className="relative group">
        {/* 【续 90】拖动手柄常显(触屏无 hover),draggable 在手柄上 —— 整卡不再可拖,
            卡片内链接/按钮不会再被误拖 */}
        {/* 【续 91】手柄缩进卡片 16px padding 区(top-1 left-1 + 60% 透明),
            不再盖住卡内 icon chip;旁加上移/下移小按钮(触屏可用 + 键盘可达),
            首/末位禁用;手柄本身 tabIndex + 方向键上下也可排序 */}
        {/* 【续 97 P1-1】三个排序控件触控面积 p-0.5+12px(~20px)→ p-2+32px+18px 图标:
            iOS 不支持 HTML5 DnD,触屏重排只能靠这两个按钮,原尺寸几乎点不到 */}
        <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5">
          <div
            draggable
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && index > 0) {
                e.preventDefault();
                onMove(index, index - 1);
              } else if (e.key === 'ArrowDown' && index < totalCount - 1) {
                e.preventDefault();
                onMove(index, index + 1);
              }
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
              setIsDragging(true);
            }}
            onDragEnd={() => {
              setIsDragging(false);
              setIsOver(false);
            }}
            className="p-2 min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded bg-gray-100/60 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing select-none transition-opacity"
            title="拖动重排(或方向键上/下)"
            aria-label={`拖动重排 ${id} (位置 ${index + 1}/${totalCount})`}
          >
            <Icon icon={GripVertical} size={18} />
          </div>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            className="p-2 min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded bg-gray-100/60 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            aria-label={`上移 ${id}`}
          >
            <Icon icon={ChevronUp} size={18} />
          </button>
          <button
            type="button"
            disabled={index >= totalCount - 1}
            onClick={() => onMove(index, index + 1)}
            className="p-2 min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded bg-gray-100/60 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            aria-label={`下移 ${id}`}
          >
            <Icon icon={ChevronDown} size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
