// 【阶段 P2-收藏 - 2026-06-17 续 33-1】useFavorites hook 测试
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFavorites, addFavorite, clearFavorites, isFavorite } from './useFavorites';

describe('useFavorites', () => {
  beforeEach(() => {
    clearFavorites();
    localStorage.clear();
  });

  it('初始 state 为空', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it('add 添加到列表首位', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.add({ kind: 'container', value: 'nginx', label: 'Nginx' });
    });
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].value).toBe('nginx');
  });

  it('同 kind+value 重复 add 不增加(去重)', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.add({ kind: 'container', value: 'nginx', label: 'Nginx' });
      result.current.add({ kind: 'container', value: 'nginx', label: 'Nginx 副本' });
    });
    expect(result.current.favorites).toHaveLength(1);
  });

  it('remove 按 id 删除', () => {
    const { result } = renderHook(() => useFavorites());
    let id = '';
    act(() => {
      const f = result.current.add({ kind: 'share', value: 'appdata', label: 'appdata' });
      id = f.id;
    });
    act(() => {
      result.current.remove(id);
    });
    expect(result.current.favorites).toEqual([]);
  });

  it('toggle 切换添加/移除', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle({ kind: 'path', value: '/mnt/data', label: 'data' });
    });
    expect(result.current.isFavorite('path', '/mnt/data')).toBe(true);
    act(() => {
      result.current.toggle({ kind: 'path', value: '/mnt/data', label: 'data' });
    });
    expect(result.current.isFavorite('path', '/mnt/data')).toBe(false);
  });

  it('isFavorite 反映 storage 状态(跨 hook 实例)', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      addFavorite({ kind: 'container', value: 'redis', label: 'Redis' });
    });
    // 上面 addFavorite 触发订阅,result 应同步
    expect(result.current.isFavorite('container', 'redis')).toBe(true);
    expect(isFavorite('container', 'redis')).toBe(true);
  });

  it('localStorage 持久化(读出后 state 同步)', () => {
    addFavorite({ kind: 'share', value: 'backups', label: 'Backups' });
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites[0].value).toBe('backups');
  });
});
