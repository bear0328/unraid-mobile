// 【阶段 P2-12 - 2026-06-17 续 28-4】Settings 页面集成测试
// 覆盖:加载已有 config → 填表单 / 切换主题 / 保存 API / DAV 密码 / 日志密码
// 关键:mock 掉 unraidApi 的 fetch (settings.json PUT) + localStorage 断言
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

// 【续 43 2026-06-20】Mock useTheme 直接给固定返回值(更稳 — 原 mock 用 plain object 模拟 ThemeContext,
// useTheme.ts 内的 useContext(ThemeContext) 拿到 plain object 返 undefined)。
// Settings.tsx 通过 useTheme.ts 拿 useTheme,直接 mock 整个 useTheme 模块
vi.mock('../context/useTheme', () => ({
  useTheme: () => ({
    theme: 'light' as const,
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
    auto: true,
    setAuto: vi.fn(),
  }),
}));

// Mock useApiConfig: 第一次返 null(没有 config),第二次返现有 config
const mockUseApiConfig = vi.fn();
vi.mock('../hooks/useUnraidApi', () => ({
  useApiConfig: () => mockUseApiConfig(),
  useUnraidApi: vi.fn(() => null),
}));

// Mock services
vi.mock('../services', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../services');
  return {
    ...actual,
    saveApiConfig: vi.fn(),
    loadConfigFromFile: vi.fn().mockResolvedValue(null),
  };
});

import { saveApiConfig } from '../services';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
// 【续 55 商业化】ProGate 跳设置页依赖 Router;测试直接置 license 状态控制 pro
import { __setLicenseStateForTest, __resetLicenseForTest } from '../services/license';

const DAV_KEY = 'unraid-mobile-dav-password';
const LOG_KEY = 'unraid-mobile-log-password';

// Settings 用了 useLocation(续 55 focusLicense 滚动),必须包 Router
const renderSettings = () =>
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );

describe('Settings 页面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseApiConfig.mockReturnValue({ config: null });
    // mock fetch 全局(用于 PUT /config/settings.json)
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    __resetLicenseForTest();
  });

  it('渲染所有主要区块:服务器连接 / WebDAV 密码 / 日志密码 / 外观 / 关于', () => {
    renderSettings();
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('服务器连接')).toBeInTheDocument();
    expect(screen.getByText('WebDAV 鉴权密码')).toBeInTheDocument();
    expect(screen.getByText('日志鉴权密码')).toBeInTheDocument();
    expect(screen.getByText('外观')).toBeInTheDocument();
    expect(screen.getByText('关于')).toBeInTheDocument();
  });

  it('服务器地址和 API Key 留空 → 点击保存触发 alert 提示', async () => {
    const user: UserEvent = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderSettings();
    await user.click(screen.getByRole('button', { name: /保存设置/ }));
    expect(alertSpy).toHaveBeenCalledWith('请填写完整的服务器地址和 API 密钥');
    alertSpy.mockRestore();
  });

  it('填好服务器 + API Key → 点保存触发 PUT /config/settings.json', async () => {
    const user: UserEvent = userEvent.setup();
    renderSettings();
    await user.type(screen.getByPlaceholderText('http://192.168.1.100'), 'http://nas:3998');
    await user.type(screen.getByPlaceholderText('输入您的 unRAID API 密钥'), 'my-key-123');
    await user.click(screen.getByRole('button', { name: /保存设置/ }));
    await waitFor(() => {
      expect(saveApiConfig).toHaveBeenCalledWith({
        serverUrl: 'http://nas:3998',
        apiKey: 'my-key-123',
      });
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/config/settings.json',
      expect.objectContaining({ method: 'PUT' })
    );
    // 【续 49】settings.json 只写 serverUrl,apiKey 不落服务器文件
    const putBody = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
    );
    expect(putBody).toEqual({ serverUrl: 'http://nas:3998' });
    expect(putBody).not.toHaveProperty('apiKey');
  });

  it('点击 "👁️" 切换 API Key input type:password → text', async () => {
    const user: UserEvent = userEvent.setup();
    renderSettings();
    const apiKeyInput = screen.getByPlaceholderText('输入您的 unRAID API 密钥') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');
    // 找 API Key 旁边的"显示密码"按钮(👁️‍🗨️)
    const showButtons = screen.getAllByText('👁️‍🗨️');
    await user.click(showButtons[0]);
    expect(apiKeyInput.type).toBe('text');
  });

  it('输入 DAV 密码 → 点击保存 → 写入 localStorage', async () => {
    const user: UserEvent = userEvent.setup();
    renderSettings();
    await user.type(
      screen.getByPlaceholderText('WebDAV 密码（与 nginx .davpasswd 一致）'),
      'dav-pwd'
    );
    await user.click(screen.getByRole('button', { name: /保存 WebDAV 密码/ }));
    await waitFor(() => {
      expect(localStorage.getItem(DAV_KEY)).toBe('dav-pwd');
    });
  });

  it('输入日志密码 → 点击保存 → 写入 localStorage', async () => {
    const user: UserEvent = userEvent.setup();
    renderSettings();
    await user.type(screen.getByPlaceholderText('日志密码（与 nginx .logpasswd 一致）'), 'log-pwd');
    await user.click(screen.getByRole('button', { name: /保存日志密码/ }));
    await waitFor(() => {
      expect(localStorage.getItem(LOG_KEY)).toBe('log-pwd');
    });
  });

  it('初次加载时 localStorage 有 DAV 密码 → 自动填入输入框', () => {
    localStorage.setItem(DAV_KEY, 'preload-dav');
    localStorage.setItem(LOG_KEY, 'preload-log');
    renderSettings();
    expect(screen.getByPlaceholderText('WebDAV 密码（与 nginx .davpasswd 一致）')).toHaveValue(
      'preload-dav'
    );
    expect(screen.getByPlaceholderText('日志密码（与 nginx .logpasswd 一致）')).toHaveValue(
      'preload-log'
    );
  });

  it('existingConfig 存在 → 字段自动填入 + 不调 loadConfigFromFile', async () => {
    mockUseApiConfig.mockReturnValue({
      config: { serverUrl: 'http://pre.local:3998', apiKey: 'pre-key' },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://192.168.1.100')).toHaveValue(
        'http://pre.local:3998'
      );
    });
    expect(screen.getByPlaceholderText('输入您的 unRAID API 密钥')).toHaveValue('pre-key');
  });

  // ==== 续 55 商业化:告警通知(Webhook + 远程上报) → Pro ====
  it('未激活 license → Webhook/远程上报区块替换为 🔒 引导;激活后正常渲染', () => {
    // 默认无 license(未解锁)
    renderSettings();
    expect(screen.getByText(/告警通知 · Pro 功能/)).toBeInTheDocument();
    expect(screen.queryByText(/容器事件 Webhook/)).not.toBeInTheDocument();
    expect(screen.queryByText(/远程上报/)).not.toBeInTheDocument();
  });

  it('激活 license → Webhook + 远程上报区块正常渲染', () => {
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
    renderSettings();
    expect(screen.getByText(/容器事件 Webhook/)).toBeInTheDocument();
    expect(screen.getByText(/📡 远程上报/)).toBeInTheDocument();
    expect(screen.queryByText(/告警通知 · Pro 功能/)).not.toBeInTheDocument();
  });
});
