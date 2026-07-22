// 【续 55 商业化 2026-07-19】离线 license key 验证(买断制 Pro 解锁)
//
// 方案:ECDSA P-256 SHA-256(选 ES256 而非 Ed25519 — WebCrypto 全浏览器支持,
// Ed25519 旧 Safari 没有)。私钥只在本机(.license-private-key.pem,gitignored),
// 公钥内置 bundle。验签全程离线,无授权服务器。
//
// key 格式: UMPRO1.<base64url(payload)>.<base64url(sig)>
//   payload = {email, tier:"pro", iat, exp:null|unix秒}
//   sig     = 对 payload 的 base64url 字符串(UTF-8 字节)的签名(ieee-p1363 raw r||s)
// 签名工具: scripts/gen-license.mjs
//
// 安全共识(README 已写明):离线 key 防君子不防高手(bundle 可扒、公钥可换),
// 商用滥用由 BSL LICENSE 兜底,这里不做对抗性加固。

import { verifyP256 } from './ecdsaPure';

const PUBLIC_KEY_B64U = 'BBz7qrzF-TaE-alABvbNyn4bVGEmpLZtW7B-_V0yslZ8wglJqV4zhEB3sXgp6kOe8f4E_zfm8rFJU1AvkA2X3K8';
const LS_KEY = 'unraid-mobile-license';
const KEY_PREFIX = 'UMPRO1.';

export interface LicenseInfo {
  email: string;
  tier: string;
  iat: number;
  /** null = 永久 */
  exp: number | null;
  /** 【续 59】绑定的 unRAID flashGuid;null/缺省 = 不绑机(向后兼容旧 key) */
  guid?: string | null;
  /** 【续 59】设备数上限(默认 3) */
  maxDev?: number;
}

export type LicenseState =
  | { status: 'none' }
  | { status: 'active'; info: LicenseInfo }
  | { status: 'expired'; info: LicenseInfo }
  | { status: 'invalid' }
  /** 【续 59】key 有效但绑定的是另一台 unRAID(flashGuid 不匹配) */
  | { status: 'mismatch'; info: LicenseInfo };

// ---------- base64url / crypto ----------

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let publicKeyPromise: Promise<CryptoKey> | null = null;
let publicKeyOverride: string | null = null; // 测试注入

function getPublicKey(): Promise<CryptoKey> {
  if (!publicKeyPromise) {
    const raw = b64urlToBytes(publicKeyOverride ?? PUBLIC_KEY_B64U);
    publicKeyPromise = crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  }
  return publicKeyPromise;
}

// ---------- 验签 ----------

async function verifyKey(key: string): Promise<LicenseState> {
  const trimmed = key.trim();
  if (!trimmed.startsWith(KEY_PREFIX)) return { status: 'invalid' };
  const parts = trimmed.slice(KEY_PREFIX.length).split('.');
  if (parts.length !== 2) return { status: 'invalid' };
  const [payloadB64, sigB64] = parts;
  let info: LicenseInfo;
  try {
    info = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (typeof info?.email !== 'string' || info.tier !== 'pro') return { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
  try {
    const msgBytes = new TextEncoder().encode(payloadB64);
    const sigBytes = b64urlToBytes(sigB64);
    let ok: boolean;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        await getPublicKey(),
        sigBytes as BufferSource,
        msgBytes as BufferSource
      );
    } else {
      // 【续 62】HTTP 内网源(非安全上下文)无 crypto.subtle → 纯 JS 验签回退
      ok = verifyP256(b64urlToBytes(publicKeyOverride ?? PUBLIC_KEY_B64U), sigBytes, msgBytes);
    }
    if (!ok) return { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
  if (info.exp !== null && Date.now() / 1000 > info.exp) {
    return { status: 'expired', info };
  }
  return { status: 'active', info };
}

// ---------- 状态缓存 + 订阅 ----------

let cached: LicenseState = { status: 'none' };
const listeners = new Set<() => void>();

function setState(s: LicenseState): void {
  cached = s;
  listeners.forEach((cb) => cb());
}

/** 同步读当前状态(首验完成前 stored key 视为 none,验完自动通知) */
export function getLicenseState(): LicenseState {
  return cached;
}

export function isPro(): boolean {
  return cached.status === 'active';
}

export function subscribeLicense(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** app 启动时调用一次:验 localStorage 里已存的 key */
export async function initLicense(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LS_KEY);
  } catch {
    /* LS 不可用按无 key */
  }
  if (!stored) {
    setState({ status: 'none' });
    return;
  }
  const s = await verifyKey(stored);
  // 过期/无效也保留状态展示(设置页提示),但 isPro()=false
  setState(s);
}

/** 激活:验签通过才落盘;返回错误文案(失败时) */
export async function activateLicense(key: string): Promise<{ ok: boolean; error?: string }> {
  const s = await verifyKey(key);
  if (s.status === 'invalid') return { ok: false, error: 'License key 无效或签名不符' };
  if (s.status === 'expired') {
    setState(s);
    return { ok: false, error: 'License key 已过期,请续期' };
  }
  try {
    localStorage.setItem(LS_KEY, key.trim());
  } catch {
    /* 无碍,内存态已生效 */
  }
  setState(s);
  return { ok: true };
}

export function clearLicense(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  setState({ status: 'none' });
}

/**
 * 【续 59】绑定模块(licenseBinding)写状态:验签已通过,但 flashGuid 不匹配 → mismatch;
 * 传入 null 表示绑定通过/无需绑定,回到 active(仅当当前是 mismatch 时翻转,info 沿用)。
 */
export function setServerMismatch(mismatched: boolean): void {
  if (mismatched) {
    if (cached.status === 'active') setState({ status: 'mismatch', info: cached.info });
  } else if (cached.status === 'mismatch') {
    setState({ status: 'active', info: cached.info });
  }
}

// ---------- 测试专用 ----------

/** 测试注入临时公钥(配合测试自签 key) */
export function __setPublicKeyForTest(rawB64u: string | null): void {
  publicKeyOverride = rawB64u;
  publicKeyPromise = null;
}

/** 测试直接置状态(UI 门控测试用,免签名) */
export function __setLicenseStateForTest(s: LicenseState): void {
  setState(s);
}

export function __resetLicenseForTest(): void {
  cached = { status: 'none' };
  listeners.clear();
  publicKeyOverride = null;
  publicKeyPromise = null;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
