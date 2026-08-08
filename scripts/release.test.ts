// 【续 88 2026-08-08】release.sh 回归:
//   1. git/docker push 走 run_retry(最多 3 次,间隔 10s)
//   2. git commit 不走 run/eval(message 含单引号即语法错误)
//   3. --skip-deploy 时整个冒烟循环跳过
//   4. 冒烟 curl 带 --max-time 15
// run_retry 行为用 stub(run/log/die/sleep)+ 真实 bash 验证,不执行发布流程
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(dir, 'release.sh');
const script = readFileSync(scriptPath, 'utf-8');

// 从脚本抽出 run_retry 函数体(顶格 function 到顶格 })
const retryFn = script.match(/^run_retry\(\) \{[\s\S]*?^\}/m)?.[0] ?? '';

interface BashResult {
  code: number;
  out: string;
}

/** bash -c 执行,不抛异常,带回 exit code 与 stdout */
function runBash(body: string): BashResult {
  try {
    const out = execFileSync('bash', ['-c', body], { encoding: 'utf-8' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, out: String(err.stdout ?? '') };
  }
}

const STUBS = `
log()   { printf '[log] %s\\n' "$*"; }
die()   { printf '[die] %s\\n' "$*"; exit 1; }
sleep() { :; }
${retryFn}
`;

describe('release.sh push 重试(续 88)', () => {
  it('bash -n 语法通过', () => {
    expect(() => execFileSync('bash', ['-n', scriptPath])).not.toThrow();
  });

  it('脚本定义了 run_retry(3 次 + sleep 10)', () => {
    expect(retryFn).not.toBe('');
    expect(retryFn).toContain('for n in 1 2 3');
    expect(retryFn).toContain('sleep 10');
  });

  it('run_retry: 一直失败则调 3 次后中止,日志打印重试次数', () => {
    const r = runBash(`
      ${STUBS}
      calls=0
      run() { calls=$((calls + 1)); echo "call#$calls"; return 1; }
      run_retry "docker push x"
    `);
    expect(r.code).toBe(1);
    expect(r.out).toContain('call#3');
    expect(r.out).not.toContain('call#4');
    expect(r.out).toContain('第 1 次失败');
    expect(r.out).toContain('第 2 次失败');
    expect(r.out).toContain('重试 3 次仍失败');
  });

  it('run_retry: 第 3 次成功则整体成功,不再多调', () => {
    const r = runBash(`
      ${STUBS}
      calls=0
      run() { calls=$((calls + 1)); echo "call#$calls"; [ "$calls" -ge 3 ]; }
      run_retry "git push origin master"
    `);
    expect(r.code).toBe(0);
    expect(r.out).toContain('call#3');
    expect(r.out).not.toContain('call#4');
  });

  it('git/docker 四条 push 全部走 run_retry,不再有裸 run push', () => {
    for (const cmd of [
      'git push origin master',
      'git push origin ${TAG}',
      'docker push ${IMAGE_REPO}:${VERSION}',
      'docker push ${IMAGE_REPO}:latest',
    ]) {
      expect(script).toContain(`run_retry "${cmd}"`);
    }
    expect(script).not.toMatch(/^run "(git|docker) push/m);
  });
});

describe('release.sh git commit 不走 eval(续 88)', () => {
  it('直接双引号调用,message 含单引号也安全', () => {
    expect(script).toContain('git commit -m "v${VERSION}: ${MESSAGE}"');
    expect(script).not.toMatch(/^run "git commit/m);
  });
});

describe('release.sh --skip-deploy 冒烟(续 88)', () => {
  it('SKIP_DEPLOY=true 时整个冒烟循环跳过(不再只 continue DEV_PORT)', () => {
    expect(script).toContain('跳过冒烟(--skip-deploy)');
    expect(script).not.toContain('[ "${port}" = "${DEV_PORT}" ] && continue');
  });

  it('冒烟 curl 带 --max-time 15', () => {
    const curls = script.match(/curl -s --max-time 15 /g) ?? [];
    expect(curls.length).toBe(2);
  });
});
