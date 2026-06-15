// 【阶段 1 P0 - 2026-06-15】Shares WebDAV 鉴权工具
// 从 Shares.tsx 拆出：getDavAuthHeader + davFetch + FileItem 类型
// 【D4 2026-06-14】WebDAV 鉴权:localStorage 存密码,fetch /dav/ 自动带 Authorization
// (续 49 起从 sessionStorage 改 localStorage — 推翻 D4,与 apiKey 同策略:冷启动不丢)
// 【阶段 P2-审计 - 2026-06-17 续 31-3】危险方法(DELETE/MOVE/COPY/PUT/MKCOL)自动写审计
// 【续 42.5 2026-06-19】修 #12:加 15s AbortController 超时 — 之前 nginx hang 时 fetch 永不返回
// 【续 42.5.3 2026-06-19 21:30】用 AbortSignal.timeout() 代替 setTimeout-based abort
//   原因:某些 headless 沙箱(Browserbase)throttle setTimeout,导致 15s 实际到 32s 才触发
//   AbortSignal.timeout() 走浏览器原生计时器,不受 setTimeout 限制
import { recordAudit, type AuditAction } from '../../utils/audit';

const DAV_USER = 'davuser';
const DAV_PASSWORD_KEY = 'unraid-mobile-dav-password';
/** 【续 42.5】DAV 请求默认 15s 超时(nginx hang / 网络断) */
const DAV_TIMEOUT_MS = 15000;

export interface FileItem {
  name: string;
  path: string;
  /** 字节数(由 parseAutoindexHtml 解析 nginx autoindex 得到) */
  size?: number;
  date: string;
  mtime: number;
  permissions: string;
  isDir: boolean;
}

// 工具：从 localStorage 读 WebDAV 密码，返 Basic header
export function getDavAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const password = localStorage.getItem(DAV_PASSWORD_KEY);
  if (!password) return {};
  // btoa 编码 base64，Basic auth 需要
  return { Authorization: 'Basic ' + btoa(`${DAV_USER}:${password}`) };
}

// 方法名 → AuditAction 映射(GET/POST/HEAD 不审计,只审计危险写操作)
const METHOD_MAP: Partial<Record<string, AuditAction>> = {
  DELETE: 'DELETE',
  MOVE: 'MOVE',
  COPY: 'COPY',
  PUT: 'PUT',
  MKCOL: 'MKCOL',
};

// 包装 fetch：自动加 Basic auth header + 401 检错友好提示 + 危险方法审计
export async function davFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const auditAction = METHOD_MAP[method];

  // 【续 42.5.3】用 AbortSignal.timeout() — 原生计时器,不受 setTimeout throttle 影响
  // 浏览器支持:Chrome 103+ / Firefox 100+ / Safari 15.4+
  const timeoutSignal = AbortSignal.timeout(DAV_TIMEOUT_MS);
  const signal = options.signal ? composeSignals(options.signal, timeoutSignal) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal,
      headers: {
        ...getDavAuthHeader(),
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    const anyErr = err as { name?: string; message?: string } | null | undefined;
    if (anyErr?.name === 'TimeoutError' || anyErr?.name === 'AbortError') {
      throw new Error(`WebDAV 请求超时 (${DAV_TIMEOUT_MS / 1000}s)。请检查 nginx / 网络是否可达。`);
    }
    throw err;
  }

  // 【续 50.2】nginx 侧鉴权失败改返 403(防浏览器原生弹窗),401/403 同判
  if (response.status === 401 || response.status === 403) {
    if (auditAction) {
      recordAudit(auditAction, stripOrigin(url), 'failed', { error: `${response.status} Unauthorized` });
    }
    throw new Error(
      `WebDAV 鉴权失败 (${response.status})。请在「设置」页面配置 WebDAV 密码（与 nginx .davpasswd 一致）。`
    );
  }
  // 危险操作审计
  if (auditAction) {
    const ok = response.ok || response.status === 201 || response.status === 204;
    if (ok) {
      recordAudit(auditAction, stripOrigin(url), 'success');
    } else {
      // 异步读 body 拿错误信息(不阻塞主流程)
      response
        .clone()
        .text()
        .then((text) => {
          recordAudit(auditAction, stripOrigin(url), 'failed', {
            error: `HTTP ${response.status}${text ? `: ${text.slice(0, 100)}` : ''}`,
          });
        })
        .catch(() => {
          recordAudit(auditAction, stripOrigin(url), 'failed', {
            error: `HTTP ${response.status}`,
          });
        });
    }
  }
  return response;
}

// 【续 42.5.3】合并多个 AbortSignal — 任意一个 abort 整个 signal 就 abort
function composeSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
