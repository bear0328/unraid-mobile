// 【阶段 P1-测试 - 2026-06-17 续 35-1】Dashboard 卡片顺序 hook 单测
// 覆盖:默认顺序 / move() 重排 / reset() / LS 持久化(刷新后保留)/ 未知 key 过滤
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardOrder, DEFAULT_ORDER } from './useDashboardOrder';

const STORAGE_KEY = 'unraid-mobile-dashboard-order';

describe('useDashboardOrder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认返回 DEFAULT_ORDER 副本', () => {
    const { result } = renderHook(() => useDashboardOrder());
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
    expect(result.current.order).not.toBe(DEFAULT_ORDER); // 引用隔离
  });

  it('move() 上移一项', () => {
    const { result } = renderHook(() => useDashboardOrder());
    const before = [...result.current.order];
    act(() => result.current.move(2, 0));
    expect(result.current.order[0]).toBe(before[2]);
    expect(result.current.order).toHaveLength(before.length);
  });

  it('move() 下移一项', () => {
    const { result } = renderHook(() => useDashboardOrder());
    const before = [...result.current.order];
    act(() => result.current.move(0, 3));
    expect(result.current.order[3]).toBe(before[0]);
  });

  it('move(0,0) 等价 no-op', () => {
    const { result } = renderHook(() => useDashboardOrder());
    const before = [...result.current.order];
    act(() => result.current.move(0, 0));
    expect(result.current.order).toEqual(before);
  });

  it('reset() 回到默认', () => {
    const { result } = renderHook(() => useDashboardOrder());
    act(() => result.current.move(0, 5));
    expect(result.current.order[0]).not.toBe(DEFAULT_ORDER[0]);
    act(() => result.current.reset());
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
  });

  it('change 后会写 LS', () => {
    const { result } = renderHook(() => useDashboardOrder());
    act(() => result.current.move(0, 1));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored[0]).toBe(DEFAULT_ORDER[1]);
    expect(stored[1]).toBe(DEFAULT_ORDER[0]);
  });

  it('从 LS 读已知 key,过滤未知 key', () => {
    const mixed = [...DEFAULT_ORDER, 'unknown-card', 123, null];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mixed));
    const { result } = renderHook(() => useDashboardOrder());
    // 过滤掉 unknown-card / 123 / null,只留已知 key
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
    expect(result.current.order).not.toContain('unknown-card');
  });

  it('LS 缺新 key 时,补全并迁移到新默认顺序', () => {
    // 【续 89】存量顺序会触发迁移:network 提到 containers 前、vms 紧随 containers,
    // 旧 4-key LS 补齐 + 迁移后正好等于新 DEFAULT_ORDER
    const oldKeys = ['favorites', 'cpu', 'memory', 'network'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldKeys));
    const { result } = renderHook(() => useDashboardOrder());
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
    expect(result.current.order).toContain('vms');
  });

  it('【续 89】老用户完整旧顺序迁移:network 提前 + vms 插到 containers 后', () => {
    // 续 89 前的旧默认:containers 在 network 前,无 vms
    const legacy = ['favorites', 'cpu', 'memory', 'containers', 'network', 'array', 'disk'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const { result } = renderHook(() => useDashboardOrder());
    expect(result.current.order).toEqual([
      'favorites',
      'cpu',
      'memory',
      'network',
      'containers',
      'vms',
      'array',
      'disk',
    ]);
  });

  it('LS 损坏时降级默认', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{');
    const { result } = renderHook(() => useDashboardOrder());
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
  });
});
