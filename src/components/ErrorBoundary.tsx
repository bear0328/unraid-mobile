// 【阶段 2.2 - 2026-06-15】React 错误边界
// 捕获子组件渲染错误，避免整个 App 白屏
// 降级 UI 在 DefaultErrorFallback.tsx（保持本文件只导出组件，兼容 fast-refresh）
// 【阶段 P1-toast - 2026-06-17 续 32-1】componentDidCatch 立即 toast(不依赖 useErrorToast hook,避免 ErrorToastBridge 也被卸载时静默)
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../utils/errorReporter';
import { toastBus } from '../hooks/useToast';
import DefaultErrorFallback from './DefaultErrorFallback';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 可选：自定义降级 UI */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界：捕获子树渲染/生命周期错误
 * - 只能捕获渲染阶段错误，不能捕获事件处理器、异步代码、SSR 错误
 * - 顶层包整个 App，路由级也可以再包一层做精细降级
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 采集到 errorReporter（Debug 页面可看 + 本地持久化）
    // 也保留 console.error 方便浏览器 DevTools 即时查看
    console.error('[ErrorBoundary]', error, info.componentStack);
    reportError(error, 'react', info.componentStack ?? undefined);
    // 立即弹 toast（带"查看详情"跳 /debug）,7s 比普通 5s 长,给用户反应时间
    const msg = error.message.length > 80 ? error.message.slice(0, 77) + '...' : error.message;
    toastBus.error(`渲染错误: ${msg}`, 7000, {
      label: '查看',
      onClick: () => {
        if (typeof window !== 'undefined') window.location.href = '/debug';
      },
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  goHome = (): void => {
    this.reset();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <DefaultErrorFallback error={this.state.error} onReset={this.reset} onHome={this.goHome} />
    );
  }
}
