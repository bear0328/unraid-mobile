#!/usr/bin/env node
// 【续 55 商业化】离线 license key 签名工具(买断制,离线验签)
//
// 用法:
//   node scripts/gen-license.mjs <email> [--exp 2027-07-19]
//   node scripts/gen-license.mjs user@example.com          # 永久 key(exp=null)
//
// 私钥: 项目根 .license-private-key.pem(gitignored,永不进仓库/镜像;丢了无法签新 key)
// key 格式: UMPRO1.<base64url(payload)>.<base64url(sig)>
//   payload = {email, tier:"pro", iat, exp}  (exp 为 unix 秒或 null=永久)
//   sig     = ECDSA P-256 SHA-256(ieee-p1363 raw r||s),对 payload 的 base64url 字符串字节签名
// 前端 src/services/license.ts 用内置公钥验签,无需联网。
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATH = join(root, '.license-private-key.pem');

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

const [, , email, ...rest] = process.argv;
if (!email || !email.includes('@')) {
  console.error('用法: node scripts/gen-license.mjs <email> [--exp YYYY-MM-DD]');
  process.exit(1);
}

let exp = null;
const expIdx = rest.indexOf('--exp');
if (expIdx !== -1) {
  const d = new Date(rest[expIdx + 1]);
  if (isNaN(d.getTime())) {
    console.error('--exp 日期无效');
    process.exit(1);
  }
  exp = Math.floor(d.getTime() / 1000);
}

let pem;
try {
  pem = readFileSync(KEY_PATH, 'utf8');
} catch {
  console.error(`私钥不存在: ${KEY_PATH}(重新生成会失去旧 key 的验签能力)`);
  process.exit(1);
}

const payload = { email, tier: 'pro', iat: Math.floor(Date.now() / 1000), exp };
const payloadB64 = b64url(JSON.stringify(payload));
const sign = createSign('SHA256');
sign.update(payloadB64);
const sig = sign.sign({ key: pem, dsaEncoding: 'ieee-p1363' });

console.log(`\nemail: ${email}  exp: ${exp ? new Date(exp * 1000).toISOString().slice(0, 10) : '永久'}`);
console.log(`\nUMPRO1.${payloadB64}.${b64url(sig)}\n`);
