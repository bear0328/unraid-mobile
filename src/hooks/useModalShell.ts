// 【阶段 P2-质量 - 2026-06-17 续 39-1】useModalShell
// 轻量版:仅当 Modal 组件用不了时(自定义 backdrop / sheet 形态)使用
// 封装 body 滚动锁 + useFocusTrap,返回 containerRef
// 大多数场景直接用 <Modal> 即可,这个 hook 留给"已经用 div 自己实现"的代码
import { useEffect } from 'react';
import { useFocusTrap } from './useFocusTrap';

export function useModalShell(open: boolean, onClose: () => void) {
  const containerRef = useFocusTrap(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return containerRef;
}
