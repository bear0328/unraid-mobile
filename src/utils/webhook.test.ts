// 【阶段 P1-测试 - 2026-06-17 续 35-2】Webhook 工具单测
// 覆盖:renderTemplate(替换变量)/ 各 provider URL 构造 / disabled/空配置 返 false / 网络失败 容忍
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWebhook, type WebhookConfig, type WebhookPayload } from './webhook';

const basePayload: WebhookPayload = {
  container: 'nginx',
  state: 'exited',
  server: 'unRAID-01',
  time: '2026-06-17 14:30:00',
};

const baseConfig: WebhookConfig = {
  provider: 'bark',
  url: 'https://api.day.app/abc123',
  enabled: true,
  token: '',
  chatId: '',
  template: '[{{server}}] {{container}} -> {{state}}',
};

describe('webhook.sendWebhook', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disabled 配置直接返 false', async () => {
    const ok = await sendWebhook({ ...baseConfig, enabled: false }, basePayload);
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Bark: GET URL 包含 title/body', async () => {
    await sendWebhook(baseConfig, basePayload);
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/api\.day\.app\/abc123\//);
    expect(url).toContain(encodeURIComponent('unRAID')); // title 固定
    expect(url).toContain(encodeURIComponent('[unRAID-01] nginx -> exited')); // body
  });

  it('Telegram: POST 到 api.telegram.org 带 token/chatId/text', async () => {
    const cfg: WebhookConfig = {
      ...baseConfig,
      provider: 'telegram',
      token: 'BOT123:ABC',
      chatId: '-100987',
    };
    await sendWebhook(cfg, basePayload);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botBOT123%3AABC/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe('-100987');
    expect(body.text).toContain('nginx');
  });

  it('Telegram 缺 token/chatId 返 false', async () => {
    expect(await sendWebhook({ ...baseConfig, provider: 'telegram' }, basePayload)).toBe(false);
    expect(
      await sendWebhook({ ...baseConfig, provider: 'telegram', token: 'x' }, basePayload)
    ).toBe(false);
  });

  it('Discord: POST content', async () => {
    const cfg: WebhookConfig = { ...baseConfig, provider: 'discord' };
    await sendWebhook(cfg, basePayload);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(baseConfig.url);
    const body = JSON.parse(init.body as string);
    expect(body.content).toContain('nginx');
  });

  it('Custom: 模板替换 + payload 全字段', async () => {
    const cfg: WebhookConfig = {
      ...baseConfig,
      provider: 'custom',
      url: 'https://hook.example.com',
      template: '⚠️ {{container}} {{state}} @{{time}}',
    };
    await sendWebhook(cfg, basePayload);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.container).toBe('nginx');
    expect(body.state).toBe('exited');
    expect(body.server).toBe('unRAID-01');
    expect(body.time).toBe('2026-06-17 14:30:00');
    expect(body.message).toBe('⚠️ nginx exited @2026-06-17 14:30:00');
  });

  it('Bark 空 URL 返 false 不发请求', async () => {
    expect(await sendWebhook({ ...baseConfig, url: '' }, basePayload)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetch 失败/network 错误 返 false 不抛', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    );
    const ok = await sendWebhook(baseConfig, basePayload);
    expect(ok).toBe(false);
  });

  it('HTTP 非 2xx 返 false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('fail', { status: 500 })))
    );
    const ok = await sendWebhook(baseConfig, basePayload);
    expect(ok).toBe(false);
  });
});
