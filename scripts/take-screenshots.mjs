// 【续 61 2026-07-22】README 截图工具 — 对 dev 实例拍移动端截图到 docs/screenshots/
//
// 用法( secrets 走环境变量,不入库):
//   SHOT_APIKEY=<unRAID apiKey> SHOT_DAVPASS=<dav/log 密码> SHOT_LICENSE=<Pro key> \
//   node scripts/take-screenshots.mjs
// 可选: SHOT_BASE(默认 http://192.168.6.140:3998) / SHOT_OUT(默认 docs/screenshots)
//
// 原理:addInitScript 预置 localStorage(服务器配置/apiKey/license/dav/log 密码),
// 等价于用户手工配好设置页;逐页导航等待渲染;截屏前跑 sanitize(文本替换脱敏,
// 真实容器/共享名/IP 等替换为通用名,版式不动)。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOT_BASE || 'http://192.168.6.140:3998';
const APIKEY = process.env.SHOT_APIKEY || '';
const DAVPASS = process.env.SHOT_DAVPASS || '';
const LICENSE = process.env.SHOT_LICENSE || '';
const OUT = process.env.SHOT_OUT || 'docs/screenshots';

if (!APIKEY || !DAVPASS || !LICENSE) {
  console.error('需要环境变量: SHOT_APIKEY / SHOT_DAVPASS / SHOT_LICENSE');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// ---------- 脱敏规则(按页应用,长 key 在前先替换) ----------
const COMMON_RULES = [
  ['192.168.6.140', '192.168.1.100'],
  ['owner@bear0328.local', 'user@example.com'],
  ['346D-567', 'XXXX-XXX'],
];
const CONTAINERS_RULES = [
  ['hermes-hermes-gateway', 'jellyfin/jellyfin:latest'],
  ['marcobaobao/yt-dlp-webui', 'filebrowser/filebrowser:latest'],
  ['jxxghp/moviepilot-v2:latest', 'homeassistant/home-assistant:latest'],
  ['xylplm/media-saber:dev', 'nextcloud:latest'],
  ['moviepilot_full-moviepilot-1', 'homeassistant'],
  ['hermes-gateway', 'jellyfin'],
  ['yt-dlp-webui', 'filebrowser'],
  ['ms-pgsql', 'postgres'],
  ['ms-redis', 'redis'],
  ['msgo', 'nextcloud'],
];
const COMPOSE_RULES = [
  ['CookieCloud', 'vaultwarden'],
  ['clouddrive', 'plex'],
  ['db_online', 'mariadb'],
  ['hermes', 'jellyfin'],
];
const SHARES_RULES = [
  ['soundbank', 'docs'],
  ['sfx', 'backup'],
  ['strm', 'misc'],
];

/** 文本节点级替换(保留 DOM 结构/版式) + input value 替换 */
async function sanitize(page, rules) {
  await page.evaluate((rs) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n = walker.nextNode();
    while (n) {
      nodes.push(n);
      n = walker.nextNode();
    }
    for (const t of nodes) {
      let v = t.nodeValue || '';
      for (const [from, to] of rs) v = v.split(from).join(to);
      if (v !== t.nodeValue) t.nodeValue = v;
    }
    for (const inp of Array.from(document.querySelectorAll('input'))) {
      let v = inp.value;
      for (const [from, to] of rs) v = v.split(from).join(to);
      if (v !== inp.value) inp.value = v;
    }
  }, rules);
}

/** Logs 页专用:日志区整体替换为编造的通用行(真实行含 sshd 会话/IP 等;
 * 日志是虚拟滚动,行结构不稳定,直接整容器 textContent + pre-wrap 最稳) */
async function sanitizeLogs(page) {
  await page.evaluate(() => {
    const box = document.querySelector('div.bg-gray-900.font-mono');
    if (!box) return;
    const samples = [
      'emhttpd: read SMART /dev/sdb',
      'emhttpd: spinning down /dev/sdc',
      'nginx: 192.168.1.100 - GET /healthz 200 15',
      'kernel: ata2.00: configured for UDMA/133',
      'crond[2413]: (root) CMD run-parts /etc/cron.hourly',
      'emhttpd: array Started, 4 disks online',
      'ntpd[890]: clock synchronized to 192.168.1.1',
      'dockerd: container started jellyfin',
      'nginx: 192.168.1.100 - GET /plugins/dynamix/Dashboard.page 200',
      'emhttpd: shcmd (117): /usr/local/emhttp/webGui/scripts/scan',
    ];
    const lines = [];
    for (let i = 0; i < 40; i++) {
      const total = 19 * 60 + 10 + i * 3;
      const mm = String(Math.floor(total / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      lines.push(`09:${mm}:${ss}  ${samples[i % samples.length]}`);
    }
    box.textContent = lines.join('\n');
    box.style.whiteSpace = 'pre-wrap';
    box.style.color = '#9ca3af';
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 14 逻辑分辨率
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});

await ctx.addInitScript(
  ({ apikey, davpass, license }) => {
    localStorage.setItem(
      'unraid-mobile-servers',
      JSON.stringify([
        { id: 'srv-1', name: 'Tower', serverUrl: 'http://192.168.6.140', color: '#3b82f6' },
      ])
    );
    localStorage.setItem('unraid-mobile-active-server', 'srv-1');
    localStorage.setItem('unraid-mobile-api-key-srv-1', apikey);
    // getApiConfig() 只读旧格式单服务器 key(config.ts:274),两个格式都得写
    localStorage.setItem('unraid-mobile-server-url', 'http://192.168.6.140');
    localStorage.setItem('unraid-mobile-api-key', apikey);
    localStorage.setItem('unraid-mobile-license', license);
    localStorage.setItem('unraid-mobile-dav-password', davpass);
    localStorage.setItem('unraid-mobile-log-password', davpass);
  },
  { apikey: APIKEY, davpass: DAVPASS, license: LICENSE }
);

const page = await ctx.newPage();

async function shot(path, file, waitMs, clean) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
  if (clean) await clean();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`✓ ${file}`);
}

// unraid-api 冷启动 4-5s,Dashboard 给足时间
await shot('/', '01-dashboard.png', 12000, () => sanitize(page, COMMON_RULES));
await shot('/containers', '02-containers.png', 8000, () =>
  sanitize(page, [...COMMON_RULES, ...CONTAINERS_RULES])
);

// Compose tab(Pro):容器页内 tab
await page.goto(BASE + '/containers', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
try {
  await page.click('text=Compose', { timeout: 5000 });
  await page.waitForTimeout(6000);
  await sanitize(page, [...COMMON_RULES, ...COMPOSE_RULES]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/03-compose.png` });
  console.log('✓ 03-compose.png');
} catch {
  console.log('✗ Compose tab 未找到,跳过');
}

await shot('/shares', '04-shares.png', 8000, () =>
  sanitize(page, [...COMMON_RULES, ...SHARES_RULES])
);
await shot('/logs', '05-logs.png', 8000, () => sanitizeLogs(page));

// 设置页 License 区(Pro 激活态 + 绑定信息)
await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.locator('#license-section').scrollIntoViewIfNeeded();
await sanitize(page, COMMON_RULES);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/06-settings-license.png` });
console.log('✓ 06-settings-license.png');

await browser.close();
console.log(`全部完成 → ${OUT}/`);
