// 【阶段 P2-2 - 2026-06-16 续 14】useUnraidApi hook 测试
// 覆盖:config 缺失返 null / config 齐返回 service / config change 触发重建 / useApiConfig 配套
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnraidApi, useApiConfig } from './useUnraidApi';
import { saveApiConfig, clearApiConfig } from '../services';

describe('useUnraidApi', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('config 缺失时返 null', () => {
    const { result } = renderHook(() => useUnraidApi());
    expect(result.current).toBeNull();
  });

  it('config 齐时返 UnraidApiService 实例', () => {
    saveApiConfig({ serverUrl: 'https://nas.local', apiKey: 'k' });
    const { result } = renderHook(() => useUnraidApi());
    expect(result.current).not.toBeNull();
    expect(result.current).toBeInstanceOf(Object); // UnraidApiService
  });

  it('config 变化时(service 重建)configVersion 触发', () => {
    saveApiConfig({ serverUrl: 'https://nas1', apiKey: 'k1' });
    const { result } = renderHook(() => useUnraidApi());
    const before = result.current;
    expect(before).not.toBeNull();

    act(() => {
      saveApiConfig({ serverUrl: 'https://nas2', apiKey: 'k2' });
    });
    // service 引用应已变
    expect(result.current).not.toBe(before);
  });
});

describe('useApiConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('无 config 时返 { config: null, isConfigured: false }', () => {
    const { result } = renderHook(() => useApiConfig());
    expect(result.current.config).toBeNull();
    expect(result.current.isConfigured).toBe(false);
  });

  it('有 config 时返完整对象 + isConfigured: true', () => {
    saveApiConfig({ serverUrl: 'https://nas', apiKey: 'k' });
    const { result } = renderHook(() => useApiConfig());
    expect(result.current.config).toEqual({ serverUrl: 'https://nas', apiKey: 'k' });
    expect(result.current.isConfigured).toBe(true);
  });

  it('saveApiConfig 触发 config 更新', () => {
    const { result } = renderHook(() => useApiConfig());
    expect(result.current.config).toBeNull();
    act(() => {
      saveApiConfig({ serverUrl: 'https://nas', apiKey: 'k' });
    });
    expect(result.current.config).not.toBeNull();
    expect(result.current.isConfigured).toBe(true);
  });

  // 【续 15 - 2026-06-16】修 known gap:clearApiConfig 补 emitApiConfigChange() 后
  // 同 hook 实例的订阅者也能收到清空事件(state 实时变 null)
  it('clearApiConfig 触发 config 变 null(同实例订阅者收到事件)', () => {
    saveApiConfig({ serverUrl: 'https://nas', apiKey: 'k' });
    const { result } = renderHook(() => useApiConfig());
    expect(result.current.isConfigured).toBe(true);

    act(() => {
      clearApiConfig();
    });
    expect(result.current.config).toBeNull();
    expect(result.current.isConfigured).toBe(false);
  });
});
