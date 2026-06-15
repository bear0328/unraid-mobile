// 【续 45 2026-06-26】useApiHealth cache 命中测试
// 关键场景:localStorage 有 fresh HealthReport → useApiHealth 不发任何 /files/ 等 ping
// 验证"刷新页面不唤醒 array 磁盘"
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiHealth } from './useApiHealth';
import * as unraidApiModule from '../services';
import * as useUnraidApiModule from './useUnraidApi';

const HEALTH_CACHE_KEY = 'unraid-mobile-health-cache';

function writeHealthCache(report: object, ttlMs: number) {
  localStorage.setItem(
    HEALTH_CACHE_KEY,
    JSON.stringify({ report, expiresAt: Date.now() + ttlMs })
  );
}

function makeHealthyReport() {
  return {
    ok: true,
    endpoints: {
      healthz: { ok: true, latencyMs: 5 },
      graphql: { ok: true, latencyMs: 20 },
      config: { ok: true, latencyMs: 3 },
      files: { ok: true, latencyMs: 8 },
    },
    startedAt: Date.now() - 50,
    durationMs: 50,
  };
}

describe('useApiHealth (续 45 cache 命中)', () => {
  beforeEach(() => {
    localStorage.clear();
    // mock useApiConfig:已配置 + serverUrl/apiKey 都在
    vi.spyOn(useUnraidApiModule, 'useApiConfig').mockReturnValue({
      config: { serverUrl: 'http://tower', apiKey: 'k' },
      isConfigured: true,
    } as ReturnType<typeof useUnraidApiModule.useApiConfig>);
  });

  it('localStorage 有 fresh cache → 初始 status 即 healthy,不发 checkHealth', async () => {
    writeHealthCache(makeHealthyReport(), 60_000);
    const checkHealthSpy = vi.spyOn(unraidApiModule, 'checkHealth');

    const { result } = renderHook(() => useApiHealth());

    // 同步即 healthy(不等待任何 promise)
    expect(result.current.status).toBe('healthy');
    expect(result.current.report?.ok).toBe(true);

    // 关键:checkHealth 一次都没调(没有 /files/ 等 4 端点 ping)
    expect(checkHealthSpy).not.toHaveBeenCalled();
  });

  it('localStorage 无 cache → 挂载后 checkHealth 会 fire', async () => {
    const checkHealthSpy = vi
      .spyOn(unraidApiModule, 'checkHealth')
      .mockResolvedValue(makeHealthyReport() as never);

    const { result } = renderHook(() => useApiHealth());

    // 挂载后异步转 healthy(checkHealth 调了 1 次)
    await waitFor(() => expect(result.current.status).toBe('healthy'));
    expect(checkHealthSpy).toHaveBeenCalledTimes(1);
  });

  it('localStorage 有 stale cache(> 60s) → 当作无 cache 处理,会 fire checkHealth', async () => {
    writeHealthCache(makeHealthyReport(), -1000); // 已过期
    const checkHealthSpy = vi
      .spyOn(unraidApiModule, 'checkHealth')
      .mockResolvedValue(makeHealthyReport() as never);

    const { result } = renderHook(() => useApiHealth());

    await waitFor(() => expect(result.current.status).toBe('healthy'));
    expect(checkHealthSpy).toHaveBeenCalledTimes(1);
  });

  it('checkHealth 成功后写 cache(下次挂载可命中)', async () => {
    const checkHealthSpy = vi
      .spyOn(unraidApiModule, 'checkHealth')
      .mockResolvedValue(makeHealthyReport() as never);

    const { result, unmount } = renderHook(() => useApiHealth());
    await waitFor(() => expect(result.current.status).toBe('healthy'));

    // cache 已写
    const cached = localStorage.getItem(HEALTH_CACHE_KEY);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.report.ok).toBe(true);
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());

    unmount();

    // 第二次挂载:cache 命中,不再调 checkHealth
    checkHealthSpy.mockClear();
    const { result: result2 } = renderHook(() => useApiHealth());
    expect(result2.current.status).toBe('healthy');
    expect(checkHealthSpy).not.toHaveBeenCalled();
  });

  it('checkHealth 失败时 status=unhealthy,recheck() 可手动重试', async () => {
    const failReport = {
      ok: false,
      endpoints: {
        healthz: { ok: false, latencyMs: 0, error: 'down' },
        graphql: { ok: false, latencyMs: 0, error: 'down' },
        config: { ok: false, latencyMs: 0, error: 'down' },
        files: { ok: false, latencyMs: 0, error: 'down' },
      },
      startedAt: Date.now(),
      durationMs: 0,
    };
    vi.spyOn(unraidApiModule, 'checkHealth').mockResolvedValue(failReport as never);

    const { result } = renderHook(() => useApiHealth());
    await waitFor(() => expect(result.current.status).toBe('unhealthy'));
    expect(result.current.report?.ok).toBe(false);
    // 失败的 report 不写 cache(避免下次挂载还显示 healthy)
    expect(localStorage.getItem(HEALTH_CACHE_KEY)).toBeNull();
  });

  // 【续 50 H14】graphql 网络层失败 → 事件触发重新体检 → 断网进诊断屏
  it('unraid-network-error 事件 → 重新体检;失败转 unhealthy 并清陈旧 cache', async () => {
    // 场景:已有 fresh healthy cache(挂载不重检),之后断网
    writeHealthCache(makeHealthyReport(), 1_800_000);
    const failReport = {
      ok: false,
      endpoints: {
        healthz: { ok: false, latencyMs: 0, error: 'down' },
        graphql: { ok: false, latencyMs: 0, error: 'down' },
        config: { ok: false, latencyMs: 0, error: 'down' },
        files: { ok: false, latencyMs: 0, error: 'down' },
      },
      startedAt: Date.now(),
      durationMs: 0,
    };
    const checkHealthSpy = vi
      .spyOn(unraidApiModule, 'checkHealth')
      .mockResolvedValue(failReport as never);

    const { result } = renderHook(() => useApiHealth());
    // cache 命中:healthy 且不调 checkHealth
    expect(result.current.status).toBe('healthy');
    expect(checkHealthSpy).not.toHaveBeenCalled();

    // graphql 层网络失败 → 广播事件
    act(() => {
      window.dispatchEvent(new CustomEvent('unraid-network-error'));
    });

    // 触发重新体检 → 失败 → unhealthy + 陈旧 cache 被清
    await waitFor(() => expect(result.current.status).toBe('unhealthy'));
    expect(checkHealthSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(HEALTH_CACHE_KEY)).toBeNull();
  });
});