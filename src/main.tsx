import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportError } from './utils/errorReporter';
import { toastBus } from './hooks/useToast';
import { initLicense } from './services/license';

// 【续 55 商业化】启动时验 localStorage 里的 license key(异步,验完自动通知订阅方)
void initLicense();

// 【阶段 P1-3 - 2026-06-15 续 9】全局错误兜底
// ErrorBoundary 只能接 React 渲染错误；window.onerror / onunhandledrejection
// 接住事件处理器、异步、第三方库的运行时错误，统一进 errorReporter
// 【阶段 P1-toast - 2026-06-17 续 32-1】立即 toast(不依赖 useErrorToast hook,避免 App 树挂掉时静默)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // 忽略资源加载失败（图片/脚本 404 之类，不是 JS 异常）
    if (event.error) {
      reportError(event.error, 'window', `${event.filename}:${event.lineno}:${event.colno}`);
      const msg =
        event.error.message.length > 60
          ? event.error.message.slice(0, 57) + '...'
          : event.error.message;
      toastBus.error(`运行时错误: ${msg}`, 6000, {
        label: '查看',
        onClick: () => {
          window.location.href = '/debug';
        },
      });
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      reportError(reason, 'unhandledrejection');
      const msg = reason.message.length > 60 ? reason.message.slice(0, 57) + '...' : reason.message;
      toastBus.error(`异步错误: ${msg}`, 6000, {
        label: '查看',
        onClick: () => {
          window.location.href = '/debug';
        },
      });
    } else {
      const str = String(reason);
      reportError(`Unhandled rejection: ${str}`, 'unhandledrejection');
      toastBus.error(`异步错误: ${str.slice(0, 50)}`, 6000, {
        label: '查看',
        onClick: () => {
          window.location.href = '/debug';
        },
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// 【阶段 P2-PWA - 2026-06-17 续 32-8】注册 Service Worker
// 只在生产环境注册(dev 模式 HMR 会冲突)
// 注册失败也不影响主流程(降级到无 SW 模式)
// 【续 93】PWA 缓存根治(iOS 每次部署仍跑旧 bundle):
//   - updateViaCache:'none' → SW 更新检查不走 HTTP 缓存(双保险,nginx 侧 sw.js 已 no-cache)
//   - 回到前台(visibilitychange)→ reg.update() 主动检查新版(iOS PWA resume 不重载页面)
//   - controllerchange → 自动 reload 一次(新 SW skipWaiting+claim 接管,页面换跑新 bundle)
//   - 首次安装不刷新(load 时无 controller = 首访,避免 double-load)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        console.info('[PWA] SW registered:', reg.scope);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
  });
}
