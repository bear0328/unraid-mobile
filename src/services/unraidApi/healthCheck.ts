// 【续 42 2026-06-18】启动期多端点健康检查
// 【续 42.1 2026-06-18 修 4 根因】/config/ 改 /config/settings.json(具体文件)避免 GET 目录 403
// 200 = 配置存在 / 404 = 目录可访问但没存(首次装) / 200 算 ok,404 算 ok
// - /healthz: nginx 整体活着(不依赖任何 location)
// - /graphql: unraid API 通 + 鉴权对(用 ONLINE_QUERY 轻量 query)
// - /config/settings.json: SPA 配置 alias 正常(200) + 持久化 DAV 端点可访问(200 或 404)
// - /files/: unraid shfs 文件系统挂载正常(autoindex 200)
import { buildGraphqlEndpoint, graphqlRequest } from './graphql';
import { ONLINE_QUERY, AUTH_CHECK_QUERY } from './queries';

export type EndpointName = 'healthz' | 'graphql' | 'config' | 'files';

export interface EndpointResult {
  ok: boolean;
  latencyMs: number;
  /** HTTP status(网络错误时 undefined) */
  status?: number;
  /** 错误原因(超时/鉴权失败/网络/CORS 等) */
  error?: string;
}

export interface HealthReport {
  /** 全部端点 ok */
  ok: boolean;
  endpoints: Record<EndpointName, EndpointResult>;
  startedAt: number;
  durationMs: number;
}

const TIMEOUT_MS = 3000;
const ENDPOINT_TIMEOUT_MSG = `Endpoint timeout (${TIMEOUT_MS}ms)`;

/** 拼路径(useProxy=true 用相对路径,false 拼 baseUrl) */
function pathOf(baseUrl: string, useProxy: boolean, path: string): string {
  if (useProxy) return path;
  return `${baseUrl.replace(/\/?$/, '')}${path}`;
}

/** fetch 端点带超时,转 EndpointResult */
async function pingUrl(url: string, init?: RequestInit): Promise<EndpointResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    return {
      ok: r.ok,
      latencyMs: Date.now() - started,
      status: r.status,
      error: r.ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof DOMException && e.name === 'AbortError';
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: isAbort ? ENDPOINT_TIMEOUT_MSG : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealthz(baseUrl: string, useProxy: boolean): Promise<EndpointResult> {
  return pingUrl(pathOf(baseUrl, useProxy, '/healthz'), { method: 'GET' });
}

async function checkGraphql(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<EndpointResult> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const started = Date.now();

  // 第一步:验 unraid-api 后端活着(ONLINE_QUERY,unraid-api 对 `{online}` 不鉴权,无 apiKey 也返 true)
  // 鉴权失败时 graphqlRequest 派发 unraid-auth-error 事件 → AuthErrorListener 弹 toast + 跳 /settings
  // AppReadyGate 在 /settings 路径放行 children,用户能改 key 改完 recheck
  const onlineResult = await graphqlRequest<{ online: boolean }>(
    endpoint,
    apiKey,
    ONLINE_QUERY,
    undefined,
    {
      timeoutMs: TIMEOUT_MS,
    }
  );
  if (!onlineResult.success) {
    const latencyMs = Date.now() - started;
    const errLower = (onlineResult.error ?? '').toLowerCase();
    const isAbort = errLower.includes('abort');
    return {
      ok: false,
      latencyMs,
      error: isAbort ? ENDPOINT_TIMEOUT_MSG : onlineResult.error || 'Unknown error',
    };
  }
  if (onlineResult.data?.online !== true) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: 'Server returned online: false',
    };
  }

  // 第二步:验鉴权(AUTH_CHECK_QUERY = `{info { os { hostname } } }`)
  // 【续 42.2 2026-06-18】unraid-api 鉴权失败用 HTTP 200 + errors[].extensions.code = 'UNAUTHENTICATED'
  // (违反 GraphQL spec)。graphqlRequest 看到 UNAUTHENTICATED 把 error 加 `[鉴权失败]` 前缀,
  // 这里 sniff 字符串 → 虚拟 status 401(让 App.tsx 的 ENDPOINT_META.hint401 命中),error 去掉前缀。
  const authResult = await graphqlRequest<{ info: { os: { hostname: string } } }>(
    endpoint,
    apiKey,
    AUTH_CHECK_QUERY,
    undefined,
    { timeoutMs: TIMEOUT_MS }
  );
  const authLatencyMs = Date.now() - started;
  if (!authResult.success) {
    const err = authResult.error || '';
    if (err.startsWith('[鉴权失败')) {
      return {
        ok: false,
        latencyMs: authLatencyMs,
        status: 401,
        error: err.replace(/^\[鉴权失败[^\]]*\]\s*/, ''),
      };
    }
    const errLower = err.toLowerCase();
    const isAbort = errLower.includes('abort');
    return {
      ok: false,
      latencyMs: authLatencyMs,
      error: isAbort ? ENDPOINT_TIMEOUT_MSG : err || 'Unknown error',
    };
  }
  if (!authResult.data?.info?.os?.hostname) {
    return {
      ok: false,
      latencyMs: authLatencyMs,
      error: '鉴权查询返空数据',
    };
  }
  return { ok: true, latencyMs: authLatencyMs };
}

async function checkConfig(baseUrl: string, useProxy: boolean): Promise<EndpointResult> {
  // 【续 42.1 2026-06-18】改 ping 具体文件 /config/settings.json(避免 GET 目录 403)
  // 200 = 已存配置,404 = 目录可访问但首次装,200/404 都算 ok 表示"配置存储可访问"
  // 只有 5xx/超时/网络错 才算 fail
  const url = pathOf(baseUrl, useProxy, '/config/settings.json');
  const result = await pingUrl(url, { method: 'GET' });
  if (result.status === 404) {
    return { ...result, ok: true, error: undefined };
  }
  return result;
}

async function checkFiles(baseUrl: string, useProxy: boolean): Promise<EndpointResult> {
  // 【续 45.4 2026-06-28】改成检查 /files/cache/(NVMe cache 池)而不是 /files/(= /mnt/ 根)
  // 原因:/files/ 的 autoindex 会 list /mnt/ 下所有挂载点(含 /mnt/disk1-3 机械盘),
  // shfs stat 每个 share 根目录会唤醒已 sleep 的机械盘。
  // /files/cache/ 走 /mnt/cache/(NVMe SSD),验证"文件系统可访问"但不唤盘。
  // Shares 页面的 /files/cache/ 浏览功能不受影响(用户主动操作时才访问)。
  // 【续 50】/files 加了 auth_basic:401/403 = 端点活着但需 DAV 凭证(凭证是配置问题,不是健康问题)。
  // 【续 50.2】鉴权失败 nginx 改返 403(防浏览器原生弹窗)。
  // 【续 50 C11】404 也算 ok:无 cache 池的机器 /mnt/cache 不存在,不该因此拦死整个 app。
  const result = await pingUrl(pathOf(baseUrl, useProxy, '/files/cache/'), { method: 'GET' });
  if (result.status === 401 || result.status === 403 || result.status === 404) {
    return { ...result, ok: true, error: undefined };
  }
  return result;
}

/**
 * 并发 ping 4 个端点,任一失败整体 unhealthy
 * 在 useApiHealth 配置就绪后自动调,失败可重试
 */
export async function checkHealth(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<HealthReport> {
  const startedAt = Date.now();
  const [healthz, graphql, config, files] = await Promise.all([
    checkHealthz(baseUrl, useProxy),
    checkGraphql(baseUrl, apiKey, useProxy),
    checkConfig(baseUrl, useProxy),
    checkFiles(baseUrl, useProxy),
  ]);
  const endpoints: Record<EndpointName, EndpointResult> = { healthz, graphql, config, files };
  return {
    ok: Object.values(endpoints).every((r) => r.ok),
    endpoints,
    startedAt,
    durationMs: Date.now() - startedAt,
  };
}
