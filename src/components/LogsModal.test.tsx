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

  // 【续 79】内嵌 nginx/apache 时间戳去重/去日期(真实格式来自 unraid-mobile-dev 访问日志)
  it('有行首 ISO + 内嵌 nginx 时间戳 → 内嵌整条删除(一行一个时间)', () => {
    const line =
      '[2026-07-29T00:01:07.584833505Z] 192.168.6.140 - - [29/Jul/2026:08:01:07 +0800] "GET /graphql HTTP/1.1" 200';
    const out = formatLogTimesForDisplay(line);
    expect(out).toMatch(/^\[\d{2}:\d{2}:\d{2}\] 192\.168\.6\.140 - - "GET \/graphql HTTP\/1\.1" 200$/);
    expect(out).not.toContain('Jul');
  });

  it('无行首时间戳 + 内嵌 nginx 时间戳 → 转 [HH:MM:SS](去日期留时间)', () => {
    const out = formatLogTimesForDisplay('192.168.6.140 - - [29/Jul/2026:08:01:07 +0800] "GET /"');
    expect(out).toBe('192.168.6.140 - - [08:01:07] "GET /"');
  });

  // 【续 79c】应用内嵌日期时间去重/去日期(真实格式:moviepilot Python logging / msgo Go log)
  it('moviepilot 格式:有行首时间 → 内嵌日期时间整条删除', () => {
    const line =
      '[2026-07-29T06:55:19Z] INFO: [moviepilot] 2026-07-29 06:55:19,811 scheduler.py - 主动内存回收完成';
    const out = formatLogTimesForDisplay(line);
    expect(out).not.toContain('2026-07-29');
    expect(out).toMatch(/^\[\d{2}:\d{2}:\d{2}\] INFO: \[moviepilot\] scheduler\.py - 主动内存回收完成$/);
  });

  it('msgo 格式:行首 ISO(纳秒)+ 内嵌日期时间 → 内嵌删除', () => {
    const line =
      '[2026-07-29T00:17:58.701668291Z] 2026-07-29 08:17:58\t stat \t CPU: 0m caller=stat/usage.go:61';
    const out = formatLogTimesForDisplay(line);
    expect(out).not.toContain('2026-07-29');
    expect(out).toMatch(/^\[\d{2}:\d{2}:\d{2}\] stat \t CPU: 0m caller=stat\/usage\.go:61$/);
  });

  it('无行首时间 + 行首裸日期时间 → 去日期留时间并补方括号(毫秒砍掉)', () => {
    const out = formatLogTimesForDisplay('2026-07-29 06:55:19,811 scheduler.py - msg');
    expect(out).toBe('[06:55:19] scheduler.py - msg');
  });

  // 【续 83】moviepilot 实测漏网格式:行首裸 ISO(docker --timestamps,无方括号、纳秒、UTC)
  // + 应用内嵌日期时间 —— 两个都要处理:前缀转本地 [HH:MM:SS],内嵌整条删除;
  // 正文里的纯日期(今日 2026-07-29)必须保留
  it('裸 ISO 前缀 + autosignin 内嵌日期时间 → 前缀转本地时间,内嵌删除,正文纯日期保留', () => {
    const line =
      '2026-07-29T01:00:00.047268990Z INFO:     [autosignin] 2026-07-29 09:00:00,046 autosignin - 今日 2026-07-29 未签到,开始签到';
    const out = formatLogTimesForDisplay(line);
    const d = new Date('2026-07-29T01:00:00.047268990Z');
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hh = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    expect(out).toBe(`[${hh}] INFO:     [autosignin] autosignin - 今日 2026-07-29 未签到,开始签到`);
  });

  it('裸 ISO 前缀(uvicorn 访问日志,无内嵌)→ 转本地 [HH:MM:SS],纳秒砍掉', () => {
    const out = formatLogTimesForDisplay(
      '2026-07-28T22:57:00.177889300Z INFO:     127.0.0.1:54076 - "GET /api/v1/system HTTP/1.1" 200 OK'
    );
    const d = new Date('2026-07-28T22:57:00.177889300Z');
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hh = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    expect(out).toBe(`[${hh}] INFO:     127.0.0.1:54076 - "GET /api/v1/system HTTP/1.1" 200 OK`);
  });

  it('行首锚区(96 字符)之外的日期时间不动(防误伤正文)', () => {
    const padding = 'x'.repeat(100);
    const line = `[2026-07-29T06:55:19Z] ${padding} 2026-07-29 06:55:19 tail`;
    const out = formatLogTimesForDisplay(line);
    expect(out).toContain('2026-07-29 06:55:19 tail');
  });

  it('纯日期 YYYY-MM-DD 不匹配,原样保留', () => {
    const line = '[2026-07-29T06:55:19Z] 备份日期 2026-07-29 完成';
    expect(formatLogTimesForDisplay(line)).toContain('备份日期 2026-07-29 完成');
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

  // 【续 79】ANSI 颜色码渲染成彩色 span(moviepilot 真实日志格式),
  // 不再显示 [32m [0m 等转义残留文本
  it('ANSI 颜色日志:转义码不显示,INFO 染绿色', () => {
    const logs =
      '[2026-07-29T06:32:27Z] \x1b[32mINFO\x1b[0m:     127.0.0.1:41898 - "\x1b[1mGET /api/v1/system\x1b[0m" \x1b[32m200 OK\x1b[0m';
    const { container } = render(<LogsModal {...base} logs={logs} />);
    const logBox = container.querySelector('.whitespace-pre-wrap')!;
    expect(logBox.textContent).not.toContain('[32m');
    expect(logBox.textContent).not.toContain('[0m');
    expect(logBox.textContent).toContain('INFO');
    const green = logBox.querySelector('span.text-green-400');
    expect(green).not.toBeNull();
    expect(green!.textContent).toContain('INFO');
    const bold200 = logBox.querySelectorAll('span.text-green-400');
    expect([...bold200].some((s) => s.textContent?.includes('200 OK'))).toBe(true);
  });

  // 【续 80】弹层 z-overlay(高于 z-sticky 的底部导航)
  // 【续 81】移动端底部抽屉:items-end + 定高 h-[85dvh],footer 钉在视口底部,
  // footer 自身带 safe-area 底部 padding —— iOS 上不再被导航/工具栏挡住
  it('移动端底部抽屉:z-overlay + items-end + 定高,footer 带 safe-area padding', () => {
    const { container } = render(<LogsModal {...base} logs="x" />);
    const overlay = container.querySelector('.fixed.inset-0')! as HTMLElement;
    expect(overlay.className).toContain('z-overlay');
    expect(overlay.className).toContain('items-end');
    const dlg = container.querySelector('[role=dialog]')!;
    expect(dlg.className).toContain('h-[85dvh]');
    const footer = dlg.querySelector('label')!.parentElement as HTMLElement;
    expect(footer.style.paddingBottom).toContain('safe-area-inset-bottom');
  });
});
