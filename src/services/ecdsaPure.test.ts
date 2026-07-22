// 【续 62 2026-07-22】ecdsaPure 纯 JS 验签测试
// 向量:node crypto 现签现验(与 WebCrypto 互通即与 gen-license.mjs 互通)
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createSign, createHash } from 'node:crypto';
import { sha256, verifyP256 } from './ecdsaPure';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });
const b64uToBuf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const rawPub = Buffer.concat([Buffer.from([4]), b64uToBuf(jwk.x!), b64uToBuf(jwk.y!)]);

function sign(msg: Uint8Array): Buffer {
  const s = createSign('SHA256');
  s.update(msg);
  return s.sign({ key: privateKey.export({ format: 'pem', type: 'sec1' }), dsaEncoding: 'ieee-p1363' });
}

describe('sha256', () => {
  it('与 node crypto 一致(短消息/长消息/空消息)', () => {
    for (const s of ['', 'abc', 'x'.repeat(1000), '{"email":"u@e.com","tier":"pro"}']) {
      const mine = Buffer.from(sha256(new TextEncoder().encode(s))).toString('hex');
      expect(mine).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});

describe('verifyP256', () => {
  const msg = new TextEncoder().encode('payload-test-续62');

  it('正确签名 → true', () => {
    expect(verifyP256(rawPub, sign(msg), msg)).toBe(true);
  });

  it('消息被改 → false', () => {
    const other = new TextEncoder().encode('payload-tampered');
    expect(verifyP256(rawPub, sign(msg), other)).toBe(false);
  });

  it('签名被改 → false', () => {
    const sig = sign(msg);
    sig[10] ^= 0xff;
    expect(verifyP256(rawPub, sig, msg)).toBe(false);
  });

  it('公钥被换(另一对密钥)→ false', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const ojwk = other.publicKey.export({ format: 'jwk' });
    const otherPub = Buffer.concat([Buffer.from([4]), b64uToBuf(ojwk.x!), b64uToBuf(ojwk.y!)]);
    expect(verifyP256(otherPub, sign(msg), msg)).toBe(false);
  });

  it('畸形输入(长度错/非 0x04 头)→ false 不抛异常', () => {
    expect(verifyP256(new Uint8Array(10), sign(msg), msg)).toBe(false);
    expect(verifyP256(rawPub, new Uint8Array(10), msg)).toBe(false);
    const badHead = Buffer.from(rawPub);
    badHead[0] = 3;
    expect(verifyP256(badHead, sign(msg), msg)).toBe(false);
  });
});
