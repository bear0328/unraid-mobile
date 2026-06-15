// 【阶段 P2-收藏 - 2026-06-17 续 33-1】FavoritesCard 测试
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FavoritesCard from './FavoritesCard';
import { addFavorite, clearFavorites } from '../../hooks/useFavorites';

describe('FavoritesCard', () => {
  beforeEach(() => {
    clearFavorites();
    localStorage.clear();
  });

  it('无收藏时显示空提示 + 导入入口(不返回 null)', () => {
    const { container } = render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    // 【续 33-3】空时有意渲染导入入口(方便恢复备份),不返回 null
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(/暂无收藏/)).toBeInTheDocument();
    expect(screen.getByText('📥 导入')).toBeInTheDocument();
  });

  it('渲染收藏项,显示 label + 类型标签', () => {
    addFavorite({ kind: 'container', value: 'nginx', label: 'Nginx' });
    addFavorite({ kind: 'share', value: 'appdata', label: 'appdata' });
    render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    expect(screen.getByText('Nginx')).toBeInTheDocument();
    expect(screen.getByText('appdata')).toBeInTheDocument();
    expect(screen.getByText('容器')).toBeInTheDocument();
    expect(screen.getByText('分享')).toBeInTheDocument();
  });

  it('容器收藏跳到 /containers?focus=...', () => {
    addFavorite({ kind: 'container', value: 'nginx', label: 'Nginx' });
    render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    const link = screen.getByText('Nginx').closest('a');
    expect(link?.getAttribute('href')).toContain('/containers?focus=nginx');
  });

  it('分享收藏跳到 /shares/<name>(pathname 风格,续 50 C8)', () => {
    addFavorite({ kind: 'share', value: 'appdata', label: 'appdata' });
    render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    const link = screen.getByText('appdata').closest('a');
    expect(link?.getAttribute('href')).toBe('/shares/appdata');
  });

  it('路径收藏跳到 /shares/<path>(去前导斜杠,续 50 C8)', () => {
    addFavorite({ kind: 'path', value: '/mnt/data/movies', label: 'movies' });
    render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    const link = screen.getByText('movies').closest('a');
    expect(link?.getAttribute('href')).toBe('/shares/mnt/data/movies');
  });

  it('点击移除按钮后该条消失', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    addFavorite({ kind: 'container', value: 'nginx', label: 'Nginx' });
    render(
      <MemoryRouter>
        <FavoritesCard />
      </MemoryRouter>
    );
    const removeBtn = screen.getByLabelText(/移除收藏 Nginx/);
    await userEvent.click(removeBtn);
    expect(screen.queryByText('Nginx')).not.toBeInTheDocument();
  });
});
