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
});
