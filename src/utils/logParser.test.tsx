// 【阶段 P2-1 - 2026-06-16 续 11】logParser 单测
// 覆盖:parseSyslogLine / colorizeLine / parseAnsiToSpans / renderHighlightedWithAnsi
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  parseSyslogLine,
  colorizeLine,
  parseAnsiToSpans,
  renderHighlightedWithAnsi,
} from './logParser';

describe('parseSyslogLine', () => {
  it('匹配标准 syslog 格式', () => {
    const line = 'Jun 15 14:30:01 nas kernel: [12345.678] usb 1-1: new high-speed USB device';
    const p = parseSyslogLine(line);
    expect(p.isSyslog).toBe(true);
    expect(p.time).toBe('Jun 15 14:30:01');
    expect(p.host).toBe('nas');
    expect(p.proc).toBe('kernel');
    expect(p.msg).toContain('usb 1-1');
  });

  it('带 [pid] 后缀', () => {
    const line = 'Jun 15 14:30:01 box nginx[1234]: 200 OK';
    const p = parseSyslogLine(line);
    expect(p.isSyslog).toBe(true);
    expect(p.proc).toBe('nginx');
    expect(p.msg).toBe('200 OK');
  });

  it('非 syslog 格式返 isSyslog=false', () => {
    const p = parseSyslogLine('not a syslog line');
    expect(p.isSyslog).toBe(false);
    expect(p.msg).toBe('not a syslog line');
  });

  it('空行不崩', () => {
    const p = parseSyslogLine('');
    expect(p.isSyslog).toBe(false);
  });
});

describe('colorizeLine', () => {
  it('error/fail/critical 关键字返 red 类', () => {
    expect(colorizeLine('something ERROR happened')).toContain('red');
    expect(colorizeLine('Connection failed')).toContain('red');
    expect(colorizeLine('CRITICAL: out of memory')).toContain('red');
  });
  it('warn 关键字返 yellow 类', () => {
    expect(colorizeLine('warning: deprecated')).toContain('yellow');
  });
  it('notice/info 返 blue 类', () => {
    expect(colorizeLine('info: started')).toContain('blue');
  });
  it('普通行返 gray 类', () => {
    expect(colorizeLine('hello world')).toContain('gray');
  });
  it('大小写不敏感', () => {
    expect(colorizeLine('ERROR')).toContain('red');
    expect(colorizeLine('error')).toContain('red');
  });
});

describe('parseAnsiToSpans', () => {
  it('无 ANSI 序列返字符串数组', () => {
    const out = parseAnsiToSpans('plain text');
    expect(Array.isArray(out)).toBe(true);
    // render 出来包含原文本
    const { container } = render(<>{out}</>);
    expect(container.textContent).toBe('plain text');
  });

  it('ANSI 红色 31 被解析成 span', () => {
    const out = parseAnsiToSpans('\x1b[31mhello\x1b[0m world');
    const { container } = render(<>{out}</>);
    // hello 应该在带 red 类的 span 里
    const redSpan = container.querySelector('span');
    expect(redSpan?.textContent).toBe('hello');
    expect(redSpan?.className).toContain('red');
  });

  it('reset \\x1b[0m 清空颜色', () => {
    const out = parseAnsiToSpans('\x1b[31mred\x1b[0m plain');
    const { container } = render(<>{out}</>);
    expect(container.textContent).toBe('red plain');
  });
});

describe('renderHighlightedWithAnsi', () => {
  it('无 filter 时等同 parseAnsiToSpans 输出', () => {
    const out = renderHighlightedWithAnsi('plain text', '');
    const { container } = render(<>{out}</>);
    expect(container.textContent).toBe('plain text');
  });

  it('filter 命中关键字时包 <mark>', () => {
    const out = renderHighlightedWithAnsi('user logged in successfully', 'logged');
    const { container } = render(<>{out}</>);
    const mark = container.querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toBe('logged');
  });

  it('filter 大小写不敏感', () => {
    const out = renderHighlightedWithAnsi('Error happened', 'error');
    const { container } = render(<>{out}</>);
    expect(container.querySelector('mark')?.textContent).toBe('Error');
  });

  it('特殊字符 filter 不崩(经 Logs 调用方验证)', () => {
    // Logs 已做 .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') 转义
    // 这里只测 render 层接受任意字符不抛错
    expect(() => renderHighlightedWithAnsi('hello.world', '.')).not.toThrow();
  });

  it('多次匹配多个 mark', () => {
    const out = renderHighlightedWithAnsi('foo bar foo baz foo', 'foo');
    const { container } = render(<>{out}</>);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
  });
});
