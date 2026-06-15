// 【续 50 A4】备份导出测试 — 核心断言:无论 LS 里 servers 长啥样,导出绝不含 apiKey
import { describe, it, expect, beforeEach } from 'vitest';
import { exportBackup, importBackup } from './backup';

const SERVERS_KEY = 'unraid-mobile-servers';
const WEBHOOK_KEY = 'unraid-mobile-webhook';

describe('backup exportBackup(续 50 A4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('servers 里混入 apiKey(历史版本)→ 导出剥掉,其余字段保留', () => {
    localStorage.setItem(
      SERVERS_KEY,
      JSON.stringify([
        { id: 's1', name: 'nas', serverUrl: 'http://nas', color: '#fff', apiKey: 'secret-key' },
      ])
    );
    const data = JSON.parse(exportBackup());
    expect(data.servers).toHaveLength(1);
    expect(data.servers[0]).not.toHaveProperty('apiKey');
    expect(data.servers[0]).toMatchObject({ id: 's1', name: 'nas', serverUrl: 'http://nas' });
    // 整个导出 JSON 文本里也不应出现 key 值
    expect(exportBackup()).not.toContain('secret-key');
  });

  it('servers 为空 → 导出 servers 为 null', () => {
    const data = JSON.parse(exportBackup());
    expect(data.servers).toBeNull();
  });
});

// 【续 50 D6a】webhook 备份:key 与 webhook.ts 对齐;导出剔 token 类密钥,导入缺密钥保留本地
describe('backup webhook(续 50 D6a)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('LS 有 webhook 配置 → 导出读得到(key 修复),不含 token 但含 provider/enabled/url', () => {
    localStorage.setItem(
      WEBHOOK_KEY,
      JSON.stringify({
        provider: 'telegram',
        url: 'https://example.com/hook',
        enabled: true,
        token: 'bot-secret-token',
        chatId: '12345',
        template: '[{{server}}] {{container}}',
      })
    );
    const data = JSON.parse(exportBackup());
    expect(data.webhookSettings).not.toBeNull();
    expect(data.webhookSettings).not.toHaveProperty('token');
    expect(data.webhookSettings).toMatchObject({
      provider: 'telegram',
      url: 'https://example.com/hook',
      enabled: true,
      chatId: '12345',
    });
    // 整个导出文本里也不应出现 token 值
    expect(exportBackup()).not.toContain('bot-secret-token');
  });

  it('LS 无 webhook 配置 → 导出 webhookSettings 为 null', () => {
    const data = JSON.parse(exportBackup());
    expect(data.webhookSettings).toBeNull();
  });

  it('导入:备份缺 token,本地已有 → 保留本地 token,其余字段用备份的', () => {
    localStorage.setItem(
      WEBHOOK_KEY,
      JSON.stringify({ provider: 'bark', url: '', enabled: false, token: 'local-token' })
    );
    const backup = JSON.stringify({
      version: 1,
      webhookSettings: { provider: 'telegram', enabled: true, chatId: '12345' },
    });
    const r = importBackup(backup, { overwrite: true });
    expect(r.webhookSettings).toBe(true);
    const stored = JSON.parse(localStorage.getItem(WEBHOOK_KEY)!);
    expect(stored.token).toBe('local-token');
    expect(stored.provider).toBe('telegram');
    expect(stored.enabled).toBe(true);
  });

  it('导入:备份带 token(旧版备份)、本地没有 → 正常导入备份的 token', () => {
    const backup = JSON.stringify({
      version: 1,
      webhookSettings: { provider: 'resend', enabled: true, token: 're_imported' },
    });
    const r = importBackup(backup, { overwrite: true });
    expect(r.webhookSettings).toBe(true);
    const stored = JSON.parse(localStorage.getItem(WEBHOOK_KEY)!);
    expect(stored.token).toBe('re_imported');
  });

  it('导入:不开 overwrite → 不写 webhook', () => {
    const backup = JSON.stringify({
      version: 1,
      webhookSettings: { provider: 'bark', enabled: true },
    });
    const r = importBackup(backup);
    expect(r.webhookSettings).toBe(false);
    expect(localStorage.getItem(WEBHOOK_KEY)).toBeNull();
  });
});
