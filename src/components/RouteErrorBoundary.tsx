// 【续 50 D2】路由级错误边界:旧代码只有 main.tsx 一个全局 ErrorBoundary,
// 单个页面组件抛错整个 app 白屏。本边界挂在 Layout 的 <Outlet> 外
// (带 location.pathname key,切路由自动重置),fallback 只替换内容区,
// 顶栏/底部导航仍可用。写法参考 components/ErrorBoundary.tsx(main.tsx 全局兜底)
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { reportError } from '../utils/errorReporter';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 采集到 errorReporter(Debug 页可看);不弹 toast — fallback 已在原地展示错误,
    // 且 main.tsx 的 window.onerror 不会对 React 渲染错误再补刀
    console.error('[RouteErrorBoundary]', error, info.componentStack);
    reportError(error, 'react', info.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }
    return (
      <div className="flex items-center justify-center min-h-[60dvh] px-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg text-center">
          <div className="text-4xl mb-3">💥</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">此页出错了</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 break-all">
            {this.state.error.message}
          </p>
          {/* 用 Link 软跳:Layout 给本边界加了 pathname key,路由一变自动重置回正常态 */}
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            返回仪表盘
          </Link>
        </div>
      </div>
    );
  }
}
