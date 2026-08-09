// 【续 91 E】UnraidAlertBell 测试:ALERT 红 / WARNING 琥珀 / 无告警不渲染 / 点击跳 webGui 通知页
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UnraidAlertBell from './UnraidAlertBell';
import type { UnraidAlert, UnraidServerMeta } from '../services/types';

// mock getServerMeta(component 唯一依赖的 systemApi 函数);getApiConfig 走真实 LS
const mockGetServerMeta = vi.fn();
vi.mock('../services/unraidApi/systemApi', () => ({
  // 箭头包装延迟取值:工厂在 const 初始化前执行,直接引用会 TDZ 报错
  getServerMeta: (...args: unknown[]) => mockGetServerMeta(...args),
}));

function makeAlert(importance: string, title = 'n'): UnraidAlert {
  return { title, subject: `s-${title}`, importance };
}

function metaWith(alerts: UnraidAlert[]): UnraidServerMeta {
  return { version: '7.3.0', regTy: 'PRO', osUpdate: null, alerts };
}

describe('UnraidAlertBell', () => {
  let openSpy: MockInstance<typeof window.open>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('unraid-mobile-server-url', 'http://nas.local:8001/');
    localStorage.setItem('unraid-mobile-api-key', 'k');
    mockGetServerMeta.mockReset();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('含 ALERT → 徽章红色,计数为告警条数', async () => {
    mockGetServerMeta.mockResolvedValue(
      metaWith([makeAlert('WARNING', 'w1'), makeAlert('ALERT', 'a1'), makeAlert('ALERT', 'a2')])
    );
    render(<UnraidAlertBell />);
    const btn = await screen.findByLabelText('unRAID 告警');
    const badge = btn.querySelector('span')!;
    expect(badge.textContent).toBe('3');
    expect(badge.className).toMatch(/bg-red-500/);
  });

  it('纯 WARNING → 徽章琥珀色', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([makeAlert('WARNING')]));
    render(<UnraidAlertBell />);
    const btn = await screen.findByLabelText('unRAID 告警');
    const badge = btn.querySelector('span')!;
    expect(badge.textContent).toBe('1');
    expect(badge.className).toMatch(/bg-amber-500/);
  });

  it('无告警 → 不渲染按钮', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([]));
    const { container } = render(<UnraidAlertBell />);
    await waitFor(() => expect(mockGetServerMeta).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('getServerMeta 失败(返 null)→ 不渲染,不抛错', async () => {
    mockGetServerMeta.mockResolvedValue(null);
    const { container } = render(<UnraidAlertBell />);
    await waitFor(() => expect(mockGetServerMeta).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('点击 → 新窗打开 {serverUrl}/Tools/Notifications(尾部斜杠已去)', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([makeAlert('ALERT')]));
    render(<UnraidAlertBell />);
    const btn = await screen.findByLabelText('unRAID 告警');
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith(
      'http://nas.local:8001/Tools/Notifications',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
