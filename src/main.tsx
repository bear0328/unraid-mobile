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
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.info('[PWA] SW registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed:', err);
      });
  });
}
