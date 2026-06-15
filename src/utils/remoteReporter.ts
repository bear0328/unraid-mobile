// 【阶段 P2-性能 - 2026-06-17 续 37-1】远程上报
// 复用 webhook 通道,LS 配置 + 阈值 + 冷却
// 监测项:LCP/CLS/INP 越界 + 错误密度 spike
// 触发时 sendWebhook(WebhookConfig=global),同一类告警 cooldownMs 内不重发
import { getWebhookConfig, sendWebhook, type WebhookPayload } from './webhook';
import { getErrors } from './errorReporter';
import { getVitalsHistory, type VitalsSnapshot } from './webVitals';
import { pushNotification } from './notifications';

export interface RemoteReporterConfig {
  enabled: boolean;
  /** LCP 阈值(ms),>此值视为"差" */
  lcpMs: number;
  /** CLS 阈值,>此值视为"差" */
  clsThreshold: number;
  /** INP 阈值(ms),>此值视为"差" */
  inpMs: number;
  /** 错误密度:windowMs 毫秒内出现 >= errorCount 个 error 触发 */
  errorCount: number;
  errorWindowMs: number;
  /** 同一类告警冷却(毫秒),默认 30 分钟 */
  cooldownMs: number;
  /** 检测间隔(毫秒),默认 30s */
  intervalMs: number;
  /** 错误源后端收到推时,只推 message + 数量,不推 stack(防泄漏) */
  omitStack: boolean;
}

const STORAGE_KEY = 'unraid-mobile-remote-reporter';

export const DEFAULT_REPORTER_CONFIG: RemoteReporterConfig = {
  enabled: false,
  lcpMs: 2500,
  clsThreshold: 0.1,
  inpMs: 200,
  errorCount: 3,
  errorWindowMs: 5 * 60 * 1000, // 5min
  cooldownMs: 30 * 60 * 1000, // 30min
  intervalMs: 30 * 1000, // 30s
  omitStack: true,
};

function read(): RemoteReporterConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_REPORTER_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPORTER_CONFIG };
    const v = JSON.parse(raw);
    return {
      ...DEFAULT_REPORTER_CONFIG,
      ...v,
    };
  } catch {
    return { ...DEFAULT_REPORTER_CONFIG };
  }
}

function write(cfg: RemoteReporterConfig) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function getRemoteReporterConfig(): RemoteReporterConfig {
  return read();
}
export function setRemoteReporterConfig(cfg: RemoteReporterConfig) {
  write(cfg);
  notifyConfigListeners();
}

const configListeners = new Set<() => void>();
function notifyConfigListeners() {
  for (const l of configListeners) l();
}
export function subscribeReporterConfig(fn: () => void): () => void {
  configListeners.add(fn);
  return () => {
    configListeners.delete(fn);
  };
}

export type ReportKind = 'lcp' | 'cls' | 'inp' | 'error-spike';

interface CooldownEntry {
  ts: number;
}
const cooldowns: Partial<Record<ReportKind, CooldownEntry>> = {};

function inCooldown(kind: ReportKind, cfg: RemoteReporterConfig): boolean {
  const c = cooldowns[kind];
  if (!c) return false;
  return Date.now() - c.ts < cfg.cooldownMs;
}

function markSent(kind: ReportKind) {
  cooldowns[kind] = { ts: Date.now() };
}

export function resetCooldowns() {
  for (const k of Object.keys(cooldowns)) delete cooldowns[k as ReportKind];
}

function makePayload(kind: ReportKind, message: string): WebhookPayload {
  return {
    container: 'unraid-mobile',
    state: kind,
    server: typeof window !== 'undefined' ? window.location.host : 'unknown',
    time: new Date().toISOString(),
    message,
  };
}

async function dispatch(kind: ReportKind, title: string, detail: string) {
  const cfg = read();
  if (!cfg.enabled) return;
  if (inCooldown(kind, cfg)) return;
  const wh = getWebhookConfig();
  if (!wh.enabled) return; // 复用 webhook 通道但不开,不报
  const msg = `🚨 ${title}\n${detail}`;
  const payload = makePayload(kind, msg);
  const ok = await sendWebhook(wh, payload);
  if (ok) {
    markSent(kind);
    pushNotification({
      kind: 'remote',
      title: `远程上报: ${title}`,
      detail,
      link: '/notifications',
      level: kind === 'error-spike' ? 'error' : 'warning',
    });
  } else {
    pushNotification({
      kind: 'remote',
      title: `上报失败: ${title}`,
      detail: '请检查 Webhook 配置或网络',
      link: '/settings',
      level: 'error',
    });
  }
}

/**
 * 错误密度检测
 * 窗口内 error 数 >= errorCount 触发
 */
function checkErrorSpike(cfg: RemoteReporterConfig): { count: number; msgs: string[] } | null {
  const errs = getErrors();
  if (!errs.length) return null;
  const cutoff = Date.now() - cfg.errorWindowMs;
  const recent = errs.filter((e) => e.timestamp >= cutoff);
  if (recent.length < cfg.errorCount) return null;
  return {
    count: recent.length,
    msgs: recent.slice(0, 5).map((e) => `[${e.source}] ${e.message}`),
  };
}

function lastVitals(): VitalsSnapshot | null {
  const h = getVitalsHistory();
  return h.length ? h[h.length - 1] : null;
}

/** 单次检查,可独立调用(测试) */
export async function runReporterCheck(): Promise<void> {
  const cfg = read();
  if (!cfg.enabled) return;
  const v = lastVitals();
  if (v) {
    if (v.lcp != null && v.lcp > cfg.lcpMs) {
      await dispatch('lcp', `LCP 越界 ${v.lcp.toFixed(0)}ms`, `阈值 ${cfg.lcpMs}ms`);
    }
    if (v.cls != null && v.cls > cfg.clsThreshold) {
      await dispatch('cls', `CLS 越界 ${v.cls.toFixed(3)}`, `阈值 ${cfg.clsThreshold}`);
    }
    if (v.inp != null && v.inp > cfg.inpMs) {
      await dispatch('inp', `INP 越界 ${v.inp.toFixed(0)}ms`, `阈值 ${cfg.inpMs}ms`);
    }
  }
  const spike = checkErrorSpike(cfg);
  if (spike) {
    const detail = cfg.omitStack
      ? `窗口 ${Math.round(cfg.errorWindowMs / 60000)}min 内 ${spike.count} 个错误\n${spike.msgs.join('\n')}`
      : `窗口 ${Math.round(cfg.errorWindowMs / 60000)}min 内 ${spike.count} 个错误\n${spike.msgs.join('\n')}`;
    await dispatch('error-spike', `前端错误 spike ×${spike.count}`, detail);
  }
}
