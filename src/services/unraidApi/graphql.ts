// graphql<T>() 公共方法
// namespace 用于 localStorage cache（可选，传入则启用 cache）
// cache 命中 → 0ms 返回；cache 未命中 → fetch + 写 cache
import { UnraidApiResponse } from '../types';
import { getCache, setCache, getCacheKey } from './cache';

export const API_TIMEOUT = 10000;

export interface GraphqlOptions {
  namespace?: string;
  timeoutMs?: number;
}

export async function graphqlRequest<T>(
  endpoint: string,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
  options: GraphqlOptions = {}
): Promise<UnraidApiResponse<T>> {
  const { namespace, timeoutMs = API_TIMEOUT } = options;

  // 1. cache 命中：直接返回（重复访问场景 0ms）
  if (namespace) {
    const cached = getCache<T>(getCacheKey(namespace));
    if (cached) {
      return { success: true, data: cached.data };
    }
  }

  // 2. cache 未命中：真实 fetch
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // 构造请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果有 API key，添加认证 header
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 读取响应体
    let responseText = '';
    try {
      responseText = await response.text();
    } catch (_e) {
      void _e;
      return { success: false, error: 'Failed to read response' };
    }

    if (!response.ok) {
      // 【阶段 P1-401 - 2026-06-17 续 29-4】401 鉴权失败:广播事件让 AuthErrorListener 跳设置
      if (response.status === 401) {
        window.dispatchEvent(
          new CustomEvent('unraid-auth-error', {
            detail: { reason: 'invalid-api-key', source: endpoint },
          })
        );
      }
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.errors && errorData.errors[0]) {
          errorMsg = errorData.errors[0].message || errorMsg;
        }
      } catch (_e) {
        void _e;
        // JSON 解析失败，使用默认错误
      }
      return { success: false, error: errorMsg };
    }

    // 解析 JSON
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_e) {
      void _e;
      return { success: false, error: 'Invalid JSON response' };
    }

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      // 【续 42.2 2026-06-18】unraid-api 鉴权失败用 HTTP 200 + 业务 errors(违反 GraphQL spec)。
      // 前端在 errors[] 里 catch extensions.code,识别 UNAUTHENTICATED → 广播 unraid-auth-error
      // 事件 + error 加 `[鉴权失败]` 前缀,让 healthCheck 能 sniff 出"鉴权失败"并虚拟 status 401,
      // App.tsx 的 ENDPOINT_META.hint401 才能命中。
      const firstErr = (result.errors[0] ?? {}) as {
        message?: string;
        extensions?: { code?: string; statusCode?: number };
      };
      const ext = firstErr.extensions;
      const code = ext?.code;
      const statusCode = ext?.statusCode;
      let errorMsg = firstErr.message || 'GraphQL Error';
      if (code === 'UNAUTHENTICATED' || statusCode === 401) {
        window.dispatchEvent(
          new CustomEvent('unraid-auth-error', {
            detail: { reason: 'invalid-api-key', source: endpoint, code, statusCode },
          })
        );
        const tag = code ? code : `HTTP ${statusCode}`;
        errorMsg = `[鉴权失败 ${tag}] ${errorMsg}`;
      }
      return { success: false, error: errorMsg };
    }

    // 写 cache（仅成功响应）
    if (namespace && result.data) {
      setCache(getCacheKey(namespace), result.data);
    }

    return { success: true, data: result.data };
  } catch (error) {
    // 【续 42 2026-06-18】DOMException(AbortError) 在 Node 不是 Error 子类,
    // 旧逻辑会丢掉 message 变 'Unknown error',healthCheck 无法识别超时。
    // 显式检查 name 字段 + 安全地取 message
    const anyErr = error as { name?: string; message?: string } | null | undefined;
    const isAbort = !!anyErr && anyErr.name === 'AbortError';
    const rawMessage = anyErr?.message;
    const message = typeof rawMessage === 'string' && rawMessage ? rawMessage : 'Unknown error';
    const finalMessage = isAbort ? `Endpoint timeout (${timeoutMs}ms)` : message;
    console.error('API error:', finalMessage);
    // 【续 50 H14】网络层失败(断网/超时):广播事件让 useApiHealth 重新体检,
    // 健康门据此切到诊断屏(原来只在启动时检查,会话中断网无感知,只剩页面级报错条)
    window.dispatchEvent(
      new CustomEvent('unraid-network-error', { detail: { source: endpoint } })
    );
    return { success: false, error: finalMessage };
  }
}

export function buildGraphqlEndpoint(baseUrl: string, useProxy: boolean): string {
  if (useProxy) {
    return '/graphql';
  }
  return `${baseUrl.replace(/\/?$/, '')}/graphql`;
}
