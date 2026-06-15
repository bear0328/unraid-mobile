// 【阶段 P1-搜索 - 2026-06-17 续 33-1】GlobalSearch 测试
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import { addFavorite, clearFavorites } from '../hooks/useFavorites';

// 读当前 location,断言跳转目标
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    clearFavorites();
    localStorage.clear();
  });

  it('open=false 时不渲染', () => {
    const { container } = render(
      <MemoryRouter>
        <GlobalSearch open={false} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('open=true 时显示搜索框 + 6 个导航项', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText(/搜索/)).toBeInTheDocument();
    expect(screen.getByText('仪表盘')).toBeInTheDocument();
    expect(screen.getByText('容器/VM')).toBeInTheDocument();
    expect(screen.getByText('日志')).toBeInTheDocument();
  });

  it('输入关键词过滤结果', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/搜索/);
    fireEvent.change(input, { target: { value: '日志' } });
    expect(screen.getByText('日志')).toBeInTheDocument();
    expect(screen.queryByText('仪表盘')).not.toBeInTheDocument();
  });

  it('无匹配结果时显示空提示', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText(/搜索/), {
      target: { value: '完全没匹配的关键字' },
    });
    expect(screen.getByText('无匹配结果')).toBeInTheDocument();
  });

  it('收藏项出现在结果中', () => {
    addFavorite({ kind: 'container', value: 'nginx', label: 'NginxContainer' });
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('NginxContainer')).toBeInTheDocument();
  });

  it('Enter 触发 selectItem 后 onClose 被调', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={onClose} />
      </MemoryRouter>
    );
    // onKeyDown 绑在内层面板 div,从 input 触发 keyDown 才能冒泡到 onKeyDown
    fireEvent.keyDown(screen.getByPlaceholderText(/搜索/), { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown/ArrowUp 切换 active 索引', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/搜索/);
    // 默认 active 0
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  // 【续 50 C8】0 条结果时 (i+1)%0=NaN,方向键卡死;加守卫后不崩、索引不变
  it('0 条结果时按方向键不卡死(NaN 守卫)', () => {
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/搜索/);
    fireEvent.change(input, { target: { value: '完全没匹配的关键字' } });
    expect(screen.getByText('无匹配结果')).toBeInTheDocument();
    // 0 条结果连按方向键:不抛错、仍显示 0 条
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByText('0 条结果')).toBeInTheDocument();
    // 清掉关键词后结果回来,active 索引正常(没被 NaN 污染)
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  // 【续 50 C8】share/path 收藏改 pathname 风格深链(/shares/<path>)
  it('share 收藏项点击跳到 /shares/<name>(pathname 风格)', () => {
    addFavorite({ kind: 'share', value: 'appdata', label: 'AppData' });
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('AppData'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('loc').textContent).toBe('/shares/appdata');
  });

  it('container 收藏项保留 ?focus= 跳法', () => {
    addFavorite({ kind: 'container', value: 'nginx', label: 'Nginx' });
    render(
      <MemoryRouter>
        <GlobalSearch open={true} onClose={() => {}} />
        <LocationProbe />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Nginx'));
    expect(screen.getByTestId('loc').textContent).toBe('/containers?focus=nginx');
  });
});

// vi 在 vitest 配置 globals:true 下是全局可用
declare const vi: typeof import('vitest').vi;
