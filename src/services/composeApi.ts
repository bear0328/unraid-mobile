// 【续 47 2026-07-19】Compose 栈管理 API 客户端
// 后端: 宿主 /mnt/user/appdata/unraid-mobile-dev/compose-api/api.php
// 通道: 本容器 nginx /compose-api/ → 宿主 php-fpm socket(绕开 webGui 会话认证)
// 鉴权: X-Api-Key header,与 GraphQL 同一个 apiKey(续 49 起后端比对宿主 key 文件,不再读 settings.json)
import { getApiConfig } from './unraidApi/config';

export interface ComposeLastResult {
  result: string; // "success" | "error"
  exit_code: number;
  operation: string;
  timestamp: string;
}

export interface ComposeStack {
  name: string; // 项目目录名(如 CookieCloud)
  project: string; // docker compose 归一化项目名(如 cookiecloud)
  status: string | null; // "running(1)" / "exited(0)" / null(未创建)
  running: boolean;
  autostart: boolean;
  lastResult: ComposeLastResult | null;
  composeFile: string | null;
}

export interface ComposeStackDetail {
  stack: ComposeStack;
  composeYaml: string;
  overrideYaml: string | null;
  lastCmdLog: string;
  opRunning: boolean;
}

export type ComposeSyncOp = 'up' | 'down' | 'restart';
export type ComposeAsyncOp = 'pull' | 'rebuild';
export type ComposeOp = ComposeSyncOp | ComposeAsyncOp;

export interface ComposeOpResult {
  /** 同步操作时有值 */
  exitCode?: number;
  output?: string;
  /** 异步操作为 true,前端轮询 getStackLog 看进度 */
  async?: boolean;
}

export interface ComposeLogResult {
  log: string;
  running: boolean;
}

export class ComposeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ComposeApiError';
    this.status = status;
  }
}

/** 【续 50 C-补充】读请求(列表/详情/日志)超时:后端 hang 时不再永远转圈 */
const READ_TIMEOUT_MS = 15_000;
/** 【续 50 C-补充】stackAction 同步执行 docker compose(up/down/restart),慢,放宽到 60s */
const ACTION_TIMEOUT_MS = 60_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
  const config = getApiConfig();
  if (!config) {
    throw new ComposeApiError(0, '未配置 API,请到设置页配置');
  }
  const headers: Record<string, string> = {
    'X-Api-Key': config.apiKey,
    ...(init?.headers as Record<string, string> | undefined),
  };
  let res: Response;
  try {
    res = await fetch(`/compose-api/${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // 【续 50 C-补充】超时单独报错,与"网络不可达"区分(无调用方传 signal,abort 只能是超时)
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ComposeApiError(0, `请求超时(${Math.round(timeoutMs / 1000)}s): compose-api 无响应`);
    }
    throw new ComposeApiError(0, '网络错误: compose-api 不可达');
  }
  let body: { ok?: boolean; data?: T; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    // 非 JSON 响应(nginx 错误页等)
  }
  // 【续 50 C-补充】HTTP 200 + body {ok:false} 也走这里:message 一律取后端 error 字段
  if (!res.ok || !body?.ok) {
    throw new ComposeApiError(res.status, body?.error || `HTTP ${res.status}`);
  }
  return body.data as T;
}

export function getStacks(): Promise<ComposeStack[]> {
  return request<ComposeStack[]>('?action=list');
}

/** 【续 51 2026-07-19】CPU 温度(后端直读 /sys/class/hwmon,不唤盘);celsius 为 null 表示无 CPU 传感器 */
export interface CpuTempResult {
  celsius: number | null;
  sensor: string | null;
}

export function getCpuTemp(): Promise<CpuTempResult> {
  return request<CpuTempResult>('?action=cputemp');
}

export function getStack(name: string): Promise<ComposeStackDetail> {
  return request<ComposeStackDetail>(`?action=get&name=${encodeURIComponent(name)}`);
}

export function getStackLog(name: string): Promise<ComposeLogResult> {
  return request<ComposeLogResult>(`?action=log&name=${encodeURIComponent(name)}`);
}

// 注意: 写操作一律 PUT 不用 POST — 宿主 php.ini auto_prepend_file(local_prepend.php)
// 对 POST 强制 webGui CSRF 校验(无 token 静默 exit 空 200),PUT 不受检查(续 47 排障)
export function stackAction(name: string, op: ComposeOp): Promise<ComposeOpResult> {
  return request<ComposeOpResult>(
    '',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: op, name }),
    },
    ACTION_TIMEOUT_MS
  );
}

export function setAutostart(name: string, value: boolean): Promise<{ autostart: boolean }> {
  return request<{ autostart: boolean }>('', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'autostart', name, value: value ? 'true' : 'false' }),
  });
}

export function saveComposeYaml(
  name: string,
  yaml: string
): Promise<{ saved: boolean; file: string }> {
  return request<{ saved: boolean; file: string }>(`?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-yaml' },
    body: yaml,
  });
}
