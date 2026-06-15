/**
 * 日志解析工具
 * - ANSI 颜色转 span
 * - 关键词高亮
 * - syslog 格式解析
 */

import type { ReactNode } from 'react';

// ANSI 前景色码 → Tailwind class
const ANSI_COLORS: Record<number, string> = {
  30: 'text-gray-900 dark:text-gray-100',
  31: 'text-red-600 dark:text-red-400',
  32: 'text-green-600 dark:text-green-400',
  33: 'text-yellow-600 dark:text-yellow-400',
  34: 'text-blue-600 dark:text-blue-400',
  35: 'text-purple-600 dark:text-purple-400',
  36: 'text-cyan-600 dark:text-cyan-400',
  37: 'text-gray-600 dark:text-gray-300',
  90: 'text-gray-500',
  91: 'text-red-500',
  92: 'text-green-500',
  93: 'text-yellow-500',
  94: 'text-blue-500',
  95: 'text-purple-500',
  96: 'text-cyan-500',
  97: 'text-white',
};

/**
 * 解析 ANSI 转义序列为 React span 数组
 */
export function parseAnsiToSpans(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let currentColors: string[] = [];
  let key = 0;

  while (i < text.length) {
    // 匹配 ESC [ ... 字母
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      let end = i + 2;
      while (end < text.length && !/[a-zA-Z]/.test(text[end])) end++;
      if (end >= text.length) break;
      const final = text[end];
      const paramsStr = text.slice(i + 2, end);
      const params = paramsStr
        .split(';')
        .map((p) => parseInt(p, 10))
        .filter((n) => !isNaN(n));

      if (final === 'm') {
        if (params.length === 0 || (params.length === 1 && params[0] === 0)) {
          currentColors = [];
        } else {
          const fgs = params.filter((p) => (p >= 30 && p <= 37) || (p >= 90 && p <= 97));
          if (fgs.length > 0) {
            currentColors = [ANSI_COLORS[fgs[0]] || ''];
          }
        }
      }
      i = end + 1;
      continue;
    }

    let j = i;
    while (j < text.length && !(text[j] === '\x1b' && text[j + 1] === '[')) j++;
    const seg = text.slice(i, j);
    if (seg) {
      if (currentColors.length > 0 && currentColors[0]) {
        out.push(
          <span key={key++} className={currentColors[0]}>
            {seg}
          </span>
        );
      } else {
        out.push(seg);
      }
    }
    i = j;
  }
  return out;
}

/**
 * 解析 syslog 格式行
 */
export function parseSyslogLine(line: string): {
  isSyslog: boolean;
  time: string;
  host: string;
  proc: string;
  msg: string;
} {
  const m = line.match(
    /^(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\s:[]+)(?:\[\d+\])?:\s*(.*)$/
  );
  if (!m) {
    return { isSyslog: false, time: '', host: '', proc: '', msg: line };
  }
  return {
    isSyslog: true,
    time: m[1],
    host: m[2],
    proc: m[3],
    msg: m[4],
  };
}

/**
 * 颜色化整行（基于日志级别关键字）
 */
export function colorizeLine(line: string): string {
  const lower = line.toLowerCase();
  if (/\berror\b|\bfail(ed|ure)?\b|\bcritical\b|\balert\b|\bpanic\b/.test(lower)) {
    return 'text-red-600 dark:text-red-400';
  }
  if (/\bwarn(ing)?\b/.test(lower)) {
    return 'text-yellow-600 dark:text-yellow-400';
  }
  if (/\bnotice\b|\binfo\b/.test(lower)) {
    return 'text-blue-600 dark:text-blue-400';
  }
  return 'text-gray-800 dark:text-gray-200';
}

/**
 * 组合：ANSI 解析 + 关键词高亮
 */
export function renderHighlightedWithAnsi(text: string, filter: string): ReactNode {
  const ansiSpans = parseAnsiToSpans(text);
  if (!filter) return ansiSpans;

  return ansiSpans.map((span, idx) => {
    if (typeof span !== 'string') return span;
    const lowerSpan = span.toLowerCase();
    const lowerFilter = filter.toLowerCase();
    if (!lowerSpan.includes(lowerFilter)) return span;

    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let searchIndex = lowerSpan.indexOf(lowerFilter);
    let partKey = 0;

    while (searchIndex !== -1) {
      if (searchIndex > lastIndex) {
        parts.push(span.slice(lastIndex, searchIndex));
      }
      parts.push(
        <mark
          key={`m-${idx}-${partKey++}`}
          className="bg-yellow-300 dark:bg-yellow-500/40 text-gray-900 dark:text-white rounded px-0.5 font-semibold"
        >
          {span.slice(searchIndex, searchIndex + filter.length)}
        </mark>
      );
      lastIndex = searchIndex + filter.length;
      searchIndex = lowerSpan.indexOf(lowerFilter, lastIndex);
    }
    if (lastIndex < span.length) parts.push(span.slice(lastIndex));
    return <span key={`hl-${idx}`}>{parts}</span>;
  });
}
