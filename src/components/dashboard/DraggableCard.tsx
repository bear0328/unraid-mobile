// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】Dashboard 卡片拖拽包装
// 原生 HTML5 DnD(不引 react-dnd ~40KB)
// 用法:
//   <DraggableCard id="cpu" index={0} onMove={...} totalCount={6}>
//     <CpuCard ... />
//   </DraggableCard>
// 【续 90】移动端拖拽修复:手柄常显(触屏无 hover)+ draggable 移到手柄
//   (整卡不再 draggable,顺带修卡片内链接被误拖);圆角统一 rounded-2xl
import { useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
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
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
            setIsDragging(true);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            setIsOver(false);
          }}
          className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-gray-100/80 dark:bg-gray-700/80 text-gray-400 dark:text-gray-500 text-xs cursor-grab active:cursor-grabbing select-none transition-opacity"
          title="拖动重排"
          aria-label={`拖动重排 ${id} (位置 ${index + 1}/${totalCount})`}
        >
          <Icon icon={GripVertical} size={14} />
        </div>
        {children}
      </div>
    </div>
  );
}
