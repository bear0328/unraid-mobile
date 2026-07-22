// 【续 55 商业化】license.ts 验签/激活/过期/存储测试
// 测试内自签 key:node crypto 生成临时 P-256 密钥对,__setPublicKeyForTest 注入公钥
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import {
  activateLicense,
  clearLicense,
  getLicenseState,
  isPro,
  initLicense,
  subscribeLicense,
  setServerMismatch,
  __setPublicKeyForTest,
  __resetLicenseForTest,
} from './license';

// 测试密钥对(每次测试文件加载生成一次)
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });
const b64uToBuf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const rawPub = Buffer.concat([Buffer.from([4]), b64uToBuf(jwk.x!), b64uToBuf(jwk.y!)]);

function signKey(payload: object): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sign = createSign('SHA256');
  sign.update(payloadB64);
  const sig = sign.sign({ key: privateKey.export({ format: 'pem', type: 'sec1' }), dsaEncoding: 'ieee-p1363' });
  return `UMPRO1.${payloadB64}.${sig.toString('base64url')}`;
}

const validPayload = { email: 'user@example.com', tier: 'pro', iat: 1784644426, exp: null };

beforeEach(() => {
  localStorage.clear();
  __setPublicKeyForTest(rawPub.toString('base64url'));
});

afterEach(() => {
  __resetLicenseForTest();
});

describe('license 验签', () => {
  it('有效 key 激活 → isPro()=true,状态含邮箱,落 localStorage', async () => {
    const r = await activateLicense(signKey(validPayload));
    expect(r.ok).toBe(true);
    expect(isPro()).toBe(true);
    expect(getLicenseState()).toEqual({ status: 'active', info: validPayload });
    expect(localStorage.getItem('unraid-mobile-license')).toBeTruthy();
  });

  it('签名被篡改 → invalid,不激活', async () => {
    const key = signKey(validPayload);
    const tampered = key.slice(0, -4) + 'AAAA';
    const r = await activateLicense(tampered);
    expect(r.ok).toBe(false);
    expect(isPro()).toBe(false);
  });

  it('payload 被篡改(换邮箱)→ invalid', async () => {
    const key = signKey(validPayload);
    const [, payloadB64] = key.split('.');
    // 解出 payload 改邮箱后用原签名拼回(签名必不符)
    void payloadB64;
    const fakePayloadB64 = Buffer.from(
      JSON.stringify({ ...validPayload, email: 'hacker@evil.com' })
    ).toString('base64url');
    const parts = key.split('.');
    const forged = `${parts[0]}.${fakePayloadB64}.${parts[2]}`;
    const r = await activateLicense(forged);
    expect(r.ok).toBe(false);
    expect(isPro()).toBe(false);
  });

  it('过期 key → expired,不激活但状态可见', async () => {
    const expiredPayload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 };
    const r = await activateLicense(signKey(expiredPayload));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('过期');
    expect(getLicenseState().status).toBe('expired');
    expect(isPro()).toBe(false);
  });

  it('格式错误(无前缀/段数不对/坏 JSON)→ invalid', async () => {
    expect((await activateLicense('FOO.bar.baz')).ok).toBe(false);
    expect((await activateLicense('UMPRO1.onlyone')).ok).toBe(false);
    expect((await activateLicense(`UMPRO1.${Buffer.from('not json').toString('base64url')}.x`)).ok).toBe(false);
  });

  it('initLicense:localStorage 里的有效 key 启动即恢复激活', async () => {
    localStorage.setItem('unraid-mobile-license', signKey(validPayload));
    await initLicense();
    expect(isPro()).toBe(true);
  });

  it('initLicense:无 key → none', async () => {
    await initLicense();
    expect(getLicenseState().status).toBe('none');
    expect(isPro()).toBe(false);
  });

  it('clearLicense 后回到免费版并通知订阅者', async () => {
    await activateLicense(signKey(validPayload));
    expect(isPro()).toBe(true);
    let notified = 0;
    const unsub = subscribeLicense(() => notified++);
    clearLicense();
    expect(isPro()).toBe(false);
    expect(localStorage.getItem('unraid-mobile-license')).toBeNull();
    expect(notified).toBe(1);
    unsub();
  });
});

describe('【续 59】绑定字段 + mismatch 状态', () => {
  const boundPayload = {
    ...validPayload,
    guid: '346D-5678-4681-113486419445',
    maxDev: 3,
  };

  it('带 guid/maxDev 的 key → 激活后 info 保留绑定字段', async () => {
    const r = await activateLicense(signKey(boundPayload));
    expect(r.ok).toBe(true);
    expect(getLicenseState()).toEqual({ status: 'active', info: boundPayload });
  });

  it('旧格式 key(无 guid/maxDev)→ 兼容激活,guid/maxDev 为 undefined', async () => {
    const r = await activateLicense(signKey(validPayload));
    expect(r.ok).toBe(true);
    const st = getLicenseState();
    expect(st.status).toBe('active');
    if (st.status === 'active') {
      expect(st.info.guid).toBeUndefined();
      expect(st.info.maxDev).toBeUndefined();
    }
  });

  it('setServerMismatch(true):active → mismatch,isPro()=false;再 false 翻回 active', async () => {
    await activateLicense(signKey(boundPayload));
    expect(isPro()).toBe(true);
    setServerMismatch(true);
    expect(getLicenseState().status).toBe('mismatch');
    expect(isPro()).toBe(false);
    setServerMismatch(false);
    expect(getLicenseState().status).toBe('active');
    expect(isPro()).toBe(true);
  });

  it('非 active 状态 setServerMismatch(true) 不动状态', async () => {
    setServerMismatch(true); // none 态
    expect(getLicenseState().status).toBe('none');
  });

  it('mismatch 态 clearLicense → none', async () => {
    await activateLicense(signKey(boundPayload));
    setServerMismatch(true);
    expect(getLicenseState().status).toBe('mismatch');
    clearLicense();
    expect(getLicenseState().status).toBe('none');
  });

  it('【续 62】crypto.subtle 不可用(HTTP 内网源)→ 纯 JS 回退验签,激活正常', async () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { subtle: undefined });
    try {
      const r = await activateLicense(signKey(validPayload));
      expect(r.ok).toBe(true);
      expect(isPro()).toBe(true);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
});
