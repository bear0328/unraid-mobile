// 【阶段 P2-分享 - 2026-06-17 续 33-5】PWA 安装提示
// iOS Safari 用 :beforeinstallprompt(Chromium) 不支持,改用 standalone 模式检测
// 显示"添加到主屏幕"提示横幅,关闭后 localStorage 记忆 7 天不再显示
// 【阶段 P2-引导 - 2026-06-17 续 36-2】暴露 platform + install(),供 Settings 教程用
import { useCallback, useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'unraid-mobile-install-dismissed';
const DISMISS_DAYS = 7;

function wasDismissedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = Number(v);
    if (isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as { standalone?: boolean }).standalone) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
}

function detectPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Mac|Linux/.test(ua) && !/Android/.test(ua)) return 'desktop';
  return 'unknown';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown');
  const [standalone, setStandalone] = useState(false);
  // Android Chrome beforeinstallprompt 事件缓存
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const sa = isStandalone();
    setStandalone(sa);
    setPlatform(detectPlatform());

    if (sa) return;
    if (wasDismissedRecently()) return;

    // iOS 顶部横幅
    if (isIosSafari()) setShowPrompt(true);

    // Android Chrome: 监听 beforeinstallprompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }
    setShowPrompt(false);
  }, []);

  /**
   * 调起原生安装弹窗(仅 Android Chrome)
   * @returns 'accepted' | 'dismissed' | 'unavailable'
   */
  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  /** 重置"已关闭"记忆(用户从 Settings 进入"安装教程"想再次尝试) */
  const resetDismiss = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return useMemo(
    () => ({
      showPrompt,
      dismiss,
      platform,
      standalone,
      canInstall: !!deferredPrompt,
      install,
      resetDismiss,
    }),
    [showPrompt, dismiss, platform, standalone, deferredPrompt, install, resetDismiss]
  );
}
