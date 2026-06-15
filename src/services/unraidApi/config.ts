// 【D1 2026-06-14 王洪涛拍板】拆分 config 存储：
// serverUrl 存 localStorage（不敏感，永久保留）
// 【续 49 2026-07-19 王洪涛拍板,推翻 D1 的 sessionStorage 决策】
// apiKey 改存 localStorage(杀进程不丢,冷启动不再依赖服务器 settings.json;
// settings.json 从此不落 apiKey — 其 GET 无鉴权,明文落盘是发布 blocker。
// sessionStorage 的 XSS 防护本就弱:同源 JS 两个 storage 都能读,差别只是时间窗口)
// 【阶段 P2-多服务器 - 2026-06-17 续 33-10】多服务器支持
// 1. LS 'unraid-mobile-servers' 存 Server[] = {id, name, serverUrl, color}
// 2. LS 'unraid-mobile-active-server' 存 activeId
// 3. localStorage 'unraid-mobile-api-key-{id}' 存每台机器的 apiKey
// 4. getApiConfig() 保持原签名,从当前 active 拼出 ApiConfig
// 5. saveApiConfig(c) 兼容旧调用(存到 active server,无 active 则创建默认)
// 【续 42.5.3 2026-06-19 21:30】改用朴素订阅列表代替 window.addEventListener
//   原因:某些 headless 沙箱(Browserbase)patch 了 addEventListener
import { ApiConfig } from '../types';
import { clearAllGraphqlCache } from './cache';

const SERVER_URL_KEY = 'unraid-mobile-server-url'; // 旧格式,继续兼容读取
const API_KEY_KEY = 'unraid-mobile-api-key'; // 旧格式,继续兼容读取
const SERVERS_KEY = 'unraid-mobile-servers';
const ACTIVE_KEY = 'unraid-mobile-active-server';

// 【续 50 B3】服务器维度 cache 的 key(dashboardCache.ts / useApiHealth.ts 里的单 key;
// graphql cache 走 clearAllGraphqlCache)。切服务器/改地址时必须清,否则串旧服务器数据最长 30min。
const DASHBOARD_CACHE_KEY = 'unraid-mobile-dashboard-cache';
const HEALTH_CACHE_KEY = 'unraid-mobile-health-cache';

/** 清所有服务器维度的 cache(切服务器、active 服务器地址变更时调用) */
function clearServerScopedCaches(): void {
  clearAllGraphqlCache();
  try {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    localStorage.removeItem(HEALTH_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface Server {
  id: string;
  name: string;
  serverUrl: string;
  /** 顶栏小色块 #3b82f6 */
  color?: string;
}

// 【续 42.5.3】朴素订阅列表,代替 window.addEventListener
type ChangeListener = () => void;
const apiConfigListeners: Set<ChangeListener> = new Set();
const serversListeners: Set<ChangeListener> = new Set();

function emitApiConfigChange(): void {
  for (const fn of apiConfigListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function emitServersChange(): void {
  for (const fn of serversListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

let counter = 0;
function nextId() {
  return `srv-${Date.now()}-${++counter}`;
}

// ========== 多服务器管理 ==========

export function getServers(): Server[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // 【续 50 A4 迁移】历史版本 apiKey 曾铺进 server 对象落 LS(备份导出会泄),
    // 读到即剥离并写回;apiKey 只应存在于 unraid-mobile-api-key-{id}
    let dirty = false;
    const cleaned = arr.map((s) => {
      if (s && typeof s === 'object' && 'apiKey' in s) {
        dirty = true;
        const copy = { ...s } as Record<string, unknown>;
        delete copy.apiKey;
        return copy as unknown as Server;
      }
      return s as Server;
    });
    if (dirty) writeServers(cleaned);
    return cleaned;
  } catch {
    return [];
  }
}

function writeServers(servers: Server[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
  } catch {
    /* ignore */
  }
}

export function getActiveServerId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function setActiveServerId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveServer(): Server | null {
  const servers = getServers();
  if (servers.length === 0) return null;
  const activeId = getActiveServerId();
  return servers.find((s) => s.id === activeId) || servers[0];
}

export function addServer(input: Omit<Server, 'id'> & { apiKey?: string }): Server {
  const servers = getServers();
  // 【续 50 A4】apiKey 不铺进 server 对象(servers 列表会被备份导出,UI 承诺不含密钥)
  const { apiKey, ...fields } = input;
  const srv: Server = { ...fields, id: nextId() };
  if (apiKey && typeof localStorage !== 'undefined') {
    localStorage.setItem(`${API_KEY_KEY}-${srv.id}`, apiKey);
  }
  const next = [...servers, srv];
  writeServers(next);
  // 第一台自动激活
  if (servers.length === 0) {
    setActiveServerId(srv.id);
    // 同步旧格式 LS,保证 getApiConfig() 兼容
    localStorage.setItem(SERVER_URL_KEY, srv.serverUrl);
    if (apiKey) localStorage.setItem(API_KEY_KEY, apiKey);
  }
  emitServersChange();
  return srv;
}

export function updateServer(
  id: string,
  patch: Partial<Omit<Server, 'id'>> & { apiKey?: string }
): void {
  const servers = getServers();
  const prev = servers.find((s) => s.id === id);
  // 【续 50 A4】同 addServer:apiKey 不铺进 server 对象
  const { apiKey, ...fields } = patch;
  const next = servers.map((s) => (s.id === id ? { ...s, ...fields } : s));
  writeServers(next);
  if (apiKey && typeof localStorage !== 'undefined') {
    localStorage.setItem(`${API_KEY_KEY}-${id}`, apiKey);
    // 【续 50 B4】改的是 active 服务器的 key → 同步 legacy key;
    // 原实现只写 per-server key,getApiConfig() 仍读旧 legacy key → 全 app 401
    if (id === getActiveServerId()) {
      localStorage.setItem(API_KEY_KEY, apiKey);
    }
  }
  // 同步 active server 的旧格式 LS
  if (id === getActiveServerId() && patch.serverUrl) {
    localStorage.setItem(SERVER_URL_KEY, patch.serverUrl);
    // 【续 50 B3】active 服务器地址变更 → 清服务器维度 cache,防串旧服务器数据
    if (prev && prev.serverUrl !== patch.serverUrl) {
      clearServerScopedCaches();
    }
  }
  emitServersChange();
  emitApiConfigChange();
}

export function removeServer(id: string): void {
  const servers = getServers();
  const next = servers.filter((s) => s.id !== id);
  writeServers(next);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${API_KEY_KEY}-${id}`);
  }
  // 如果删的是 active,切到第一台
  if (getActiveServerId() === id) {
    const newActive = next[0] || null;
    setActiveServerId(newActive?.id ?? null);
    if (newActive) {
      localStorage.setItem(SERVER_URL_KEY, newActive.serverUrl);
      const k = localStorage.getItem(`${API_KEY_KEY}-${newActive.id}`);
      if (k) localStorage.setItem(API_KEY_KEY, k);
      else localStorage.removeItem(API_KEY_KEY);
    } else {
      localStorage.removeItem(SERVER_URL_KEY);
      localStorage.removeItem(API_KEY_KEY);
    }
    // 【续 50 B3】active 变了 → 清服务器维度 cache
    clearServerScopedCaches();
    emitApiConfigChange();
  }
  emitServersChange();
}

export function setActiveServer(id: string): void {
  const servers = getServers();
  const target = servers.find((s) => s.id === id);
  if (!target) return;
  // 【续 50 B3】确实切换到另一台才清 cache(重复点同一台不清,避免无谓冷启动)
  const switching = getActiveServerId() !== id;
  setActiveServerId(id);
  // 同步旧格式 LS,getApiConfig() 能直接读到
  localStorage.setItem(SERVER_URL_KEY, target.serverUrl);
  if (typeof localStorage !== 'undefined') {
    const k = localStorage.getItem(`${API_KEY_KEY}-${id}`);
    if (k) localStorage.setItem(API_KEY_KEY, k);
    else localStorage.removeItem(API_KEY_KEY);
  }
  if (switching) {
    clearServerScopedCaches();
  }
  emitApiConfigChange();
  emitServersChange();
}

export function subscribeServersChange(callback: () => void): () => void {
  serversListeners.add(callback);
  return () => {
    serversListeners.delete(callback);
  };
}

// ========== 旧 API 兼容(单服务器时走旧 key,多服务器时走 active) ==========

export const saveApiConfig = (config: ApiConfig): void => {
  const prevUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(SERVER_URL_KEY) : null;
  if (config.serverUrl) {
    // 看是否已有 active server,有就更新 serverUrl,没有就创建
    const activeId = getActiveServerId();
    if (activeId) {
      const servers = getServers();
      const active = servers.find((s) => s.id === activeId);
      if (active) {
        updateServer(activeId, { serverUrl: config.serverUrl });
      } else {
        localStorage.setItem(SERVER_URL_KEY, config.serverUrl);
      }
    } else {
      // 旧格式:无 servers 列表,直接写旧 key
      localStorage.setItem(SERVER_URL_KEY, config.serverUrl);
    }
  }
  if (config.apiKey) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(API_KEY_KEY, config.apiKey);
      const activeId = getActiveServerId();
      if (activeId) {
        localStorage.setItem(`${API_KEY_KEY}-${activeId}`, config.apiKey);
      }
    }
  }
  // 【续 50 B3】serverUrl 实际变更 → 清服务器维度 cache(防新地址显示旧服务器数据)
  if (config.serverUrl && prevUrl && prevUrl !== config.serverUrl) {
    clearServerScopedCaches();
  }
  emitApiConfigChange();
};

export const getApiConfig = (): ApiConfig | null => {
  const serverUrl = localStorage.getItem(SERVER_URL_KEY);
  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!serverUrl || !apiKey) return null;
  return { serverUrl, apiKey };
};

export const subscribeApiConfigChange = (callback: () => void): (() => void) => {
  apiConfigListeners.add(callback);
  return () => {
    apiConfigListeners.delete(callback);
  };
};

export async function loadConfigFromFile(): Promise<ApiConfig | null> {
  try {
    const res = await fetch('/config/settings.json');
    if (!res.ok) return null;
    const data = await res.json();
    // 【续 49】settings.json 不再存 apiKey(GET 无鉴权,明文落盘是发布 blocker)。
    // 只有 serverUrl 也返回(apiKey 给空串):调用方据此预填设置页,
    // App 冷启动判 needsSetup 时再区分有没有 apiKey
    if (data && data.serverUrl) {
      return { serverUrl: data.serverUrl, apiKey: data.apiKey || '' };
    }
  } catch {
    // ignore
  }
  return null;
}

export const clearApiConfig = (): void => {
  localStorage.removeItem(SERVER_URL_KEY);
  localStorage.removeItem(API_KEY_KEY);
  emitApiConfigChange();
};
