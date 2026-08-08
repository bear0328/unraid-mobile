// 【续 88 2026-08-08】compose-api/api.php 回归:
//   1. 同步操作(up/down/restart)接入 .op-running 并发锁,锁占用返回 409
//   2. 认证失败(401)也写审计日志
// PHP 无法在本仓库运行环境单测(PHP 常量在宿主路径),故做结构断言;
// 本机有 php 时附带 php -l 语法验证(无 php 自动跳过)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const apiPhpPath = path.join(dir, 'api.php');
const apiPhp = readFileSync(apiPhpPath, 'utf-8');

/** 截取函数体(从 function 声明到下一个顶格 `}`;对扁平的函数定义足够用) */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const end = rest.indexOf('\n}');
  return end === -1 ? rest : rest.slice(0, end);
}

const hasPhp = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

describe('api.php 同步操作并发锁(续 88)', () => {
  const sync = fnBody(apiPhp, 'runComposeSync');
  const async = fnBody(apiPhp, 'runComposeAsync');

  it('runComposeSync 存在', () => {
    expect(sync).not.toBe('');
  });

  it('sync 与异步共用同一把 .op-running 锁(fopen x 原子创建)', () => {
    expect(sync).toContain('/.op-running');
    expect(sync).toContain("fopen($lockFile, 'x')");
    // 与异步路径同机制
    expect(async).toContain("fopen($lockFile, 'x')");
  });

  it('锁被占用时返回 409,错误格式与异步路径一致', () => {
    expect(sync).toContain('fail(409');
    const syncMsg = sync.match(/fail\(409, '([^']+)'\)/)?.[1];
    const asyncMsg = async.match(/fail\(409, '([^']+)'\)/)?.[1];
    expect(syncMsg).toBeTruthy();
    expect(syncMsg).toBe(asyncMsg);
  });

  it('锁占用失败也记审计,与异步路径一致', () => {
    expect(sync).toContain("audit($op, basename($dir), 'fail');");
  });

  it('执行期间持锁,结束/异常均经 finally 释放', () => {
    expect(sync).toContain('try {');
    expect(sync).toContain('} finally {');
    expect(sync).toContain('@unlink($lockFile)');
  });

  it('fail() 保持 {ok:false,error} 错误格式', () => {
    const fail = fnBody(apiPhp, 'fail');
    expect(fail).toContain("['ok' => false, 'error' => $msg]");
  });
});

describe('api.php 认证失败审计(续 88)', () => {
  it('所有 401 分支前都有 audit(auth) 记录', () => {
    const authAudits = apiPhp.match(/audit\('auth', '-', 'fail'\);/g) ?? [];
    const fail401s = apiPhp.match(/fail\(401,/g) ?? [];
    expect(fail401s.length).toBeGreaterThan(0);
    expect(authAudits.length).toBe(fail401s.length);
  });
});

describe('api.php 语法', () => {
  it.skipIf(!hasPhp)('php -l 通过', () => {
    expect(() => execFileSync('php', ['-l', apiPhpPath])).not.toThrow();
  });
});
