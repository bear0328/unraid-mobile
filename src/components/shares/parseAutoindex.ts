// 【阶段 1 P0 - 2026-06-15】nginx autoindex HTML 解析
// 从 Shares.tsx 拆出：解析 nginx autoindex 格式的 HTML 字符串为 FileItem[]
// 【2026-06-13】nginx autoindex 路径拼接修复 + 规范化的逻辑集中在这里
import { FileItem } from './davAuth';

const SIZE_UNITS: Record<string, number> = {
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
};

function parseSize(sizeText: string): number | undefined {
  const match = sizeText.match(/^([\d.]+)\s*(\w)?$/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();
  return Math.round(num * (SIZE_UNITS[unit] || 1));
}

function parseDate(dateText: string): number {
  return new Date(dateText).getTime() / 1000;
}

function normalizePath(href: string, basePath: string): string {
  let fullPath: string;
  if (href.startsWith('/')) {
    fullPath = href.replace(/^\/+/, '');
  } else {
    fullPath = basePath ? basePath + href : href;
  }
  // 规范化：处理 ../ 和重复 /
  const parts: string[] = [];
  for (const seg of fullPath.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * 解析 nginx autoindex HTML 字符串为 FileItem[]
 * @param html nginx autoindex 格式的 HTML（autoindex 包含 <pre><a>...</a></pre>）
 * @param basePath 当前路径（相对 /user/ 的路径，如 'photos/bear/'）
 */
export function parseAutoindexHtml(html: string, basePath: string): FileItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const pre = doc.querySelector('pre');
  const links = pre?.querySelectorAll('a') || [];
  const files: FileItem[] = [];

  links.forEach((link) => {
    const name = link.textContent?.trim() || '';
    const href = link.getAttribute('href') || '';

    // 【续 16 - 2026-06-16】跳过 nginx autoindex 排序头链接 (?C=N;O=D 等),
    // 它们是表头控件不是文件,parser 不应把它们当文件
    if (href.startsWith('?')) return;

    // 跳过 . 和 ..
    if (name === '../' || name === '..') return;

    // 判断是目录（href 以 / 结尾）
    const isDir = href.endsWith('/');

    // 【续 17 - 2026-06-16】读 link 后面的 text 节点(单行内容),不用 parentElement.textContent
    // (那是整个 pre 的文本,所有 link 共享,导致所有文件 size 都等于第一个文件)
    // jsdom 解析后 link 的 nextSibling 通常是 text node,内容为 "  spaces  size  spaces  date\n"
    const rowText =
      link.nextSibling?.nodeType === 3 /* Node.TEXT_NODE */
        ? (link.nextSibling.textContent ?? '')
        : '';

    // 解析大小 - 通常在 name 后面，格式如 "1.2M" 或 "-"
    const sizeMatch = rowText.match(/([\d.]+\s*[KMGT]?)\s+(\d{2}-\w+-\d{4}\s+\d{2}:\d{2})/);
    let size: number | undefined;
    if (sizeMatch && !isDir) {
      size = parseSize(sizeMatch[1].trim());
    }

    // 解析日期
    const dateMatch = rowText.match(/(\d{2}-\w+-\d{4}\s+\d{2}:\d{2})/);
    const dateText = dateMatch ? dateMatch[1] : '';
    const mtime = dateMatch ? parseDate(dateMatch[1]) : 0;

    // 计算完整路径（相对 /user/ 的路径，不含前导 /）
    let fullPath = normalizePath(href, basePath);
    if (isDir && !fullPath.endsWith('/')) fullPath += '/';

    files.push({
      name: name.replace(/\/$/, ''),
      path: fullPath,
      size,
      mtime,
      date: dateText,
      isDir,
      permissions: '',
    });
  });

  // 排序：目录在前，名称升序
  files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return files;
}
