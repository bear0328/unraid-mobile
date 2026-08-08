// 【续 88 2026-08-08】URL scheme 白名单
// 容器模板/GraphQL 等外部数据给的链接直接作 <a href> 时,
// React 不会拦截 javascript: 等危险 scheme,必须先过白名单

/**
 * 仅放行 http:// 和 https://,其余(javascript:/data:/协议相对/空值等)返回 undefined
 * 调用方约定:返回 undefined 时不渲染链接
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}
