// 【续 103 2026-08-10】DAV URL 出口统一编码
// 背景(P0):此前路径直接拼进 DAV URL —— 文件名含 # ? % 时被 URL fragment/转义截断
// (PUT 上传会把内容写进错误路径),中文名进 MOVE/COPY 的 Destination header 直接抛
// ByteString TypeError(header 值只允许 Latin-1)。
// 约定:app 内部路径一律「原始态」(未编码);nginx autoindex href 是编码态,
// parseAutoindexHtml 解析时已解码回原始态(双程一致,%25 还原为 % 再编码仍得 %25)。
// 只有拼 URL / Destination header 时经本函数编码一次。
/**
 * 把「原始态」相对路径编码为可安全拼进 DAV URL / Destination header 的形态。
 * - 按 / 分段,逐段 encodeURIComponent(中文/空格/#/?/% 全转义)
 * - 保留尾部 /(目录语义);空段(连续斜杠)滤掉;空输入返空串
 */
export function encodeDavPath(p: string): string {
  if (!p) return '';
  const trailingSlash = p.endsWith('/');
  const encoded = p
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return trailingSlash ? encoded + '/' : encoded;
}
