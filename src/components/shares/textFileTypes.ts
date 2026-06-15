// 【阶段 P2-WebDAV - 2026-06-17 续 34-8】文本文件扩展名白名单
// 抽离自 TextFileEditor.tsx 以避开 react-refresh/only-export-components
const TEXT_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'log',
  'conf',
  'cfg',
  'ini',
  'env',
  'yml',
  'yaml',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'sh',
  'bash',
  'zsh',
  'py',
  'rb',
  'php',
  'pl',
  'lua',
  'go',
  'rs',
  'java',
  'csv',
  'tsv',
  'sql',
  'diff',
  'patch',
  'gitignore',
  'dockerfile',
  'properties',
  'toml',
]);

export function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return TEXT_EXT.has(ext);
}
