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

  it('【续 95 P1-3】点击铃铛 → 打开本地告警列表弹层(不直接跳 webGui)', async () => {
    mockGetServerMeta.mockResolvedValue(
      metaWith([
        makeAlert('ALERT', 'a1'),
        { ...makeAlert('WARNING', 'w1'), link: '/Tools/Notifications?x=1' },
      ])
    );
    render(<UnraidAlertBell />);
    const btn = await screen.findByLabelText('unRAID 告警');
    fireEvent.click(btn);
    // 弹层打开,列表渲染 2 条,级别徽章正确
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('unRAID 告警 (2)')).toBeInTheDocument();
    expect(screen.getByText('ALERT')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(screen.getByText('s-w1')).toBeInTheDocument();
    // 点击瞬间不跳 webGui
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('【续 95 P1-3】带 link 的告警 → 渲染为新窗 <a>,href 拼 serverUrl', async () => {
    mockGetServerMeta.mockResolvedValue(
      metaWith([{ ...makeAlert('ALERT', 'a1'), link: '/Tools/Notifications?x=1' }])
    );
    render(<UnraidAlertBell />);
    fireEvent.click(await screen.findByLabelText('unRAID 告警'));
    const link = await screen.findByRole('link', { name: /a1/ });
    expect(link).toHaveAttribute('href', 'http://nas.local:8001/Tools/Notifications?x=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('【续 95 P1-3】点「在 webGui 查看全部」→ 新窗打开 {serverUrl}/Tools/Notifications(尾部斜杠已去)', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([makeAlert('ALERT')]));
    render(<UnraidAlertBell />);
    fireEvent.click(await screen.findByLabelText('unRAID 告警'));
    fireEvent.click(await screen.findByText('在 webGui 查看全部'));
    expect(openSpy).toHaveBeenCalledWith(
      'http://nas.local:8001/Tools/Notifications',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('【续 95 P1-3】点头部 × → 弹层消失', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([makeAlert('ALERT')]));
    render(<UnraidAlertBell />);
    fireEvent.click(await screen.findByLabelText('unRAID 告警'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // getByLabelText 只匹配 aria-label(头部 ×),不匹配底部「关闭」文字按钮
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('【续 95-1】ModalFooter 有「关闭」按钮,点击 → 弹层消失', async () => {
    mockGetServerMeta.mockResolvedValue(metaWith([makeAlert('ALERT')]));
    render(<UnraidAlertBell />);
    fireEvent.click(await screen.findByLabelText('unRAID 告警'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // 头部 ×(aria-label)与底部「关闭」(文字)可访问名同为「关闭」,按文字内容区分底部按钮
    const footerClose = screen
      .getAllByRole('button', { name: '关闭' })
      .find((b) => b.textContent === '关闭');
    expect(footerClose).toBeDefined();
    fireEvent.click(footerClose!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
