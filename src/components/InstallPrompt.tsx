// 【阶段 P2-分享 - 2026-06-17 续 33-5】iOS Safari 添加到主屏幕提示横幅
// 只在 iOS Safari + 非 standalone + 7 天内未关闭过 显示
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export default function InstallPrompt() {
  const { showPrompt, dismiss } = useInstallPrompt();

  if (!showPrompt) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] bg-primary-600 text-white shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      role="alert"
    >
      <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 text-sm">
        <span className="text-lg">📱</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">添加到主屏幕</div>
          <div className="text-xs text-primary-100">
            点击底部分享按钮 <span className="font-mono">⎙</span> → "添加到主屏幕",像 App 一样使用
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-white/80 hover:text-white text-xl leading-none px-2"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}
