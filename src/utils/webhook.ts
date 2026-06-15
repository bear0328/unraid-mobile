// 【阶段 P2-Webhook - 2026-06-17 续 34-7】容器事件外发
// 支持 Bark / Telegram / Discord / Resend / 自定义 Webhook
// 模板: {{container}} {{state}} {{server}} {{time}}
// 【续 36-5】加 Resend(邮件)provider
import { useEffect, useState } from 'react';

export type WebhookProvider = 'bark' | 'telegram' | 'discord' | 'resend' | 'custom';

export interface WebhookPayload {
  container: string;
  state: string;
  server: string;
  time: string;
  /** 可选,给模板 message 注入(用于 Resend 等需要纯文本的场景) */
  message?: string;
}

export interface WebhookConfig {
  provider: WebhookProvider;
  url: string;
  /** Telegram bot token(仅 telegram) */
  token?: string;
  /** Telegram chat id(仅 telegram) */
  chatId?: string;
  /** Resend: from 邮箱(需在 Resend 后台验证) */
  from?: string;
  /** Resend: 收件人邮箱 */
  to?: string;
  /** Resend subject 模板 */
  subject?: string;
  /** 总开关 */
  enabled: boolean;
  /** 消息模板(自定义模式生效) */
  template?: string;
}

const STORAGE_KEY = 'unraid-mobile-webhook';
const DEFAULT: WebhookConfig = {
  provider: 'bark',
  url: '',
  enabled: false,
  token: '',
  chatId: '',
  from: '',
  to: '',
  subject: '[{{server}}] {{container}} {{state}}',
  template: '[{{server}}] {{container}} → {{state}}',
};

function read(): WebhookConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw);
    return {
      provider: v.provider ?? DEFAULT.provider,
      url: v.url ?? '',
      enabled: !!v.enabled,
      token: v.token ?? '',
      chatId: v.chatId ?? '',
      from: v.from ?? '',
      to: v.to ?? '',
      subject: v.subject ?? DEFAULT.subject,
      template: v.template ?? DEFAULT.template,
    };
  } catch {
    return { ...DEFAULT };
  }
}

function write(cfg: WebhookConfig) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function getWebhookConfig(): WebhookConfig {
  return read();
}
export function setWebhookConfig(cfg: WebhookConfig) {
  write(cfg);
  notifyListeners();
}

const listeners = new Set<() => void>();
function notifyListeners() {
  for (const l of listeners) l();
}

export function useWebhookConfig(): [WebhookConfig, (next: WebhookConfig) => void] {
  const [cfg, setCfg] = useState<WebhookConfig>(read);
  useEffect(() => {
    const fn = () => setCfg(read());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [
    cfg,
    (next) => {
      write(next);
      notifyListeners();
    },
  ];
}

function renderTemplate(tpl: string, p: WebhookPayload): string {
  return tpl
    .replace(/\{\{container\}\}/g, p.container)
    .replace(/\{\{state\}\}/g, p.state)
    .replace(/\{\{server\}\}/g, p.server)
    .replace(/\{\{time\}\}/g, p.time);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * 发送一条 webhook
 * @returns true 成功 / false 失败(不抛异常,调用方决定是否 toast)
 */
export async function sendWebhook(
  config: WebhookConfig,
  payload: WebhookPayload
): Promise<boolean> {
  if (!config.enabled) return false;
  const msg = renderTemplate(config.template || DEFAULT.template!, payload);
  try {
    switch (config.provider) {
      case 'bark': {
        if (!config.url) return false;
        // Bark: url/device_key/{title}/{body} 或 url?title=&body=
        const u = new URL(config.url);
        u.pathname =
          (u.pathname.replace(/\/$/, '') || '') +
          `/${encodeURIComponent('unRAID')}/${encodeURIComponent(msg)}`;
        const res = await fetchWithTimeout(u.toString(), { method: 'GET' });
        return res.ok;
      }
      case 'telegram': {
        if (!config.token || !config.chatId) return false;
        const u = `https://api.telegram.org/bot${encodeURIComponent(config.token)}/sendMessage`;
        const res = await fetchWithTimeout(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: config.chatId, text: msg }),
        });
        return res.ok;
      }
      case 'discord': {
        if (!config.url) return false;
        const res = await fetchWithTimeout(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        });
        return res.ok;
      }
      case 'resend': {
        // Resend: POST https://api.resend.com/emails
        // 需在 resend.com 验证 from 域名 + 拿 API key
        if (!config.token || !config.from || !config.to) return false;
        const subject = renderTemplate(config.subject || DEFAULT.subject!, payload);
        const res = await fetchWithTimeout('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({ from: config.from, to: [config.to], subject, text: msg }),
        });
        return res.ok;
      }
      case 'custom': {
        if (!config.url) return false;
        const res = await fetchWithTimeout(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            container: payload.container,
            state: payload.state,
            server: payload.server,
            time: payload.time,
            message: msg,
          }),
        });
        return res.ok;
      }
      default:
        return false;
    }
  } catch (e) {
    console.warn('[webhook] send failed:', e);
    return false;
  }
}
