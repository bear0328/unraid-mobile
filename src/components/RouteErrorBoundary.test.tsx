// 【续 50 D2】RouteErrorBoundary 测试
// 覆盖:子组件抛错 → fallback(错误消息 + 返回仪表盘按钮)且其余 UI 可用;
// Layout 实际接线 → 页面抛错只换内容区,顶栏/底部导航还在;
// 点「返回仪表盘」软跳 → pathname 变 → key 重置 → 正常页恢复
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RouteErrorBoundary from './RouteErrorBoundary';
import Layout from './Layout';
import { ThemeProvider } from '../context/ThemeContext';
import { getErrors, clearErrors } from '../utils/errorReporter';

// Layout 的重依赖打桩,聚焦边界接线本身
vi.mock('./GlobalSearch', () => ({ default: () => null }));
vi.mock('./ServerSwitcher', () => ({ default: () => null }));
vi.mock('./CommandPalette', () => ({ default: () => null }));

function Bomb({ message = '💣' }: { message?: string }): never {
  throw new Error(message);
}

function OkPage() {
  return <div>仪表盘内容</div>;
}

describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearErrors();
    // 静默 React/boundary 的 error log,免得测试输出刷屏
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('子组件抛错 → 显示 fallback + 错误消息 + 返回仪表盘按钮,其余 UI 不受影响', () => {
    render(
      <MemoryRouter>
        <div>导航区</div>
        <RouteErrorBoundary>
          <Bomb message="渲染炸了" />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('此页出错了')).toBeInTheDocument();
    expect(screen.getByText(/渲染炸了/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回仪表盘' })).toBeInTheDocument();
    // 边界外的其余 UI 仍在
    expect(screen.getByText('导航区')).toBeInTheDocument();
  });

  it('子组件正常 → 原样渲染,不上报错误', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <div>正常内容</div>
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(screen.queryByText('此页出错了')).not.toBeInTheDocument();
    expect(getErrors()).toHaveLength(0);
  });

  it('抛错上报到 errorReporter(react source)', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Bomb message="上报测试" />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    const errs = getErrors();
    expect(errs).toHaveLength(1);
    expect(errs[0].source).toBe('react');
    expect(errs[0].message).toBe('上报测试');
  });

  it('Layout 接线:页面抛错只换内容区,顶栏/底部导航仍可用;点返回仪表盘后恢复正常页', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/bad']}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<OkPage />} />
              <Route path="bad" element={<Bomb message="bad 页炸了" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );
    // 内容区被 fallback 替换
    expect(screen.getByText('此页出错了')).toBeInTheDocument();
    expect(screen.getByText(/bad 页炸了/)).toBeInTheDocument();
    // Layout 的顶栏标题和底部导航(其余 UI)仍在
    expect(screen.getByText('unRAID')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /容器\/VM/ })).toBeInTheDocument();
    // 点「返回仪表盘」→ 软跳 / → boundary 按 pathname key 重置 → 正常页恢复
    fireEvent.click(screen.getByRole('link', { name: '返回仪表盘' }));
    expect(screen.getByText('仪表盘内容')).toBeInTheDocument();
    expect(screen.queryByText('此页出错了')).not.toBeInTheDocument();
  });
});
