// 【续 78】从 pages/Logs.tsx 拆出(纯结构移动,不改行为)

/**
 * 【P0-3 2026-06-17】导出当前过滤结果为 .log 文件(Blob 下载)
 * 常见场景:截屏后给开发者/同事看
 */
export function exportLogLines(lines: string[], fileKey: string, filter: string): void {
  const txt = lines.join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileKey}-${filter ? 'filtered' : 'all'}-${stamp}.log`;
  document.body.appendChild(a);
  a.click();
  // 【续 88 2026-08-08】iOS Safari:必须 setTimeout 延迟 revoke,否则下载未触发就清掉 URL(同 FavoritesCard 教训)
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
