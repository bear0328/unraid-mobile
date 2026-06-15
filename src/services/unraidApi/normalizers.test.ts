// 【阶段 P2-1 - 2026-06-16 续 13】normalizers 纯函数测试
// 覆盖:normalizeDiskType / normalizeDockerState / formatUptimeFromDate / normalizeDiskStatus
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeDiskType,
  normalizeDockerState,
  formatUptimeFromDate,
  normalizeDiskStatus,
} from './normalizers';

describe('normalizeDiskType', () => {
  it('空字符串返 data(默认)', () => {
    expect(normalizeDiskType('')).toBe('data');
  });
  it.each([
    ['PARITY', 'parity'],
    ['parity', 'parity'],
    ['Data', 'data'],
    ['CACHE', 'cache'],
    // SSD/CACHE 都被识别为 cache(实现里 SSD 含 'SSD' → cache,语义上 cache SSD 都归 cache)
    ['SSD', 'cache'],
    ['nvme-ssd', 'cache'],
    ['ssd', 'cache'],
    ['BOOT', 'boot'],
    ['FLASH', 'boot'],
    ['unknown', 'data'],
  ])('normalizeDiskType(%j) === %j', (input, expected) => {
    expect(normalizeDiskType(input)).toBe(expected);
  });
});

describe('normalizeDockerState', () => {
  it('exited / dead / stopped → stopped', () => {
    expect(normalizeDockerState('exited', 'Exited (0) 3 minutes ago')).toBe('stopped');
    expect(normalizeDockerState('dead', '')).toBe('stopped');
    expect(normalizeDockerState('stopped', '')).toBe('stopped');
  });
  it('status 含 (unhealthy) → 仍算 running(【续 50 B6】健康度是 status 文本,不进 state)', () => {
    expect(normalizeDockerState('running', 'Up 2 hours (unhealthy)')).toBe('running');
  });
  it('paused → paused', () => {
    expect(normalizeDockerState('paused', '')).toBe('paused');
    expect(normalizeDockerState('running', 'Paused')).toBe('paused');
  });
  it('restarting → restarting', () => {
    expect(normalizeDockerState('restarting', '')).toBe('restarting');
  });
  it('running / up / healthy / starting → running', () => {
    expect(normalizeDockerState('running', '')).toBe('running');
    expect(normalizeDockerState('up', '')).toBe('running');
    expect(normalizeDockerState('running', 'Up 2 hours')).toBe('running');
    expect(normalizeDockerState('running', 'Up 2 hours (healthy)')).toBe('running');
    expect(normalizeDockerState('', 'starting')).toBe('running');
  });
  it('未知状态默认 stopped(防御性)', () => {
    expect(normalizeDockerState('???', '???')).toBe('stopped');
  });
});

describe('formatUptimeFromDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('null / 空字符串返 N/A', () => {
    expect(formatUptimeFromDate(null)).toBe('N/A');
    expect(formatUptimeFromDate('')).toBe('N/A');
  });

  it('无效日期字符串返 N/A', () => {
    expect(formatUptimeFromDate('not a date')).toBe('N/A');
  });

  it('2 天 5 小时前:返 "2d 5h"', () => {
    const past = new Date('2026-06-14T07:00:00Z').toISOString();
    expect(formatUptimeFromDate(past)).toBe('2d 5h');
  });

  it('0 天 3 小时前:返 "0d 3h"', () => {
    const past = new Date('2026-06-16T09:00:00Z').toISOString();
    expect(formatUptimeFromDate(past)).toBe('0d 3h');
  });
});

describe('normalizeDiskStatus', () => {
  it('空字符串返 unknown', () => {
    expect(normalizeDiskStatus('')).toBe('unknown');
    // @ts-expect-error 测试 undefined 入参(历史 API 容忍)
    expect(normalizeDiskStatus(undefined)).toBe('unknown');
  });
  it.each([
    ['DISK_OK', 'normal'],
    ['Normal', 'normal'],
    ['STARTED', 'normal'],
    ['DISK_ERR', 'error'],
    ['ERROR', 'error'],
    ['DISK_RD', 'rebuilding'],
    ['REBUILDING', 'rebuilding'],
  ])('normalizeDiskStatus(%j) === %j', (input, expected) => {
    expect(normalizeDiskStatus(input)).toBe(expected);
  });
});
