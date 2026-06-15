// 【续 37-3】diskScanner 单元测试
// 覆盖 formatBytes / formatMtime / scanDisk(BFS 模拟)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatBytes, formatMtime, scanDisk } from './diskScanner';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('formatBytes', () => {
  it('基本单位', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB');
  });
});

describe('formatMtime', () => {
  it('秒级时间戳转 yyyy-mm-dd', () => {
    const ts = new Date('2024-01-15').getTime() / 1000;
    const out = formatMtime(ts);
    expect(out).toMatch(/2024.*01.*15/);
  });
});

describe('scanDisk BFS', () => {
  function makeHtml(
    items: Array<{ href: string; name: string; isDir: boolean; size?: string; date?: string }>
  ) {
    const rows = items
      .map((i) => {
        const size = i.isDir ? '-' : (i.size ?? '1K');
        const date = i.date ?? '15-Jan-2024 12:00';
        return `<a href="${i.href}">${i.name}</a>${date ? '          ' + size + ' ' + date : ''}`;
      })
      .join('\n');
    return `<html><body><pre>${rows}</pre></body></html>`;
  }

  it('根目录含 3 个文件,挑出最大的', async () => {
    const html = makeHtml([
      { href: 'a.bin', name: 'a.bin', isDir: false, size: '5M' },
      { href: 'b.bin', name: 'b.bin', isDir: false, size: '20M' },
      { href: 'c.bin', name: 'c.bin', isDir: false, size: '12M' },
    ]);
    const fakeFetch = vi.fn(async () => new Response(html, { status: 200 }));
    vi.stubGlobal('fetch', fakeFetch);
    const r = await scanDisk('http://x/files/user', { maxDepth: 1, minLargeSize: 1024 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(r.largest.length).toBe(3);
    expect(r.largest[0].name).toBe('b.bin');
    expect(r.stats.dirsScanned).toBe(1);
    expect(r.stats.filesScanned).toBe(3);
  });

  it('小文件不计入 large', async () => {
    const html = makeHtml([
      { href: 'tiny.txt', name: 'tiny.txt', isDir: false, size: '1K' },
      { href: 'big.bin', name: 'big.bin', isDir: false, size: '50M' },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 }))
    );
    const r = await scanDisk('http://x/files/user', {
      maxDepth: 1,
      minLargeSize: 10 * 1024 * 1024,
    });
    expect(r.largest).toHaveLength(1);
    expect(r.largest[0].name).toBe('big.bin');
  });

  it('老文件进入 oldest', async () => {
    const oldDate = '01-Jan-2020 00:00';
    const newDate = '15-Jun-2026 12:00';
    const html = makeHtml([
      { href: 'old.bin', name: 'old.bin', isDir: false, size: '50M', date: oldDate },
      { href: 'new.bin', name: 'new.bin', isDir: false, size: '50M', date: newDate },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 }))
    );
    const r = await scanDisk('http://x/files/user', {
      maxDepth: 1,
      minLargeSize: 1024,
      staleDays: 365,
    });
    expect(r.oldest).toHaveLength(1);
    expect(r.oldest[0].name).toBe('old.bin');
  });

  it('递归子目录', async () => {
    const rootHtml = makeHtml([{ href: 'sub/', name: 'sub/', isDir: true }]);
    const subHtml = makeHtml([{ href: 'big.bin', name: 'big.bin', isDir: false, size: '100M' }]);
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        n++;
        const isSub = url.endsWith('/sub') || url.endsWith('/sub/');
        return new Response(isSub ? subHtml : rootHtml, { status: 200 });
      })
    );
    const r = await scanDisk('http://x/files/user', { maxDepth: 2, minLargeSize: 1024 });
    expect(n).toBeGreaterThanOrEqual(2);
    expect(r.largest[0]?.name).toBe('big.bin');
  });

  it('fetch 错误时 errors 计数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const r = await scanDisk('http://x/files/user', { maxDepth: 1 });
    expect(r.stats.errors).toBe(1);
    expect(r.largest).toHaveLength(0);
  });
});
