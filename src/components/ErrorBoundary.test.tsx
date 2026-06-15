// 【阶段 P2-1 - 2026-06-16 续 12】ErrorBoundary 组件测试
// 覆盖:正常子组件渲染 / 子组件抛错时降级 UI / 错误信息显示 / reset 按钮 / 错误上报到 errorReporter
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { getErrors, clearErrors } from '../utils/errorReporter';

// 抛错子组件:用 toggle 控制抛不抛
function Bomb({ shouldThrow, message = '💣' }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) throw new Error(message);
  return <div>正常子组件</div>;
}

describe('ErrorBoundary', () => {
  // 静默 React 的 error log,免得测试输出刷屏
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearErrors();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('子组件正常时,正常渲染子组件,不显示降级 UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常子组件')).toBeInTheDocument();
    expect(screen.queryByText('页面出错了')).not.toBeInTheDocument();
  });

  it('子组件抛错时,降级 UI 出现并显示错误信息', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="网络挂了" />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    expect(screen.getByText(/网络挂了/)).toBeInTheDocument();
  });

  it('降级 UI 提供"重试"和"回首页"按钮', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /回首页/ })).toBeInTheDocument();
  });

  it('点击"重试"按钮清除 hasError 状态(children 仍抛时会再次降级)', () => {
    // 验证 reset 真的清了内部 state:children 继续抛时,会再次触发 componentDidCatch
    // (而不是永久卡在 hasError=true,什么都不做)
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="persistent" />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    // 第一次抛错 → 1 条
    expect(getErrors()).toHaveLength(1);
    // 点重试
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    // children 继续抛 → 第二次 componentDidCatch → 第 2 条
    expect(getErrors().length).toBeGreaterThanOrEqual(2);
  });

  it('componentDidCatch 上报错误到 errorReporter(react source)', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="上报测试" />
      </ErrorBoundary>
    );
    const errs = getErrors();
    expect(errs).toHaveLength(1);
    expect(errs[0].source).toBe('react');
    expect(errs[0].message).toBe('上报测试');
    expect(errs[0].extra).toContain('Bomb'); // componentStack 含组件名
    expect(errs[0].stack).toBeTruthy();
  });

  it('console.error 仍被调用(DevTools 即时查看不被订阅机制拖慢)', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('custom fallback prop 替换默认降级 UI', () => {
    const customFallback = vi.fn((error: Error, reset: () => void) => (
      <div>
        <span>custom: {error.message}</span>
        <button onClick={reset}>custom-reset</button>
      </div>
    ));
    render(
      <ErrorBoundary fallback={customFallback}>
        <Bomb shouldThrow={true} message="custom-msg" />
      </ErrorBoundary>
    );
    // React 18 + createRoot 在 dev 会 double-invoke render,所以 fallback 至少调 1 次即可
    expect(customFallback).toHaveBeenCalled();
    expect(screen.getByText('custom: custom-msg')).toBeInTheDocument();
    expect(screen.queryByText('页面出错了')).not.toBeInTheDocument();
  });
});
