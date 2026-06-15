// 【阶段 P2-1 - 2026-06-16 续 11】formatters 纯函数单测
// 覆盖:formatBytes / formatSpeed / getUsageColor / getCpuColor / getMemoryColor / getDiskUsage
import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatSpeed,
  getUsageColor,
  getCpuColor,
  getMemoryColor,
  getDiskUsage,
} from './formatters';

describe('formatBytes', () => {
  it('null / undefined 返 "-"', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
  });
  it('0 返 "0B" 而不是 "-"', () => {
    expect(formatBytes(0)).toBe('0B');
  });
  it.each([
    [500, '500B'],
    [1500, '1.5K'],
    [2_500_000, '2.5M'],
    [3_000_000_000, '3.0G'],
    [4_000_000_000_000, '4.0T'],
  ])('formatBytes(%i) === %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('formatSpeed', () => {
  it('null / undefined 返 "-"', () => {
    expect(formatSpeed(null)).toBe('-');
    expect(formatSpeed(undefined)).toBe('-');
  });
  it('0 返 "0 B/s"', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
  });
  it.each([
    [800, '800 B/s'],
    [1_500, '1.50 K/s'],
    [2_500_000, '2.50 M/s'],
    [1_500_000_000, '1.50 G/s'],
  ])('formatSpeed(%i) === %s', (input, expected) => {
    expect(formatSpeed(input)).toBe(expected);
  });
});

describe('getUsageColor', () => {
  it('> high 返 red,> mid 返 yellow,否则 green', () => {
    expect(getUsageColor(95)).toBe('red');
    expect(getUsageColor(75)).toBe('yellow');
    expect(getUsageColor(50)).toBe('green');
  });
  it('边界值:等于 high 不算 red,但仍 > mid 触发 yellow', () => {
    // 实现用严格 >,所以 90 配 high=90 不进 red;但 90 > mid=70,进 yellow
    expect(getUsageColor(90, 90, 70)).toBe('yellow');
  });
  it('支持自定义阈值', () => {
    expect(getUsageColor(50, 40, 30)).toBe('red');
    expect(getUsageColor(35, 40, 30)).toBe('yellow');
  });
});

describe('getCpuColor', () => {
  it('> 90 red,> 70 yellow,否则 blue', () => {
    expect(getCpuColor(95)).toBe('red');
    expect(getCpuColor(75)).toBe('yellow');
    expect(getCpuColor(50)).toBe('blue');
  });
});

describe('getMemoryColor', () => {
  it('> 90 red,> 70 yellow,否则 green', () => {
    expect(getMemoryColor(95)).toBe('red');
    expect(getMemoryColor(75)).toBe('yellow');
    expect(getMemoryColor(50)).toBe('green');
  });
});

describe('getDiskUsage', () => {
  it('基本百分比', () => {
    expect(getDiskUsage({ size: 1000, used: 250 })).toBe(25);
    expect(getDiskUsage({ size: '2000', used: '500' })).toBe(25);
  });
  it('size=0 返 0(避免除零)', () => {
    expect(getDiskUsage({ size: 0, used: 100 })).toBe(0);
    expect(getDiskUsage({ size: '0', used: '0' })).toBe(0);
  });
  it('无效数字回退 0', () => {
    expect(getDiskUsage({ size: 'abc', used: 'xyz' })).toBe(0);
  });
});
