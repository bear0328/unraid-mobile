// 【续 53 2026-07-19】LogsModal 测试:行首 ISO 时间戳显示为 HH:MM:SS + pre-wrap 换行
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LogsModal } from './LogsModal';
import { formatLogTimesForDisplay } from '../utils/formatters';

describe('formatLogTimesForDisplay', () => {
  it('行首 [ISO8601] → 本地 [HH:MM:SS]', () => {
    const ts = '2026-07-19T10:00:02Z';
    const expected = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    const hh = `${p(expected.getHours())}:${p(expected.getMinutes())}:${p(expected.getSeconds())}`;
    expect(formatLogTimesForDisplay(`[${ts}] hello`)).toBe(`[${hh}] hello`);
  });

  it('带纳秒/时区偏移的时间戳也转', () => {
    const out = formatLogTimesForDisplay('[2026-07-19T10:00:02.123456789+00:00] x');
    expect(out).toMatch(/^\[\d{2}:\d{2}:\d{2}\] x$/);
  });

  it('非时间戳行 / 无法解析的行原样保留', () => {
    expect(formatLogTimesForDisplay('plain line\n[not-a-date] y')).toBe(
      'plain line\n[not-a-date] y'
    );
  });

  it('多行混合:只转有时间戳的行', () => {
    const out = formatLogTimesForDisplay('[2026-07-19T10:00:02Z] a\nno ts\n[2026-07-19T10:00:03Z] b');
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] a$/);
    expect(lines[1]).toBe('no ts');
    expect(lines[2]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] b$/);
  });
});

describe('LogsModal', () => {
  const base = {
    open: true,
    title: 'nginx',
    loading: false,
    error: null as string | null,
    liveRefresh: false,
    onClose: () => {},
    onToggleLiveRefresh: () => {},
  };

  it('日志时间戳以 HH:MM:SS 显示,且容器带 whitespace-pre-wrap(换行不折叠)', () => {
    const { container } = render(<LogsModal {...base} logs="[2026-07-19T10:00:02Z] hello" />);
    const logBox = container.querySelector('.whitespace-pre-wrap');
    expect(logBox).not.toBeNull();
    expect(logBox!.textContent).toMatch(/^\[\d{2}:\d{2}:\d{2}\] hello$/);
    expect(logBox!.textContent).not.toContain('2026-07-19');
  });

  it('无日志时显示 error 或 无日志', () => {
    render(<LogsModal {...base} logs="" error="获取日志失败" />);
    expect(screen.getByText('获取日志失败')).toBeInTheDocument();
  });
});
