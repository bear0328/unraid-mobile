// 【续 62 2026-07-22】纯 JS 验签回退 — HTTP 内网源(非安全上下文)没有 crypto.subtle,
// license 验签全灭("已存的 key 无效")。BigInt 实现 SHA-256 + ECDSA P-256,零依赖。
// 仅在 crypto.subtle 不可用时启用(HTTPS 下仍走原生 WebCrypto)。
//
// 性能:一次验签约几十 ms(double-and-add 256 轮 BigInt 运算),只在激活/启动时跑一次,无感。

// ---------- SHA-256 ----------

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) | 0;
}

export function sha256(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8;
  // 预填充:补 0x80 + 0 填充 + 8 字节大端长度
  const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array<number>(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => odv.setUint32(i * 4, v >>> 0));
  return out;
}

// ---------- ECDSA P-256 (secp256r1) 验签 ----------

const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const A = P - 3n;
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
const GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');

type Point = { x: bigint; y: bigint } | null; // null = 无穷远点

function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

/** 扩展欧几里得求逆元 a^-1 mod m */
function invMod(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

function pointAdd(p1: Point, p2: Point): Point {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y, P) === 0n) return null; // 互逆 → 无穷远
    // 倍点
    const lam = mod((3n * p1.x * p1.x + A) * invMod(2n * p1.y, P), P);
    const x3 = mod(lam * lam - 2n * p1.x, P);
    return { x: x3, y: mod(lam * (p1.x - x3) - p1.y, P) };
  }
  const lam = mod((p2.y - p1.y) * invMod(p2.x - p1.x, P), P);
  const x3 = mod(lam * lam - p1.x - p2.x, P);
  return { x: x3, y: mod(lam * (p1.x - x3) - p1.y, P) };
}

function scalarMult(k: bigint, pt: Point): Point {
  let result: Point = null;
  let addend = pt;
  let bits = k;
  while (bits > 0n) {
    if (bits & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    bits >>= 1n;
  }
  return result;
}

function bytesToBigint(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

/**
 * 验签 ECDSA P-256 SHA-256(ieee-p1363 raw r||s 64 字节)。
 * @param pubRaw 65 字节未压缩公钥(0x04 || x || y)
 * @param sig    64 字节签名(r || s)
 * @param msg    被签名消息原文(内部做 sha256)
 */
export function verifyP256(pubRaw: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean {
  try {
    if (pubRaw.length !== 65 || pubRaw[0] !== 4 || sig.length !== 64) return false;
    const qx = bytesToBigint(pubRaw.slice(1, 33));
    const qy = bytesToBigint(pubRaw.slice(33, 65));
    if (qx >= P || qy >= P) return false;
    const r = bytesToBigint(sig.slice(0, 32));
    const s = bytesToBigint(sig.slice(32, 64));
    if (r < 1n || r >= N || s < 1n || s >= N) return false;

    const e = mod(bytesToBigint(sha256(msg)), N);
    const w = invMod(s, N);
    const u1 = mod(e * w, N);
    const u2 = mod(r * w, N);
    const p1 = scalarMult(u1, { x: GX, y: GY });
    const p2 = scalarMult(u2, { x: qx, y: qy });
    const sum = pointAdd(p1, p2);
    if (sum === null) return false;
    return mod(sum.x, N) === r;
  } catch {
    return false;
  }
}
