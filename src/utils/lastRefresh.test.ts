// 【续 74】全局「上次刷新」时间戳读写测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getLastRefresh, markRefreshed, subscribeLastRefresh } from './lastRefresh';

describe('lastRefresh', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('无记录返 null', () => {
    expect(getLastRefresh()).toBeNull();
  });

  it('markRefreshed 写当前时间戳 + 广播事件', () => {
    const cb = vi.fn();
    const unsub = subscribeLastRefresh(cb);
    const before = Date.now();
    markRefreshed();
    const ts = getLastRefresh();
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('损坏值回退 null', () => {
    window.localStorage.setItem('unraid-mobile-last-refresh', 'abc');
    expect(getLastRefresh()).toBeNull();
  });

  it('subscribe 在跨 tab storage 事件也触发', () => {
    const cb = vi.fn();
    const unsub = subscribeLastRefresh(cb);
    window.dispatchEvent(new Event('storage'));
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });
});
