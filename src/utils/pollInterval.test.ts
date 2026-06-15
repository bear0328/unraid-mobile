// 【续 46 2026-07-12】全局轮询间隔配置读写测试
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPollInterval,
  setPollInterval,
  subscribePollInterval,
  MIN_POLL_INTERVAL,
  MAX_POLL_INTERVAL,
  DEFAULT_POLL_INTERVAL,
  POLL_INTERVAL_KEY,
} from './pollInterval';

describe('pollInterval', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('默认返 DEFAULT_POLL_INTERVAL', () => {
    expect(getPollInterval()).toBe(DEFAULT_POLL_INTERVAL);
  });

  it('读 LS 存储值', () => {
    window.localStorage.setItem(POLL_INTERVAL_KEY, '45000');
    expect(getPollInterval()).toBe(45000);
  });

  it('clamp 到 [MIN, MAX]', () => {
    window.localStorage.setItem(POLL_INTERVAL_KEY, '5000');
    expect(getPollInterval()).toBe(MIN_POLL_INTERVAL);
    window.localStorage.setItem(POLL_INTERVAL_KEY, '999999');
    expect(getPollInterval()).toBe(MAX_POLL_INTERVAL);
  });

  it('无效值回退默认', () => {
    window.localStorage.setItem(POLL_INTERVAL_KEY, 'abc');
    expect(getPollInterval()).toBe(DEFAULT_POLL_INTERVAL);
  });

  it('setPollInterval 写 LS + 广播变更事件', () => {
    const cb = vi.fn();
    const unsub = subscribePollInterval(cb);
    setPollInterval(60000);
    expect(window.localStorage.getItem(POLL_INTERVAL_KEY)).toBe('60000');
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('subscribe 在跨 tab storage 事件也触发', () => {
    const cb = vi.fn();
    const unsub = subscribePollInterval(cb);
    window.dispatchEvent(new Event('storage'));
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });
});
