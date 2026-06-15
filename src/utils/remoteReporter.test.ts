// 【续 37-1】远程上报单元测试
// 覆盖:配置读写 / 阈值检查 / 冷却 / webhook 通道未启用时不发
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_REPORTER_CONFIG,
  getRemoteReporterConfig,
  resetCooldowns,
  runReporterCheck,
  setRemoteReporterConfig,
} from './remoteReporter';
import { recordVitalsSnapshot } from './webVitals';
import { clearErrors, reportError } from './errorReporter';

// mock webhook 避免真实网络
vi.mock('./webhook', async () => {
  const actual = await vi.importActual<typeof import('./webhook')>('./webhook');
  return {
    ...actual,
    sendWebhook: vi.fn(async () => true),
  };
});

import { sendWebhook, getWebhookConfig, setWebhookConfig } from './webhook';

const REPORTER_KEY = 'unraid-mobile-remote-reporter';

beforeEach(() => {
  localStorage.clear();
  resetCooldowns();
  clearErrors();
  vi.mocked(sendWebhook).mockReset();
  vi.mocked(sendWebhook).mockResolvedValue(true);
});

describe('remoteReporter 配置读写', () => {
  it('默认配置', () => {
    const cfg = getRemoteReporterConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.lcpMs).toBe(DEFAULT_REPORTER_CONFIG.lcpMs);
    expect(cfg.clsThreshold).toBe(DEFAULT_REPORTER_CONFIG.clsThreshold);
    expect(cfg.inpMs).toBe(DEFAULT_REPORTER_CONFIG.inpMs);
    expect(cfg.errorCount).toBe(3);
  });

  it('set 后读出来', () => {
    setRemoteReporterConfig({ ...DEFAULT_REPORTER_CONFIG, enabled: true, lcpMs: 3000 });
    expect(getRemoteReporterConfig().lcpMs).toBe(3000);
    expect(getRemoteReporterConfig().enabled).toBe(true);
  });

  it('localStorage 损坏时回退默认', () => {
    localStorage.setItem(REPORTER_KEY, '{not json');
    expect(getRemoteReporterConfig().lcpMs).toBe(2500);
  });
});

describe('runReporterCheck 行为', () => {
  it('enabled=false 时不调用 sendWebhook', async () => {
    setRemoteReporterConfig({ ...DEFAULT_REPORTER_CONFIG, enabled: false });
    setWebhookConfig({ ...getWebhookConfig(), enabled: true });
    recordVitalsSnapshot({ lcp: 9999, cls: 0.5, inp: 9999, fcp: 9999, memory: null });
    await runReporterCheck();
    expect(sendWebhook).not.toHaveBeenCalled();
  });

  it('webhook 未启用时不调用', async () => {
    setRemoteReporterConfig({ ...DEFAULT_REPORTER_CONFIG, enabled: true });
    setWebhookConfig({ ...getWebhookConfig(), enabled: false });
    recordVitalsSnapshot({ lcp: 9999, cls: 0.5, inp: 9999, fcp: 9999, memory: null });
    await runReporterCheck();
    expect(sendWebhook).not.toHaveBeenCalled();
  });

  it('LCP 越界触发一次,然后冷却', async () => {
    setRemoteReporterConfig({ ...DEFAULT_REPORTER_CONFIG, enabled: true, cooldownMs: 60_000 });
    setWebhookConfig({ ...getWebhookConfig(), enabled: true });
    recordVitalsSnapshot({ lcp: 5000, cls: 0.05, inp: 50, fcp: 800, memory: null });
    await runReporterCheck();
    expect(sendWebhook).toHaveBeenCalledTimes(1);
    await runReporterCheck(); // 第二次
    expect(sendWebhook).toHaveBeenCalledTimes(1); // 仍为 1,冷却
  });

  it('错误密度 spike 触发', async () => {
    setRemoteReporterConfig({
      ...DEFAULT_REPORTER_CONFIG,
      enabled: true,
      errorCount: 2,
      errorWindowMs: 60_000,
    });
    setWebhookConfig({ ...getWebhookConfig(), enabled: true });
    reportError(new Error('boom 1'), 'manual');
    reportError(new Error('boom 2'), 'manual');
    await runReporterCheck();
    expect(sendWebhook).toHaveBeenCalled();
    const call = vi.mocked(sendWebhook).mock.calls[0];
    expect((call[1].message ?? '').toLowerCase()).toContain('错误');
  });

  it('冷却后 resetCooldowns 可重新触发', async () => {
    setRemoteReporterConfig({ ...DEFAULT_REPORTER_CONFIG, enabled: true });
    setWebhookConfig({ ...getWebhookConfig(), enabled: true });
    recordVitalsSnapshot({ lcp: 9999, cls: 0.05, inp: 50, fcp: 800, memory: null });
    await runReporterCheck();
    expect(sendWebhook).toHaveBeenCalledTimes(1);
    await runReporterCheck();
    expect(sendWebhook).toHaveBeenCalledTimes(1);
    resetCooldowns();
    await runReporterCheck();
    expect(sendWebhook).toHaveBeenCalledTimes(2);
  });
});
