// 【阶段 P2-备份 - 2026-06-17 续 34-1】全量配置备份/导入
// 打包(不包含敏感:apiKey / dav password / log password / webhook token):
//   1. favorites 收藏
//   2. theme 主题(light/dark/hc-light/hc-dark)
//   3. primaryColor 主题色
//   4. dashboardOrder Dashboard 卡片顺序
//   5. alertKeywords 日志告警关键字列表
//   6. webhookSettings Webhook 通知设置(不含 token 类密钥字段)
//   7. servers 服务器列表(只存 name/serverUrl/color,不含 apiKey)
// JSON 格式,带 version 字段(后续兼容用)
import { getFavorites } from '../hooks/useFavoritesShim';
import type { Theme } from '../context/ThemeContext';

// 实际实现里直接读 LS,避免循环 import
function readLs(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export interface BackupData {
  version: number;
  exportedAt: string;
  /** 不含敏感数据 */
  favorites: unknown[];
  theme: Theme | null;
  primaryColor: string | null;
  dashboardOrder: string[] | null;
  alertKeywords: string[] | null;
  webhookSettings: unknown | null;
  servers: { id: string; name: string; serverUrl: string; color?: string }[] | null;
}

const BACKUP_VERSION = 1;

const KEY_FAVORITES = 'unraid-mobile-favorites';
const KEY_THEME = 'theme';
const KEY_PRIMARY = 'unraid-mobile-primary-color';
const KEY_DASHBOARD_ORDER = 'unraid-mobile-dashboard-order';
const KEY_ALERT_KEYWORDS = 'unraid-mobile-alert-keywords';
// 【续 50 D6a】与 webhook.ts 的 STORAGE_KEY 对齐 — 之前错写成 -settings 后缀,
// webhook.ts 实际写 'unraid-mobile-webhook',导致导出恒 null、导入也无人读
const KEY_WEBHOOK = 'unraid-mobile-webhook';
const SERVERS_KEY = 'unraid-mobile-servers';

export function exportBackup(): string {
  const data: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    favorites: getFavorites(),
    theme: readLs(KEY_THEME) as Theme | null,
    primaryColor: readLs(KEY_PRIMARY),
    dashboardOrder: safeParseArray(readLs(KEY_DASHBOARD_ORDER)),
    alertKeywords: safeParseArray(readLs(KEY_ALERT_KEYWORDS)),
    webhookSettings: sanitizeWebhook(safeParse(readLs(KEY_WEBHOOK))),
    servers: sanitizeServers(safeParse(readLs(SERVERS_KEY))),
  };
  return JSON.stringify(data, null, 2);
}

// 【续 50 A4】兜底:无论 LS 里 servers 是否混入了 apiKey(历史版本曾铺进 server 对象),
// 导出一律剥掉 — UI 承诺「不含 API 密钥、密码等敏感数据」
function sanitizeServers(raw: unknown): BackupData['servers'] {
  if (!Array.isArray(raw)) return null;
  return raw.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const copy = { ...(s as Record<string, unknown>) };
    delete copy.apiKey;
    return copy as unknown as NonNullable<BackupData['servers']>[number];
  });
}

// 【续 50 D6a】webhook 配置里的密钥类字段(Telegram bot token / Resend API key 都存 token 字段)
// 按 token/apiKey/secret 命名匹配,备份文件可能被丢网盘 → 导出一律剔除
const SENSITIVE_KEY_RE = /token|apikey|secret/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// 【续 50 D6a】导出:剥掉 webhook 配置里的密钥类字段,provider/url/enabled 等非敏感项照常导出
function sanitizeWebhook(raw: unknown): unknown | null {
  if (!isPlainObject(raw)) return raw ?? null;
  const copy = { ...raw };
  for (const k of Object.keys(copy)) {
    if (SENSITIVE_KEY_RE.test(k)) delete copy[k];
  }
  return copy;
}

// 【续 50 D6a】导入:备份里缺(或空)的密钥类字段保留本地已有值 — 导出侧已剔除 token,
// 直接覆盖会把本机配好的 bot token 抹掉
function mergeWebhookSensitive(incoming: unknown): unknown {
  if (!isPlainObject(incoming)) return incoming;
  const local = safeParse<Record<string, unknown>>(readLs(KEY_WEBHOOK));
  const merged = { ...incoming };
  if (local) {
    for (const k of Object.keys(local)) {
      if (SENSITIVE_KEY_RE.test(k) && (merged[k] === undefined || merged[k] === '')) {
        merged[k] = local[k];
      }
    }
  }
  return merged;
}

export interface ImportResult {
  favorites: number;
  servers: number;
  theme: boolean;
  primaryColor: boolean;
  dashboardOrder: number;
  alertKeywords: number;
  webhookSettings: boolean;
}

export function importBackup(jsonStr: string, options?: { overwrite?: boolean }): ImportResult {
  const overwrite = options?.overwrite ?? false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON 解析失败: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('文件格式错误: 顶层不是对象');
  }
  const obj = parsed as Partial<BackupData>;
  if (obj.version !== BACKUP_VERSION) {
    console.warn(`[backup] 版本不匹配: ${obj.version} (期望 ${BACKUP_VERSION})`);
  }
  const result: ImportResult = {
    favorites: 0,
    servers: 0,
    theme: false,
    primaryColor: false,
    dashboardOrder: 0,
    alertKeywords: 0,
    webhookSettings: false,
  };

  // favorites 合并(同 kind+value 去重)
  if (Array.isArray(obj.favorites)) {
    const existing = getFavorites() as { kind: string; value: string }[];
    const seen = new Set(existing.map((f) => `${f.kind}:${f.value}`));
    const merged = [...existing];
    for (const f of obj.favorites) {
      if (typeof f !== 'object' || f === null) continue;
      const fav = f as { kind?: string; value?: string };
      if (!fav.kind || !fav.value) continue;
      const key = `${fav.kind}:${fav.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.unshift(f as never);
      result.favorites++;
    }
    writeLs(KEY_FAVORITES, JSON.stringify(merged.slice(0, 50)));
  }

  // 主题(直接覆盖)
  if (overwrite && obj.theme) {
    writeLs(KEY_THEME, obj.theme);
    result.theme = true;
  }
  if (overwrite && obj.primaryColor) {
    writeLs(KEY_PRIMARY, obj.primaryColor);
    result.primaryColor = true;
  }

  // servers 合并(同 url 去重)
  if (Array.isArray(obj.servers)) {
    const existing: { serverUrl: string; name: string }[] =
      safeParse<{ serverUrl: string; name: string }[]>(readLs(SERVERS_KEY)) || [];
    const seenUrls = new Set(existing.map((s) => s.serverUrl));
    const merged = [...existing];
    for (const s of obj.servers) {
      if (typeof s !== 'object' || s === null) continue;
      const srv = s as { serverUrl?: string; name?: string };
      if (!srv.serverUrl || !srv.name) continue;
      if (seenUrls.has(srv.serverUrl)) continue;
      seenUrls.add(srv.serverUrl);
      merged.push(s as never);
      result.servers++;
    }
    writeLs(SERVERS_KEY, JSON.stringify(merged));
  }

  // dashboard order(覆盖)
  if (overwrite && Array.isArray(obj.dashboardOrder)) {
    writeLs(KEY_DASHBOARD_ORDER, JSON.stringify(obj.dashboardOrder));
    result.dashboardOrder = obj.dashboardOrder.length;
  }

  // alert keywords(覆盖)
  if (overwrite && Array.isArray(obj.alertKeywords)) {
    writeLs(KEY_ALERT_KEYWORDS, JSON.stringify(obj.alertKeywords));
    result.alertKeywords = obj.alertKeywords.length;
  }

  // webhook settings(覆盖;【续 50 D6a】缺密钥字段时保留本地已有的,避免抹掉本机 token)
  if (overwrite && obj.webhookSettings) {
    writeLs(KEY_WEBHOOK, JSON.stringify(mergeWebhookSensitive(obj.webhookSettings)));
    result.webhookSettings = true;
  }

  return result;
}

// ===== 工具 =====
function safeParse<T>(str: string | null): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function safeParseArray(str: string | null): string[] | null {
  const r = safeParse<string[]>(str);
  return Array.isArray(r) ? r : null;
}
