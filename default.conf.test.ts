// 【续 88 2026-08-08】default.conf 安全加固回归 + 根 nginx.conf 退役确认:
//   1. server 块: server_tokens off + X-Content-Type-Options nosniff
//   2. /dav/ COPY/MOVE 的 Destination 头含 '..' 返回 400(防路径穿越)
//   3. 现有 location(/files /dav/ /compose-api/ 等)不被破坏
//   4. 根目录过时 nginx.conf(dev simple 遗物)已删除
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const conf = readFileSync(path.join(dir, 'default.conf'), 'utf-8');

// /dav/ location 到下一个 location 之间的文本,用于块内断言
const davBlock = conf.slice(
  conf.indexOf('location ^~ /dav/'),
  conf.indexOf('location ^~ /var/log/')
);

describe('default.conf 安全加固(续 88)', () => {
  it('隐藏 nginx 版本号', () => {
    expect(conf).toContain('server_tokens off;');
  });

  it('禁 MIME 嗅探(always 含错误响应)', () => {
    expect(conf).toContain('add_header X-Content-Type-Options nosniff always;');
  });

  it('/dav/ 拒绝含 .. 的 Destination 头(COPY/MOVE 防穿越)', () => {
    expect(davBlock).toContain("$http_destination ~* '\\.\\.'");
    expect(davBlock).toContain('return 400;');
  });

  it('/dav/ 现有能力不破坏(DAV 方法/鉴权/挂载)', () => {
    expect(davBlock).toContain('alias /mnt/user/;');
    expect(davBlock).toContain('dav_methods PUT DELETE MKCOL COPY MOVE;');
    expect(davBlock).toContain('auth_basic_user_file /etc/nginx/.davpasswd;');
  });

  it('其他关键 location 保持存在', () => {
    for (const mark of [
      'location /files',
      'location ^~ /compose-api/',
      'location /graphql',
      'location /config/',
    ]) {
      expect(conf).toContain(mark);
    }
  });

  it('根目录过时 nginx.conf 已删除(引用它的 docker-compose.simple.yml 为 dev 遗物)', () => {
    expect(existsSync(path.join(dir, 'nginx.conf'))).toBe(false);
  });

  it('/files 无 index 指令(续 100:含 index.html 的目录必须走 autoindex,防同源 HTML 执行)', () => {
    const filesBlock = conf.slice(conf.indexOf('location /files'), conf.indexOf('location ^~ /dav/'));
    expect(filesBlock).toContain('autoindex on;');
    // 断指令行(注释里提到该字符串不算)
    expect(filesBlock).not.toMatch(/^\s*index\s+index\.html/m);
  });
});
