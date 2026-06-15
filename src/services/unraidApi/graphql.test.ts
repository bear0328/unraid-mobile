// 【阶段 P2-1 - 2026-06-16 续 13】graphql 公共方法测试
// 覆盖:cache 命中/未命中 / HTTP 错误 / GraphQL errors / JSON 解析失败 / 超时 / buildGraphqlEndpoint
// 用 vi.spyOn(global, 'fetch') 拦截,不引 MSW
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { graphqlRequest, buildGraphqlEndpoint, API_TIMEOUT } from './graphql';
import { clearAllGraphqlCache } from './cache';

// 构造 fetch Response mock(返回 ok + json)
function makeResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildGraphqlEndpoint', () => {
  it('useProxy=true → 永远返 /graphql(走 nginx 同源代理,避开 CORS)', () => {
    expect(buildGraphqlEndpoint('https://nas.local:443', true)).toBe('/graphql');
    expect(buildGraphqlEndpoint('http://192.168.6.140:3998', true)).toBe('/graphql');
  });

  it('useProxy=false → 拼接 baseUrl/graphql,容忍尾斜杠', () => {
    expect(buildGraphqlEndpoint('https://nas.local', false)).toBe('https://nas.local/graphql');
    expect(buildGraphqlEndpoint('https://nas.local/', false)).toBe('https://nas.local/graphql');
  });
});

describe('graphqlRequest', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearAllGraphqlCache();
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('成功响应:返 { success: true, data }', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ data: { hello: 'world' } }));
    const result = await graphqlRequest<{ hello: string }>('/graphql', 'k', 'query { hello }');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ hello: 'world' });
  });

  it('请求体格式:POST + Content-Type: application/json + x-api-key', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ data: {} }));
    await graphqlRequest('/graphql', 'my-key', 'query { a }', { x: 1 });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': 'my-key',
        }),
        body: JSON.stringify({ query: 'query { a }', variables: { x: 1 } }),
      })
    );
  });

  it('无 apiKey 时不加 x-api-key header', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ data: {} }));
    await graphqlRequest('/graphql', '', 'query { a }');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('HTTP 4xx/5xx:尝试解析 errors 字段,失败则用 HTTP 状态', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ errors: [{ message: '鉴权失败' }] }, 401));
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('鉴权失败');
  });

  it('HTTP 错误但 body 不是 JSON:用 HTTP 状态', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('not json', { status: 500, statusText: 'Server Error' })
    );
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');
  });

  it('GraphQL errors 字段(data 是 null):返 { success: false, error }', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ errors: [{ message: '字段不合法' }], data: null })
    );
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('字段不合法');
  });

  it('GraphQL errors 数组为空:用默认 "GraphQL Error"', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ errors: [{}], data: null }));
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.error).toBe('GraphQL Error');
  });

  it('响应体不是 JSON:返 Invalid JSON response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid JSON response');
  });

  it('fetch 抛错(网络/超时):catch 返 { success: false, error }', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('NetworkError'));
    const result = await graphqlRequest('/graphql', 'k', 'query');
    expect(result.success).toBe(false);
    expect(result.error).toBe('NetworkError');
  });

  it('成功响应时写入 cache(namespace 传了)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ data: { v: 1 } }));
    await graphqlRequest('/graphql', 'k', 'q', undefined, { namespace: 'test-ns' });
    // 二次调用应从 cache 取,不再调 fetch
    const second = await graphqlRequest('/graphql', 'k', 'q', undefined, { namespace: 'test-ns' });
    expect(second.data).toEqual({ v: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('namespace 不传:不写 cache,二次调用也走 fetch', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(makeResponse({ data: { v: 1 } })));
    await graphqlRequest('/graphql', 'k', 'q');
    await graphqlRequest('/graphql', 'k', 'q');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('失败响应不写 cache(下次重试仍走 fetch)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse({ errors: [{ message: 'x' }] }));
    await graphqlRequest('/graphql', 'k', 'q', undefined, { namespace: 'test-ns' });
    // 第二次:cache 没东西,应再调 fetch
    fetchSpy.mockResolvedValueOnce(makeResponse({ data: { ok: true } }));
    const result = await graphqlRequest('/graphql', 'k', 'q', undefined, { namespace: 'test-ns' });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('API_TIMEOUT 默认 10000ms', () => {
    expect(API_TIMEOUT).toBe(10000);
  });
});
