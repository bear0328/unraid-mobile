// 【阶段 P1-测试 - 2026-06-17 续 35-3】主色 hook 单测
// 覆盖:默认色 / update 改色 / reset / LS 持久化 / 多组件订阅同步 / CSS 注入到 <head>
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrimaryColor, PRESET_COLORS, setPrimaryColor } from './usePrimaryColor';

const STORAGE_KEY = 'unraid-mobile-primary-color';

describe('usePrimaryColor', () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById('unraid-mobile-primary-style')?.remove();
  });

  it('默认色 #3b82f6', () => {
    const { result } = renderHook(() => usePrimaryColor());
    expect(result.current.color).toBe('#3b82f6');
    expect(result.current.defaultColor).toBe('#3b82f6');
  });

  it('update 改色,新色应用到 <style>', () => {
    const { result } = renderHook(() => usePrimaryColor());
    act(() => result.current.update('#ec4899'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('#ec4899');
    const css = document.getElementById('unraid-mobile-primary-style')?.textContent || '';
    expect(css).toContain('--primary-500:');
    expect(css).toContain('.bg-primary-600{background-color:var(--primary-600)!important}');
  });

  it('reset 回到默认', () => {
    const { result } = renderHook(() => usePrimaryColor());
    act(() => result.current.update('#ef4444'));
    act(() => result.current.reset());
    expect(result.current.color).toBe('#3b82f6');
  });

  it('presets 包含 8 个预设', () => {
    const { result } = renderHook(() => usePrimaryColor());
    expect(result.current.presets).toHaveLength(8);
    expect(result.current.presets).toEqual(PRESET_COLORS);
  });

  it('多 hook 实例同步(订阅通知)', () => {
    const a = renderHook(() => usePrimaryColor());
    const b = renderHook(() => usePrimaryColor());
    expect(b.result.current.color).toBe('#3b82f6');
    act(() => a.result.current.update('#10b981'));
    expect(b.result.current.color).toBe('#10b981');
  });

  it('初次渲染即注入 <style>(避免闪烁)', () => {
    renderHook(() => usePrimaryColor());
    const el = document.getElementById('unraid-mobile-primary-style');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('--primary-500:');
  });

  it('不同色生成不同 CSS', () => {
    const { result } = renderHook(() => usePrimaryColor());
    act(() => result.current.update('#3b82f6'));
    const blue = document.getElementById('unraid-mobile-primary-style')?.textContent || '';
    act(() => result.current.update('#ef4444'));
    const red = document.getElementById('unraid-mobile-primary-style')?.textContent || '';
    expect(blue).not.toBe(red);
  });

  it('setPrimaryColor (导出函数) 也能改 + 通知', () => {
    const { result } = renderHook(() => usePrimaryColor());
    act(() => setPrimaryColor('#06b6d4'));
    expect(result.current.color).toBe('#06b6d4');
  });
});
