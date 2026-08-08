// 【续 88 2026-08-08】safeUrl 白名单测试
import { describe, it, expect } from 'vitest';
import { safeUrl } from './safeUrl';

describe('safeUrl', () => {
  it('放行 http:// 和 https://', () => {
    expect(safeUrl('http://192.168.6.140:3998')).toBe('http://192.168.6.140:3998');
    expect(safeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('scheme 大小写不敏感(HTTPS:// 也放行)', () => {
    expect(safeUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('拦截 javascript:/data:/vbscript: 等危险 scheme', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('JavaScript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined();
  });

  it('拦截伪装值:前导空白 / 协议相对 / 无 scheme 裸域名', () => {
    expect(safeUrl('  javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('//evil.com/x')).toBeUndefined();
    expect(safeUrl('example.com')).toBeUndefined();
  });

  it('空值返回 undefined', () => {
    expect(safeUrl('')).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});
