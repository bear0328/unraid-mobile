// 【阶段 P2-Push - 2026-06-17 续 34-9】通知权限 + 客户端测试通知
// 服务器 push 由 SW 接收,这里只负责:
//  1) 请求权限
//  2) 用 SW registration.showNotification() 客户端触发(测试用,DevTools 也可发)
import { useEffect, useState } from 'react';

export type NotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied';

function getStatus(): NotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationStatus;
}

export function useNotifications() {
  const [status, setStatus] = useState<NotificationStatus>(getStatus);
  // SW registration 缓存(浏览器可能异步可用)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let mounted = true;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((r) => {
          if (mounted) setRegistration(r ?? null);
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, []);

  async function requestPermission(): Promise<NotificationStatus> {
    if (status === 'unsupported') return 'unsupported';
    if (status === 'granted' || status === 'denied') return status;
    const r = await Notification.requestPermission();
    const s = r as NotificationStatus;
    setStatus(s);
    return s;
  }

  /**
   * 触发一条客户端通知(不依赖服务器 push)
   * 优先走 SW(无 OS 弹窗焦点问题),SW 不可用时 fallback 到 Notification API
   */
  async function showLocal(title: string, options: NotificationOptions = {}) {
    const s = status === 'unsupported' || status === 'default' ? await requestPermission() : status;
    if (s !== 'granted') return false;
    try {
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      } else {
        new Notification(title, options);
        return true;
      }
    } catch (e) {
      console.warn('[notifications] showLocal failed:', e);
      return false;
    }
  }

  return { status, requestPermission, showLocal, registration };
}
