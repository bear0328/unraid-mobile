// 【阶段 P2-4 - 2026-06-16 续 16】parseAutoindex 单独测试
// 覆盖:文件/目录解析 / 排序头链接 ?C=N;O=D 过滤 / ../ 过滤 / 大小/日期解析 / 多级路径 normalize
import { describe, it, expect } from 'vitest';
import { parseAutoindexHtml } from './parseAutoindex';

function nginxAutoindex(files: Array<{ name: string; size: string; date: string }>): string {
  const header = `<a href="?C=N;O=D">Name</a><a href="?C=M;O=A">Last modified</a><a href="?C=S;O=A">Size</a><hr>`;
  // nginx 实际格式:  name(spaces)size(spaces)date
  // parser regex 期待 size+date 紧挨着,所以 mock 保持 size 在 date 之前
  const rows = files
    .map((f) => `<a href="${f.name}">${f.name}</a>             ${f.size}    ${f.date}\n`)
    .join('');
  return `<html><body><pre>${header}\n${rows}</pre></body></html>`;
}

describe('parseAutoindexHtml', () => {
  it('解析文件列表', () => {
    const html = nginxAutoindex([
      { name: 'bear.jpg', size: '1.2K', date: '01-Jun-2026 12:00' },
      { name: 'doc.pdf', size: '256K', date: '02-Jun-2026 13:30' },
    ]);
    const items = parseAutoindexHtml(html, 'photos/');
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('bear.jpg');
    expect(items[0].isDir).toBe(false);
    expect(items[0].size).toBe(Math.round(1.2 * 1024));
    expect(items[0].path).toBe('photos/bear.jpg');
  });

  it('nginx 排序头链接(?C=N;O=D 等)被过滤,不进 items', () => {
    // 真实 nginx autoindex HTML,header 链接必须被过滤
    const html = nginxAutoindex([{ name: 'a.jpg', size: '1K', date: '01-Jun-2026 12:00' }]);
    const items = parseAutoindexHtml(html, 'photos/');
    expect(items).toHaveLength(1);
    // 不应出现 "Name" / "Last modified" / "Size" 头链接
    expect(items.every((i) => !i.name.startsWith('?'))).toBe(true);
    expect(items.find((i) => i.name === 'Name')).toBeUndefined();
    expect(items.find((i) => i.name === 'Last modified')).toBeUndefined();
    expect(items.find((i) => i.name === 'Size')).toBeUndefined();
  });

  it('解析目录(以 / 结尾)→ isDir=true', () => {
    const html = nginxAutoindex([{ name: 'subdir/', size: '-', date: '01-Jun-2026 12:00' }]);
    const items = parseAutoindexHtml(html, '');
    expect(items).toHaveLength(1);
    expect(items[0].isDir).toBe(true);
    expect(items[0].name).toBe('subdir');
  });

  it('../ 链接被过滤', () => {
    const html = nginxAutoindex([
      { name: '../', size: '-', date: '01-Jun-2026 12:00' },
      { name: 'a.jpg', size: '1K', date: '01-Jun-2026 12:00' },
    ]);
    const items = parseAutoindexHtml(html, 'photos/');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('a.jpg');
  });

  it('目录排在前,文件排在后(同 sort 行为)', () => {
    const html = nginxAutoindex([
      { name: 'a.txt', size: '1K', date: '01-Jun-2026 12:00' },
      { name: 'b/', size: '-', date: '01-Jun-2026 12:00' },
    ]);
    const items = parseAutoindexHtml(html, '');
    expect(items[0].isDir).toBe(true);
    expect(items[1].isDir).toBe(false);
  });

  it('大小单位 K/M/G/T 解析正确', () => {
    // 【续 17 - 2026-06-16】修 rowText 共享 bug 后,每个 link 拿自己的行 text
    // 多文件时各 link 的 size 应该独立,不再共享第一个文件的 size
    const html = nginxAutoindex([
      { name: 'a', size: '2K', date: '01-Jun-2026 12:00' },
      { name: 'b', size: '1.5M', date: '02-Jun-2026 12:00' },
    ]);
    const items = parseAutoindexHtml(html, '');
    expect(items).toHaveLength(2);
    // 注:parser 内部按 sort 排序(目录在前,文件按名升序),所以 'a' 在 'b' 前
    expect(items[0].name).toBe('a');
    expect(items[0].size).toBe(2 * 1024);
    expect(items[1].name).toBe('b');
    expect(items[1].size).toBe(Math.round(1.5 * 1024 * 1024));
  });

  it('空 HTML → 空数组', () => {
    const items = parseAutoindexHtml('<pre></pre>', 'photos/');
    expect(items).toEqual([]);
  });

  it('无 <pre> 标签 → 空数组', () => {
    const items = parseAutoindexHtml('<html></html>', 'photos/');
    expect(items).toEqual([]);
  });

  // 【续 103 P0-1】href 是 nginx 编码态,解析后 path 应为原始态(双程一致)
  it('编码 href(中文/%)→ path 解码为原始态', () => {
    const html =
      '<html><body><pre>' +
      '<a href="%E4%B8%AD%E6%96%87.txt">中文.txt</a>             1K    01-Jun-2026 12:00\n' +
      '<a href="100%2541.txt">100%41.txt</a>             1K    01-Jun-2026 12:00\n' +
      '<a href="%E5%AD%90%E7%9B%AE%E5%BD%95/">子目录/</a>             -    01-Jun-2026 12:00\n' +
      '</pre></body></html>';
    const items = parseAutoindexHtml(html, 'photos/');
    expect(items).toHaveLength(3);
    const file = items.find((i) => i.name === '中文.txt');
    expect(file?.path).toBe('photos/中文.txt');
    // %25 → 原始 %(不会再被误解码成 A)
    const pct = items.find((i) => i.name === '100%41.txt');
    expect(pct?.path).toBe('photos/100%41.txt');
    const dir = items.find((i) => i.name === '子目录');
    expect(dir?.path).toBe('photos/子目录/');
    expect(dir?.isDir).toBe(true);
  });

  // 【续 103 P1-6】日期手动解析,不依赖 new Date(非标准串) 的 Safari 表现
  it('日期 09-Aug-2026 17:30 解析为精确 mtime(本地时区)', () => {
    const html = nginxAutoindex([{ name: 'a.txt', size: '1K', date: '09-Aug-2026 17:30' }]);
    const items = parseAutoindexHtml(html, '');
    expect(items[0].mtime).toBe(new Date(2026, 7, 9, 17, 30).getTime() / 1000);
    expect(items[0].date).toBe('09-Aug-2026 17:30');
  });

  it('日期非法月份 → 回退解析失败归 0,不 NaN', () => {
    const html = nginxAutoindex([{ name: 'a.txt', size: '1K', date: '09-Xxx-2026 17:30' }]);
    const items = parseAutoindexHtml(html, '');
    expect(Number.isNaN(items[0].mtime)).toBe(false);
    expect(items[0].mtime).toBe(0);
  });
});
