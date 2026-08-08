// 【续 88 2026-08-08】logExport 测试
// 核心回归:a.click() 后不能同步 revokeObjectURL(iOS Safari 下载静默失败),
// 必须 setTimeout 延迟 1s(同 FavoritesCard 教训)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportLogLines } from './logExport';

describe('exportLogLines(续 88)', () => {
  let createSpy: ReturnType<typeof vi.fn>;
  let revokeSpy: ReturnType<typeof vi.fn>;
  // jsdom 可能没原生 URL.createObjectURL/revokeObjectURL,记原值以便还原
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    // 清掉上一个用例留下的下载锚点(延迟 remove 回调随 fake timer 丢弃,不会自己跑)
    document.body.innerHTML = '';
    createSpy = vi.fn(() => 'blob:fake-log');
    revokeSpy = vi.fn();
    globalThis.URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    globalThis.URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.URL.createObjectURL = origCreate;
    globalThis.URL.revokeObjectURL = origRevoke;
  });

  it('生成 .log 下载链接,文件名带 fileKey + 过滤标记', () => {
    expect(() => exportLogLines(['line1', 'line2'], 'system', 'err')).not.toThrow();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const a = document.body.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.download).toMatch(/^system-filtered-.+\.log$/);
    // 无过滤条件时标 all
    exportLogLines(['line1'], 'system', '');
    const anchors = document.body.querySelectorAll('a');
    expect(anchors[1].download).toMatch(/^system-all-.+\.log$/);
  });

  it('click 后不同步 revoke,1s 后才 revoke + 移除锚点(iOS Safari)', () => {
    exportLogLines(['line1'], 'system', '');
    // 关键:同步阶段不 revoke(旧代码这里已调用,iOS Safari 下载静默失败)
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('a')).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-log');
    expect(document.body.querySelector('a')).toBeNull();
  });
});
