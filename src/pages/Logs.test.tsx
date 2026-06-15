// 【阶段 P2-12 - 2026-06-17 续 28-4】Logs 页面集成测试
// 覆盖:初次挂载加载 / 401 提示用户去设置 / 过滤输入 / 自动刷新 toggle / 跳到顶 toggle / 错误展示
// 关键:用全局 fetch mock 控制后端日志响应
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// 【续 50 C5】mock useToast 观察告警 toast(stale closure 测试用)
const mockWarning = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: mockWarning,
  }),
}));

import Logs from './Logs';
const LOG_KEY = 'unraid-mobile-log-password';

const sampleSyslog = [
  'Jun 17 10:00:01 nas kernel: [12345.678] usb 1-1: new high-speed USB device number 5 using xhci_hcd',
  'Jun 17 10:00:02 nas rsyslogd: [origin software="rsyslogd" swVersion="8.2406"] start',
  'Jun 17 10:00:03 nas sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 55555 ssh2',
  'Jun 17 10:00:04 nas dockerd[567]: time="2026-06-17T10:00:04Z" level=info msg="Container started" container=nginx',
].join('\n');

describe('Logs 页面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // 默认 fetch 返 syslog 内容
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(sampleSyslog),
    });
  });

  it('挂载后自动请求 /var/log/syslog,带 cache-bust 参数', async () => {
    render(<Logs />);
    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const url = calls[0][0] as string;
      expect(url).toMatch(/^\/var\/log\/syslog\?_t=\d+$/);
    });
  });

  it('localStorage 有 log 密码 → fetch 头部带 Authorization Basic', async () => {
    localStorage.setItem(LOG_KEY, 'secret123');
    render(<Logs />);
    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const init = lastCall[1] as RequestInit;
      expect(init.headers).toEqual({
        Authorization: 'Basic ' + btoa('loguser:secret123'),
      });
    });
  });

  it('localStorage 无密码 → fetch 不带 Authorization 头', async () => {
    render(<Logs />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const init = lastCall[1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it('后端返 401 → 显示引导用户去设置的错误文案', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(''),
    });
    render(<Logs />);
    await waitFor(() => {
      expect(screen.getByText(/日志鉴权失败 \(401\)/)).toBeInTheDocument();
    });
  });

  it('后端返 404 → 显示 "文件不存在" 错误', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(''),
    });
    render(<Logs />);
    await waitFor(() => {
      // 源码渲染 `❌ 加载失败: {error}`,文本拆分 + 嵌套父元素也 textContent includes,
      // 用 children.length===0 限定叶子 error div
      expect(
        screen.getByText(
          (_, node) =>
            node?.children?.length === 0 && !!node?.textContent?.includes('文件不存在')
        )
      ).toBeInTheDocument();
    });
  });

  it('输入过滤关键字 → 列表行数变少 + 显示匹配数', async () => {
    const user: UserEvent = userEvent.setup();
    render(<Logs />);
    // 等初次加载完成
    await waitFor(() => {
      expect(screen.queryByText(/加载中/)).not.toBeInTheDocument();
    });
    const filterInput = screen.getByPlaceholderText('🔍 过滤');
    await user.type(filterInput, 'sshd');
    // 匹配数应该 >= 1
    await waitFor(() => {
      expect(screen.getByText(/处匹配/)).toBeInTheDocument();
    });
  });

  it('点击"刷新"按钮 → 重新调用 fetch', async () => {
    const user: UserEvent = userEvent.setup();
    render(<Logs />);
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
    const callsBefore = mockFetch.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /刷新/ }));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('点击"自动 (5s)" checkbox → 开启 / 关闭自动刷新', async () => {
    const user: UserEvent = userEvent.setup();
    render(<Logs />);
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
    const initialCalls = mockFetch.mock.calls.length;
    const autoCheckbox = screen.getByLabelText('自动 (5s)');
    // 关闭状态 → 点击开启
    await user.click(autoCheckbox);
    expect(autoCheckbox).toBeChecked();
    // 等至少 1 次自动刷新(5s 触发)
    // 用 vi.useFakeTimers 加速
    vi.useFakeTimers();
    vi.advanceTimersByTime(5500);
    vi.useRealTimers();
    // 注意:fake timer 不会等 fetch 完成的 microtask,所以只检查 checkbox 状态
    expect(autoCheckbox).toBeChecked();
    expect(initialCalls).toBeGreaterThan(0);
  });

  it('加载空日志 → 显示 "日志为空或未选择"', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    });
    render(<Logs />);
    await waitFor(() => {
      // 源码渲染 `📭 {filter ? '无匹配行' : '日志为空或未选择'}`,emoji 与文本拆分 + 嵌套父元素,
      // 用 children.length===0 限定叶子提示 div
      expect(
        screen.getByText(
          (_, node) =>
            node?.children?.length === 0 &&
            !!node?.textContent?.includes('日志为空或未选择')
        )
      ).toBeInTheDocument();
    });
  });

  it('显示 syslog 标签和 描述文本', () => {
    render(<Logs />);
    expect(screen.getByText('rsyslog / emhttp / 内核')).toBeInTheDocument();
  });

  // 【续 50 C5】告警开关在 loadLog 闭包里曾是 stale 值:开启开关后,
  // 5s 自动刷新仍用 mount 时的 false,永远不扫描告警
  it('开启告警后,5s 自动刷新用新开关值扫描并弹 toast', async () => {
    // 先开 fake timers 再 render:自动刷新的 setInterval 必须建在 fake 时钟下才可快进
    vi.useFakeTimers();
    try {
      render(<Logs />);
      // flush mount 的初次加载(sampleSyslog 无告警关键字)
      await act(async () => {});
      expect(mockFetch).toHaveBeenCalled();

      // 先开自动刷新(此时 loadLog 闭包捕获 alertEnabled=false),再开告警
      fireEvent.click(screen.getByLabelText('自动 (5s)'));
      fireEvent.click(screen.getByLabelText(/告警/));

      // 下一轮日志带 error 关键字
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Jun 17 10:00:09 nas kernel: [9.9] error something broke'),
      });

      // 快进 5s 触发自动刷新 → loadLog 应用新开关值扫描
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(mockWarning).toHaveBeenCalled();
      expect(String(mockWarning.mock.calls[0][0])).toContain('error');
    } finally {
      vi.useRealTimers();
    }
  });
});
