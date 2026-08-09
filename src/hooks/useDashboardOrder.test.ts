// 【阶段 P1-测试 - 2026-06-17 续 35-1】Dashboard 卡片顺序 hook 单测
// 覆盖:默认顺序 / move() 重排 / reset() / LS 持久化(刷新后保留)/ 未知 key 过滤
// 【续 90】迁移测试改写:迁移一次性(v2 标记)+ array key 剔除
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardOrder, DEFAULT_ORDER } from './useDashboardOrder';

const STORAGE_KEY = 'unraid-mobile-dashboard-order';
const MIGRATE_KEY = 'unraid-mobile-dashboard-order-v';

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

  it('【续 90】老用户完整旧顺序一次性迁移:network 提前 + vms 插入 + array 剔除,写回 LS + v2 标记', () => {
    // 续 89 前的旧默认:containers 在 network 前,无 vms,含已删除的 array
    const legacy = ['favorites', 'cpu', 'memory', 'containers', 'network', 'array', 'disk'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const { result } = renderHook(() => useDashboardOrder());
    // 【续 91 D/G】missing-key 补全先发生:ups/parity/vms 追加在末尾,
    // 迁移只重排 network/vms,ups/parity 保持在尾部(老用户新卡出现在最后,符合预期)
    const migrated = [
      'favorites',
      'cpu',
      'memory',
      'network',
      'containers',
      'vms',
      'disk',
      'ups',
      'parity',
    ];
    expect(result.current.order).toEqual(migrated);
    // 迁移结果写回 LS + 版本标记(之后 mount 不再重复迁移)
    expect(localStorage.getItem(MIGRATE_KEY)).toBe('v2');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).toEqual(migrated);
  });

  it('【续 90】已迁移(v2 标记)→ 尊重用户自定义,不再强制 network 提前', () => {
    // 用户把 network 刻意拖到末尾,续 89 旧实现每次 mount 会强制改回,续 90 修复
    const custom = ['favorites', 'cpu', 'memory', 'containers', 'vms', 'disk', 'network'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    localStorage.setItem(MIGRATE_KEY, 'v2');
    const { result } = renderHook(() => useDashboardOrder());
    // 【续 91 D/G】v2 信任路径只做 missing-key 补全:ups/parity 追加末尾,不动用户顺序
    expect(result.current.order).toEqual([...custom, 'ups', 'parity']);
  });

  it('【续 90】迁移只做一次:迁移后用户再拖拽,下次 mount 保持新顺序', () => {
    const legacy = ['favorites', 'cpu', 'memory', 'containers', 'network', 'array', 'disk'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const { result, unmount } = renderHook(() => useDashboardOrder());
    // 首次 mount 触发迁移并打标记
    expect(localStorage.getItem(MIGRATE_KEY)).toBe('v2');
    // 用户把 disk 拖到最前
    act(() => result.current.move(6, 0));
    unmount();
    // 再次 mount:已迁移,保持用户顺序
    const { result: result2 } = renderHook(() => useDashboardOrder());
    expect(result2.current.order[0]).toBe('disk');
  });

  it('LS 损坏时降级默认', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{');
    const { result } = renderHook(() => useDashboardOrder());
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
  });

  // ==== 【续 91】脏 LS 去重 + move 越界守卫 ====

  it('【续 91】脏 LS 含重复 key → 去重后不重复渲染(v2 信任路径)', () => {
    const dirty = ['favorites', 'cpu', 'cpu', 'memory', 'network', 'network', 'containers', 'vms', 'disk'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    localStorage.setItem(MIGRATE_KEY, 'v2');
    const { result } = renderHook(() => useDashboardOrder());
    // 【续 91 D/G】v2 信任路径只做 missing-key 补全:ups/parity 追加末尾,不重排
    expect(result.current.order).toEqual([
      'favorites',
      'cpu',
      'memory',
      'network',
      'containers',
      'vms',
      'disk',
      'ups',
      'parity',
    ]);
    // 每个 key 只出现一次
    expect(new Set(result.current.order).size).toBe(result.current.order.length);
  });

  it('【续 91】脏 LS 含重复 key → 迁移路径同样去重', () => {
    // 无 v2 标记走迁移路径,containers 重复
    const dirty = ['favorites', 'cpu', 'memory', 'containers', 'containers', 'network', 'disk'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    const { result } = renderHook(() => useDashboardOrder());
    // 【续 91 D/G】迁移路径:network 提前 + vms 插入,missing 补全的 ups/parity 在末尾
    expect(result.current.order).toEqual([
      'favorites',
      'cpu',
      'memory',
      'network',
      'containers',
      'vms',
      'disk',
      'ups',
      'parity',
    ]);
    expect(new Set(result.current.order).size).toBe(result.current.order.length);
  });

  it('【续 91】越界 move 是 no-op,不产生 undefined', () => {
    const { result } = renderHook(() => useDashboardOrder());
    const before = [...result.current.order];
    act(() => result.current.move(-1, 2));
    expect(result.current.order).toEqual(before);
    act(() => result.current.move(0, 99));
    expect(result.current.order).toEqual(before);
    act(() => result.current.move(99, 0));
    expect(result.current.order).toEqual(before);
    expect(result.current.order).not.toContain(undefined);
  });
});
