// 【续 88 2026-08-08】install-compose-api.sh 回归:
//   1. go 钩子新增 .op-running 残留锁清理(projects 在 flash 盘持久,重启/被杀后残留会永久 409)
//   2. go 钩子两条 cp 恢复行都容错(2>/dev/null || true)
//   3. 幂等:新加的行纳入 sed 清理模式,重复安装不累积
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(dir, 'install-compose-api.sh');
const script = readFileSync(scriptPath, 'utf-8');

// go 钩子 heredoc 全文(逐行原样,供内容与模拟测试用)
const hook = script.match(/cat >> "\$GO_FILE" << 'EOF'\n([\s\S]*?)\nEOF/)?.[1] ?? '';
// sed 清理段(含行接续,到 "$GO_FILE" 为止)
const sedCmd = script.match(/sed -i\.unraid-mobile-bak[\s\S]*?"\$GO_FILE"/)?.[0] ?? '';

let tmpDir = '';
afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = '';
});

describe('install-compose-api.sh go 钩子(续 88)', () => {
  it('bash -n 语法通过', () => {
    expect(() => execFileSync('bash', ['-n', scriptPath])).not.toThrow();
  });

  it('钩子含 .op-running 残留锁清理,路径与 api.php PROJECTS_DIR 一致', () => {
    expect(hook).not.toBe('');
    expect(hook).toContain('rm -f /boot/config/plugins/compose.manager/projects/*/.op-running');
    const apiPhp = readFileSync(path.join(dir, 'api.php'), 'utf-8');
    expect(apiPhp).toContain(
      "const PROJECTS_DIR = '/boot/config/plugins/compose.manager/projects';"
    );
  });

  it('两条 cp 恢复行都容错(2>/dev/null || true)', () => {
    const cpLines = hook.split('\n').filter((l) => l.startsWith('cp '));
    expect(cpLines.length).toBe(2);
    for (const line of cpLines) {
      expect(line).toContain('2>/dev/null || true');
    }
  });

  it('幂等:模拟 go 文件跑脚本内 sed 段,钩子行全部可清除', () => {
    expect(sedCmd).not.toBe('');
    tmpDir = mkdtempSync(path.join(tmpdir(), 'go-hook-'));
    const goFile = path.join(tmpDir, 'go');
    const original = '#!/bin/bash\n# 用户已有行不动\nls /boot\n';
    writeFileSync(goFile, original + hook + '\n');
    execFileSync('bash', ['-c', `GO_FILE="${goFile}"\n${sedCmd}`]);
    expect(readFileSync(goFile, 'utf-8')).toBe(original);
  });
});
