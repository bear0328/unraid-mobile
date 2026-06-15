// 【阶段 P2-主题色 - 2026-06-17 续 34-3】主色选择器(Settings 页面用)
// 8 个预设 + 自由选择 + 重置
// 【续 42.5 2026-06-19】"切换无反应"修:加 data-testid + 当前色 swatch
// 【续 42.5.2 2026-06-19 21:00】诊断硬刷后仍 FAIL,改用原生 click 委托
// 【续 42.5.3 2026-06-19 21:30】document.addEventListener 在 Browserbase 仍失效
//   改用 ref + .onclick 属性直接绑定,完全绕开 addEventListener
//   React onClick 同步绑,作为 fallback
import { useCallback, useEffect, useRef } from 'react';
import {
  usePrimaryColor,
  PRESET_COLORS,
  DEFAULT_COLOR,
  applyPrimaryColor,
} from '../hooks/usePrimaryColor';
import { useToast } from '../hooks/useToast';

export default function PrimaryColorPicker() {
  const { color, update, reset } = usePrimaryColor();
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePick = useCallback(
    (c: string) => {
      update(c);
      applyPrimaryColor(c);
      toast.success(`已切换到 ${c}`);
    },
    [update, toast]
  );

  const handleReset = useCallback(() => {
    reset();
    applyPrimaryColor(DEFAULT_COLOR);
    toast.info('已恢复默认蓝');
  }, [reset, toast]);

  // 【续 42.5.3 2026-06-19】用 ref + .onclick 属性直接绑定
  // .onclick 是 DOM property,不走 addEventListener,所以即使沙箱 patch 了
  // addEventListener 也不影响。每次 color/update/toast 变化重新绑,拿到最新闭包
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-preset-color]');
    const onClickFns: Array<() => void> = [];
    buttons.forEach((btn) => {
      const c = btn.getAttribute('data-preset-color')!;
      const fn = () => handlePick(c);
      btn.onclick = fn;
      onClickFns.push(fn);
    });

    const resetBtn = root.querySelector<HTMLButtonElement>('[data-action="reset-primary-color"]');
    let resetFn: (() => void) | null = null;
    if (resetBtn) {
      resetFn = handleReset;
      resetBtn.onclick = resetFn;
    }

    return () => {
      buttons.forEach((btn) => {
        btn.onclick = null;
      });
      if (resetBtn) resetBtn.onclick = null;
    };
  }, [color, handlePick, handleReset]);

  return (
    <div data-testid="primary-color-picker" ref={containerRef}>
      <div className="flex flex-wrap gap-2 mb-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            data-testid={`preset-color-${c}`}
            data-preset-color={c}
            className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
              c === color
                ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800 scale-110'
                : 'hover:scale-105'
            }`}
            style={{ backgroundColor: c, pointerEvents: 'auto' }}
            aria-label={`颜色 ${c}`}
            aria-pressed={c === color}
            title={c}
          />
        ))}
        <label
          className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
          title="自定义颜色"
        >
          <input
            type="color"
            value={color}
            onChange={(e) => handlePick(e.target.value)}
            className="sr-only"
            aria-label="自定义颜色"
          />
          <span className="text-xs text-gray-500">+</span>
        </label>
        {color !== DEFAULT_COLOR && (
          <button
            data-action="reset-primary-color"
            className="px-2 h-8 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 cursor-pointer"
          >
            ↺ 重置
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600"
          style={{ backgroundColor: 'var(--primary-600, #3b82f6)' }}
        />
        当前:{' '}
        <code
          className="px-1 bg-gray-100 dark:bg-gray-700 rounded"
          data-testid="current-primary-color"
        >
          {color}
        </code>
        · 影响所有按钮、链接、强调色
      </p>
    </div>
  );
}
