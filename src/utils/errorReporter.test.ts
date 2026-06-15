// 【阶段 P2-1 - 2026-06-16 续 11】errorReporter 单元测试
// 覆盖:report / LRU 50 / subscribe 即时触发 / clear / delete / manual source
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getErrors,
  reportError,
  clearErrors,
  deleteError,
  subscribe,
  __injectTestError,
} from './errorReporter';

describe('errorReporter', () => {
  beforeEach(() => {
    clearErrors();
  });

  it('reportError 把 Error 转成 ErrorRecord 并写入 storage', () => {
    reportError(new Error('boom'), 'react', 'stack-trace-here');
    const errs = getErrors();
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe('boom');
    expect(errs[0].source).toBe('react');
    expect(errs[0].extra).toBe('stack-trace-here');
    expect(errs[0].stack).toContain('boom');
    expect(errs[0].id).toBeTruthy();
    expect(errs[0].timestamp).toBeGreaterThan(0);
  });

  it('reportError 接受 string 而非 Error', () => {
    reportError('plain string message', 'manual');
    const errs = getErrors();
    expect(errs[0].message).toBe('plain string message');
    expect(errs[0].stack).toBeUndefined();
  });

  it('最新错误排在最前 (reverse chronological)', () => {
    reportError(new Error('first'), 'manual');
    reportError(new Error('second'), 'manual');
    const errs = getErrors();
    expect(errs.map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('LRU 上限 50 条:超过则丢弃最旧的', () => {
    for (let i = 0; i < 55; i++) {
      reportError(new Error(`#${i}`), 'manual');
    }
    const errs = getErrors();
    expect(errs).toHaveLength(50);
    // 最新的 #54 在最前,最旧的 #0-#4 被丢弃
    expect(errs[0].message).toBe('#54');
    expect(errs[49].message).toBe('#5');
  });

  it('clearErrors 清空队列', () => {
    reportError(new Error('x'), 'manual');
    expect(getErrors()).toHaveLength(1);
    clearErrors();
    expect(getErrors()).toHaveLength(0);
  });

  it('deleteError 按 id 删除单条', () => {
    reportError(new Error('a'), 'manual');
    reportError(new Error('b'), 'manual');
    const [first, second] = getErrors();
    deleteError(first.id);
    const remaining = getErrors();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });

  it('subscribe 注册监听器,新错误触发回调', () => {
    const calls: number[] = [];
    const unsub = subscribe((errs) => calls.push(errs.length));
    // subscribe 立即触发一次(快照)
    expect(calls).toEqual([0]);

    reportError(new Error('new'), 'manual');
    expect(calls).toEqual([0, 1]);

    unsub();
    reportError(new Error('after-unsub'), 'manual');
    // unsub 后不再触发
    expect(calls).toEqual([0, 1]);
  });

  it('__injectTestError 注入一条 manual 错误', () => {
    __injectTestError();
    const errs = getErrors();
    expect(errs[0].source).toBe('manual');
    expect(errs[0].extra).toContain('__injectTestError');
  });

  it('监听器抛错不影响主流程', () => {
    subscribe(() => {
      throw new Error('listener boom');
    });
    // 第二个监听器或后续 report 不应崩
    expect(() => reportError(new Error('outer'), 'manual')).not.toThrow();
  });

  // 【续 43 2026-06-20】补 3 行未覆盖的 case
  // 把 errorReporter.ts 覆盖率从 94.59% 推到 ~99%
  it('localStorage 写失败(隐私模式 / 容量满)→ 不崩 + notify 仍跑', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    let notifiedCount = 0;
    const unsub = subscribe(() => {
      notifiedCount++;
    });
    try {
      // writeStorage 内部 try/catch 吞掉,reportError 主体不抛
      expect(() => reportError(new Error('storage-full'), 'manual')).not.toThrow();
      // notify 仍在写失败后跑了(subscribe 注册 + snapshot 触发后,report 又触发一次)
      // initial snapshot(1) + report 触发(1) = 至少 2
      expect(notifiedCount).toBeGreaterThanOrEqual(2);
    } finally {
      unsub();
      setItemSpy.mockRestore();
    }
  });

  it('readStorage 解析失败 → 返回空数组(不崩)', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('not-json{{{');
    try {
      const errs = getErrors();
      expect(errs).toEqual([]);
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('crypto 不存在(老浏览器 / 非 https)→ fallback 到 timestamp+random id', () => {
    // 模拟老浏览器:整个 crypto 对象不存在 → typeof crypto === 'undefined' → fallback
    // 注意: jsdom 默认 crypto 存在且不可 delete,必须用 defineProperty 替换
    const origDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      reportError(new Error('fallback id test'), 'manual');
      const errs = getErrors();
      expect(errs[0].id).toBeTruthy();
      // fallback id 形如 `${Date.now()}-${random}`
      expect(errs[0].id).toMatch(/^\d+-[a-z0-9]+$/);
    } finally {
      if (origDescriptor) {
        Object.defineProperty(globalThis, 'crypto', origDescriptor);
      }
    }
  });
});
