// 【阶段 P1-a11y - 2026-06-17 续 29-3】焦点陷阱 hook
// 行为:
// 1. open 变 true 时,自动 focus 容器内第一个 focusable 元素
// 2. Tab 在容器内循环(最后一个 → 第一个,Shift+Tab 反向)
// 3. Esc 关闭(onEscape callback)
// 4. 关闭时还原 focus 到之前 active 的元素
// 依赖:容器 ref + open + onEscape
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(open: boolean, onEscape: () => void): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // 【续 50 C4】onEscape 用 ref 持有,主 effect deps 只留 [open]:
  // 上层普遍传 inline onClose(引用每次 render 都变),deps 带 onEscape 会让
  // 父级任何重渲染都重跑 effect — 50ms 后 focusFirst 抢焦点(StackDetailModal
  // 编辑 yaml 时后台刷新即丢焦点),且 previouslyFocused 被覆盖成弹窗内元素,
  // 关闭后焦点还原失效
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;

    // 1. 记录之前 focus
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // 2. 立即 focus 第一个可聚焦元素
    const focusFirst = () => {
      const root = containerRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    };
    // 用 timeout 等动画结束(Slide-up sheet 需要一帧)
    const t = setTimeout(focusFirst, 50);

    // 3. Tab 循环
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      // 4. 还原 focus
      previouslyFocused.current?.focus();
    };
  }, [open]); // 【续 50 C4】只在 open 翻转时跑;onEscape 走 ref

  return containerRef;
}
