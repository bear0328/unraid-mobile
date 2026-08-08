// 【续 88 2026-08-08】unRAID 模板回归:WebUI 的 [PORT:x] 按容器端口
// (Port 类 Config 的 Target)替换,本模板容器端口是 80,不是宿主默认 3999
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(path.join(dir, 'unraid-mobile.xml'), 'utf-8');

describe('templates/unraid-mobile.xml(续 88)', () => {
  it('WebUI 占位符指向容器端口 80', () => {
    expect(xml).toContain('<WebUI>http://[IP]:[PORT:80]/</WebUI>');
    expect(xml).not.toContain('[PORT:3999]');
  });

  it('存在 Target=80 的 Port 映射(宿主默认 3999 → 容器 80)', () => {
    expect(xml).toMatch(/<Config[^>]*Target="80"[^>]*Type="Port"[^>]*>3999<\/Config>/);
  });

  it('XML 整体可解析', () => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });
});
