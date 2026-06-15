// 【续 42 2026-06-18】healthCheck 测试
// 覆盖:全部 healthy / graphql 401 / 部分失败 / 超时 / 全失败 / 并发性
// 【续 42.2 2026-06-18】checkGraphql 改两步:ONLINE_QUERY → AUTH_CHECK_QUERY;
// AUTH_CHECK_QUERY 鉴权失败时 unraid-api 返 HTTP 200 + errors[].extensions.code = 'UNAUTHENTICATED'
// (违反 GraphQL spec),graphqlRequest 看到会加 [鉴权失败] 前缀并虚拟 status 401。
// 【续 42.4 2026-06-19】健康检查 graphqlRequest 派发 unraid-auth-error 事件,
// AuthErrorListener 弹 toast + 跳 /settings,AppReadyGate 在 /settings 路径放行 children
// 启动期:user 进站 → useApiHealth recheck → UNAUTHENTICATED → toast + 跳 /settings → 改 key
// 运行期:user 在 /settings 改错 key + 保存 → useApiHealth recheck → UNAUTHENTICATED → toast + 跳 /settings
// 之前 v1 silent 模式(42.4 首版)被去掉,因 silent 阻止了用户操作触发的 toast 提示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkHealth } from './healthCheck';

// 通用 Response mock(status 可配,body 默认空)
function makeResponse(status = 200, body: string | object = ''): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// GraphQL ONLINE_QUERY 成功 response(不鉴权,任何人能查)
function graphqlOnlineOk(online = true): Response {
  return makeResponse(200, { data: { online } });
}

// GraphQL AUTH_CHECK_QUERY 成功 response(需鉴权,返 hostname)
function graphqlInfoOk(hostname = 'Tower'): Response {
  return makeResponse(200, { data: { info: { os: { hostname } } } });
}

// GraphQL UNAUTHENTICATED 错误 response(unraid-api 真实行为:HTTP 200 + 业务 errors)
function graphqlUnauthenticated(msg = 'unauthorized'): Response {
  return makeResponse(200, {
    errors: [
      {
        message: msg,
        extensions: { code: 'UNAUTHENTICATED', statusCode: 401 },
      },
    ],
  });
}

// GraphQL 通用错误 response(非鉴权,比如业务错)
function graphqlGenericErr(msg = 'Forbidden'): Response {
  return makeResponse(200, { errors: [{ message: msg }] });
}

describe('checkHealth', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  // 【续 42.2 2026-06-18】mock 用:解析 RequestInit.body(JSON 字符串),取 query 字段
  // vi.spyOn 给 mock 参数推 unknown,所以这里用 unknown + 收窄
  function queryFromInit(init: unknown): string {
    if (!init || typeof init !== 'object') return '';
    const body = (init as { body?: unknown }).body;
    if (!body) return '';
    try {
      return (JSON.parse(String(body)) as { query?: string }).query || '';
    } catch {
      return '';
    }
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchSpy = vi.spyOn(global as any, 'fetch') as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('4 端点全 healthy → report.ok=true(graphql 走两步:online + info 都 OK)', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        // 【续 42.2 2026-06-18】按 query 区分 ONLINE vs AUTH_CHECK
        if (query.includes('info')) return Promise.resolve(graphqlInfoOk());
        return Promise.resolve(graphqlOnlineOk());
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      // 【续 42.1 2026-06-18】改用具体文件 /config/settings.json
      if (u.endsWith('/config/settings.json'))
        return Promise.resolve(makeResponse(200, '{"serverUrl":"a","apiKey":"b"}'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(true);
    expect(r.endpoints.healthz.ok).toBe(true);
    expect(r.endpoints.graphql.ok).toBe(true);
    expect(r.endpoints.config.ok).toBe(true);
    expect(r.endpoints.files.ok).toBe(true);
    expect(r.endpoints.healthz.error).toBeUndefined();
    // 【续 42.2 2026-06-18】graphql 两步 + 其他 3 端点 = 5 次 fetch(并发起)
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('config 端点首次装 404 → config ok=true(目录可访问,只是没存)', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        return Promise.resolve(query.includes('info') ? graphqlInfoOk() : graphqlOnlineOk());
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/settings.json')) return Promise.resolve(makeResponse(404));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(true);
    expect(r.endpoints.config.ok).toBe(true);
    expect(r.endpoints.config.status).toBe(404);
    expect(r.endpoints.config.error).toBeUndefined();
  });

  it('config 端点 500 → config ok=false(其他 status 仍 fail)', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        return Promise.resolve(query.includes('info') ? graphqlInfoOk() : graphqlOnlineOk());
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/settings.json')) return Promise.resolve(makeResponse(500));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.config.ok).toBe(false);
    expect(r.endpoints.config.status).toBe(500);
  });

  // 【续 42.2 2026-06-18】改 unraid-api 真实行为:HTTP 200 + errors[].extensions.code = UNAUTHENTICATED
  // 前端 graphqlRequest catch UNAUTHENTICATED 加 [鉴权失败] 前缀 + 广播 auth-error;
  // healthCheck 虚拟 status 401 → App.tsx hint401 命中。
  it('/graphql 鉴权失败(UNAUTHENTICATED 扩展码) → graphql ok=false, status=401, 其他 ok=true, 整体 unhealthy', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        // ONLINE_QUERY 不鉴权 → mock 返 online:true(模拟 unraid-api 真实行为)
        if (!query.includes('info')) return Promise.resolve(graphqlOnlineOk());
        // AUTH_CHECK_QUERY 错 key → 返 UNAUTHENTICATED(实际行为)
        return Promise.resolve(graphqlUnauthenticated('unauthorized'));
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/settings.json')) return Promise.resolve(makeResponse(200, '{}'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'wrong-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.healthz.ok).toBe(true);
    expect(r.endpoints.graphql.ok).toBe(false);
    // 【续 42.2 2026-06-18】虚拟 status 401 让 App.tsx hint401 命中
    expect(r.endpoints.graphql.status).toBe(401);
    // error 是裸 message(graphqlRequest 已加 [鉴权失败] 前缀,healthCheck 又剥掉)
    expect(r.endpoints.graphql.error).toContain('unauthorized');
    expect(r.endpoints.config.ok).toBe(true);
    expect(r.endpoints.files.ok).toBe(true);
  });

  // 【续 42.2 2026-06-18】保留旧测试:无 extensions.code 的旧 GraphQL server 也支持
  it('/graphql 旧版错误(无 extensions.code) → graphql ok=false,无 status(走 hint)', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        // ONLINE_QUERY 失败(第一步都过不去,后续不会发)
        return Promise.resolve(graphqlGenericErr('Forbidden'));
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/')) return Promise.resolve(makeResponse(200, '<html>config</html>'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'wrong-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.graphql.ok).toBe(false);
    expect(r.endpoints.graphql.error).toContain('Forbidden');
    // 旧 server 没 extensions.code → 不虚拟 status 401
    expect(r.endpoints.graphql.status).toBeUndefined();
  });

  it('/graphql online=false → graphql ok=false(error 含说明)', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        // ONLINE_QUERY 返 online:false → 第一步就 fail,不查 info
        if (!query.includes('info')) return Promise.resolve(graphqlOnlineOk(false));
        return Promise.resolve(graphqlInfoOk());
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/')) return Promise.resolve(makeResponse(200, '<html>config</html>'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.graphql.ok).toBe(false);
    expect(r.endpoints.graphql.error).toContain('online: false');
  });

  it('/healthz 500 → healthz ok=false(HTTP 500),其他 ok=true,整体 unhealthy', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(500));
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        return Promise.resolve(query.includes('info') ? graphqlInfoOk() : graphqlOnlineOk());
      }
      if (u.endsWith('/config/')) return Promise.resolve(makeResponse(200, '<html>config</html>'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.healthz.ok).toBe(false);
    expect(r.endpoints.healthz.status).toBe(500);
    expect(r.endpoints.healthz.error).toContain('500');
  });

  it('fetch 抛 AbortError → ok=false,error 含 timeout 标识', async () => {
    fetchSpy.mockImplementation(() => {
      const err = new DOMException('The operation was aborted.', 'AbortError');
      return Promise.reject(err);
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(false);
    for (const name of ['healthz', 'graphql', 'config', 'files'] as const) {
      expect(r.endpoints[name].ok).toBe(false);
      expect(r.endpoints[name].error).toContain('timeout');
    }
  });

  it('全部端点 404 → healthz/graphql ok=false,config/files 404 算 ok(目录可访问/无 cache 池)', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(makeResponse(404)));

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.ok).toBe(false);
    expect(r.endpoints.healthz.ok).toBe(false);
    expect(r.endpoints.graphql.ok).toBe(false);
    // 【续 42.1 2026-06-18】config 404 视为 ok 表示目录可访问(无文件)
    expect(r.endpoints.config.ok).toBe(true);
    expect(r.endpoints.config.status).toBe(404);
    // 【续 50 C11】files 404 视为 ok(无 cache 池的机器 /mnt/cache 不存在,不该拦死 app)
    expect(r.endpoints.files.ok).toBe(true);
    expect(r.endpoints.files.status).toBe(404);
  });

  it('files 401(加了 auth_basic 未配 DAV 密码)算 ok(续 50)', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/files/cache/')) return makeResponse(401);
      if (u.endsWith('/healthz')) return makeResponse(200);
      if (u.endsWith('/config/settings.json')) return makeResponse(200, '{}');
      // graphql ONLINE + AUTH_CHECK
      return makeResponse(200, { data: { online: true, info: { os: { hostname: 'x' } } } });
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.endpoints.files.ok).toBe(true);
    expect(r.endpoints.files.status).toBe(401);
  });

  it('files 403(续 50.2 nginx 鉴权失败改返 403 防浏览器弹窗)算 ok', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/files/cache/')) return makeResponse(403);
      if (u.endsWith('/healthz')) return makeResponse(200);
      if (u.endsWith('/config/settings.json')) return makeResponse(200, '{}');
      return makeResponse(200, { data: { online: true, info: { os: { hostname: 'x' } } } });
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'test-key', true);
    expect(r.endpoints.files.ok).toBe(true);
    expect(r.endpoints.files.status).toBe(403);
  });

  it('useProxy=true 走相对路径,useProxy=false 拼 baseUrl', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        return Promise.resolve(query.includes('info') ? graphqlInfoOk() : graphqlOnlineOk());
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/settings.json')) return Promise.resolve(makeResponse(200, '{}'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>files</html>'));
      return Promise.resolve(makeResponse(404));
    });

    await checkHealth('http://192.168.6.140:3998', 'k', true);
    const urls1 = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls1.every((u) => u.startsWith('/'))).toBe(true);

    fetchSpy.mockClear();
    await checkHealth('http://192.168.6.140:3998/', 'k', false);
    const urls2 = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls2.every((u) => u.startsWith('http://192.168.6.140:3998/'))).toBe(true);
  });

  it('并发:graphql 两步 + 3 端点同时发起,总耗时 ≈ 最慢端点(< 5× 单端点耗时)', async () => {
    const delay = 100;
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      return new Promise((resolve) => {
        setTimeout(() => {
          if (u.includes('/graphql')) {
            const query = queryFromInit(init);
            resolve(query.includes('info') ? graphqlInfoOk() : graphqlOnlineOk());
          } else if (u.endsWith('/healthz')) resolve(makeResponse(200, 'ok\n'));
          else if (u.endsWith('/config/settings.json')) resolve(makeResponse(200, '{}'));
          else if (u.endsWith('/files/cache/')) resolve(makeResponse(200, '<html>f</html>'));
          else resolve(makeResponse(404));
        }, delay);
      });
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'k', true);
    // 5 个并发 fetch 各 ~100ms → 总 ~100-200ms。容许 450ms 阈值
    expect(r.durationMs).toBeLessThan(450);
  });

  // 【续 42.4 2026-06-19】健康检查 graphqlRequest 派发 unraid-auth-error 事件
  // 让 AuthErrorListener 弹 toast + 跳 /settings,AppReadyGate 在 /settings 路径放行 children
  it('鉴权失败时派发 unraid-auth-error 事件(让 AuthErrorListener 弹 toast + 跳 /settings)', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/graphql')) {
        const query = queryFromInit(init);
        if (!query.includes('info')) return Promise.resolve(graphqlOnlineOk());
        return Promise.resolve(graphqlUnauthenticated('API key validation failed'));
      }
      if (u.endsWith('/healthz')) return Promise.resolve(makeResponse(200, 'ok\n'));
      if (u.endsWith('/config/settings.json')) return Promise.resolve(makeResponse(200, '{}'));
      if (u.endsWith('/files/cache/')) return Promise.resolve(makeResponse(200, '<html>f</html>'));
      return Promise.resolve(makeResponse(404));
    });

    const r = await checkHealth('http://192.168.6.140:3998', 'wrong-key', true);
    expect(r.endpoints.graphql.ok).toBe(false);
    // ONLINE_QUERY 不鉴权(2xx)不派发;AUTH_CHECK_QUERY 鉴权失败应派发 unraid-auth-error
    const authErrorEvents = dispatchSpy.mock.calls.filter(
      (c) => c[0] instanceof CustomEvent && c[0].type === 'unraid-auth-error'
    );
    expect(authErrorEvents).toHaveLength(1);
    expect((authErrorEvents[0][0] as CustomEvent).detail).toMatchObject({
      reason: 'invalid-api-key',
    });
    dispatchSpy.mockRestore();
  });
});
