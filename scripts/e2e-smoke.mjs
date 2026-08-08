// 【续 88 2026-08-08】E2E 冒烟 — 对 dev 实例真实浏览器过主流程 + 环境相关修复点验证
//
// 用法(secrets 走环境变量,不入库):
//   SMOKE_APIKEY=<unRAID apiKey> SMOKE_DAVPASS=<dav/log 密码> SMOKE_LICENSE=<Pro key> \
//   node scripts/e2e-smoke.mjs
// 可选:
//   SMOKE_BASE(默认 http://192.168.6.140:3998)
//   SMOKE_RESTART_CONTAINER=<容器名>  启用「重启 toast 三段式」测试(会真实重启该容器,慎选)
//
// 覆盖(自动化测不到、必须真实环境的点):
//   1. 各页加载:无 pageerror / 无 console error / 无 error toast
//   2. license 正向:真 key 激活态可见 + Compose tab 可用(Pro 门开)
//   3. license 绑机竞态(续 88 P1-3):现场签一个绑他机(假 guid)的 key,冷启动断言 mismatch
//      提示出现且 Pro 门锁 —— 真实 initLicense 时序,非 mock
//   4. api.php 409 并发锁(续 88 P1-5):ssh 预置 .op-running → PUT restart 断言 409
//      「该栈有操作正在进行中」(锁预置故 docker 零副作用,测完清锁)
//   5. (可选)容器重启 toast 三段式:开始 info → 完成 success
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.SMOKE_BASE || 'http://192.168.6.140:3998';
const APIKEY = process.env.SMOKE_APIKEY || '';
const DAVPASS = process.env.SMOKE_DAVPASS || '';
const LICENSE = process.env.SMOKE_LICENSE || '';
const RESTART_CONTAINER = process.env.SMOKE_RESTART_CONTAINER || '';
const SSH = ['ssh', '-i', `${process.env.HOME}/.ssh/mac_unraid_key`, '-p', '222', '-o', 'BatchMode=yes', 'root@192.168.6.140'];
const OUT = 'test-results/e2e';

if (!APIKEY) {
  console.error('需要环境变量: SMOKE_APIKEY(SMOKE_DAVPASS / SMOKE_LICENSE 缺省时对应测试跳过)');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`FAIL  ${name}\n      ${String(e.message || e).split('\n')[0]}`);
  }
}

/** 预置 localStorage(等价手工配好设置页),license 参数可覆盖 */
async function newPage(browser, { license = LICENSE, track = [] } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(
    ({ apikey, davpass, lic }) => {
      localStorage.setItem(
        'unraid-mobile-servers',
        JSON.stringify([
          { id: 'srv-1', name: 'Tower', serverUrl: 'http://192.168.6.140', color: '#3b82f6' },
        ])
      );
      localStorage.setItem('unraid-mobile-active-server', 'srv-1');
      localStorage.setItem('unraid-mobile-api-key-srv-1', apikey);
      localStorage.setItem('unraid-mobile-server-url', 'http://192.168.6.140');
      localStorage.setItem('unraid-mobile-api-key', apikey);
      if (lic) localStorage.setItem('unraid-mobile-license', lic);
      if (davpass) {
        localStorage.setItem('unraid-mobile-dav-password', davpass);
        localStorage.setItem('unraid-mobile-log-password', davpass);
      }
    },
    { apikey: APIKEY, davpass: DAVPASS, lic: license }
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => track.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Download the React DevTools/i.test(m.text())) {
      const url = m.location()?.url || '';
      // 【续 88】/files/cache/ 403 是 healthCheck 刻意探活(403=宿主在线且不唤盘),非错误
      if (url.includes('/files/cache/')) return;
      track.push(`console: ${m.text()} @ ${url}`);
    }
  });
  return { ctx, page, track };
}

async function assertNoErrorToast(page, ms) {
  const alerts = page.locator('[role="alert"]');
  await page.waitForTimeout(ms);
  const texts = await alerts.allTextContents();
  const bad = texts.filter((t) => /失败|错误|未授权|无效|timeout|超时/.test(t));
  if (bad.length) throw new Error(`error toast: ${bad[0]}`);
}

const browser = await chromium.launch();

// ---------- 1. 各页加载 ----------
const pages = [['/', 'Dashboard'], ['/containers', 'Containers'], ['/settings', 'Settings']];
if (DAVPASS) pages.push(['/shares', 'Shares'], ['/logs', 'Logs']);
for (const [path, name] of pages) {
  await check(`页面加载 ${name} (${path})`, async () => {
    const { ctx, page, track } = await newPage(browser);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(path === '/' ? 12000 : 8000); // unraid-api 冷启动 4-5s
    await assertNoErrorToast(page, 500);
    if (track.length) {
      await page.screenshot({ path: `${OUT}/fail-${name}.png` });
      throw new Error(track[0]);
    }
    await ctx.close();
  });
}

// ---------- 2. license 正向(Pro 门开) ----------
if (LICENSE) {
  await check('license 正向:设置页激活态 + Compose tab 可用', async () => {
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
    await page.locator('#license-section').scrollIntoViewIfNeeded();
    await page.waitForTimeout(6000); // 验签 + 绑机检查(HTTP 下 verifyP256 纯 JS,仍给足)
    if (!(await page.locator('#license-section').textContent()).includes('解除绑定'))
      throw new Error('license 区未见激活态(解除绑定按钮)');
    await page.goto(BASE + '/containers', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.click('text=Compose', { timeout: 8000 });
    await page.waitForTimeout(5000);
    const body = await page.textContent('body');
    if (body.includes('Compose 后端未安装')) throw new Error('Compose 显示后端未安装(Pro 门未开?)');
    await ctx.close();
  });
}

// ---------- 3. license 绑机竞态:绑他机的 key 冷启动必须 mismatch ----------
// (不需要真实 license:bad key 用 gen-license 现场签,只需 APIKEY 让绑机检查能查 vars.flashGuid)
await check('license 竞态:绑他机 key 冷启动 → mismatch + Pro 门锁', async () => {
    // 现场签一个绑假 guid 的 key(用项目自己的签发工具,私钥本地)
    const out = execFileSync('node', ['scripts/gen-license.mjs', 'e2e-smoke@test.local', '--guid', '0000-0000-0000-0000'], { encoding: 'utf8' });
    const badKey = out.match(/UMPRO1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    if (!badKey) throw new Error('gen-license 未输出 key');
    const { ctx, page } = await newPage(browser, { license: badKey });
    await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
    await page.locator('#license-section').scrollIntoViewIfNeeded();
    // 冷启动竞态窗口:initLicense 异步,绑机检查在 subscribeLicense 翻 active 后重跑,给足 20s
    await page.waitForTimeout(20000);
    const lic = await page.locator('#license-section').textContent();
    if (!lic.includes('绑定另一台 unRAID 服务器'))
      throw new Error(`未见 mismatch 提示(实际: ${lic.slice(0, 80)}…)`);
    if (lic.includes('解除绑定')) throw new Error('mismatch 后仍显示激活态(解除绑定)');
    await ctx.close();
});

// ---------- 4. api.php 409 并发锁 ----------
await check('api.php 并发锁:预置 .op-running → 同步操作 409', async () => {
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': APIKEY };
  const listRes = await fetch(`${BASE}/compose-api/?action=list`, { headers });
  const list = await listRes.json();
  const stack = list?.data?.stacks?.[0]?.name || list?.data?.[0]?.name;
  if (!stack) throw new Error(`拿不到栈列表(${listRes.status})`);
  const lockDir = `/boot/config/plugins/compose.manager/projects/${stack}`;
  execFileSync(SSH[0], [...SSH.slice(1), `touch ${lockDir}/.op-running`]);
  try {
    const res = await fetch(`${BASE}/compose-api/`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ action: 'restart', name: stack }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 409) throw new Error(`期望 409 实际 ${res.status}(${JSON.stringify(body).slice(0, 120)})`);
    if (!String(body.error || '').includes('进行中')) throw new Error(`409 文案不对: ${body.error}`);
  } finally {
    execFileSync(SSH[0], [...SSH.slice(1), `rm -f ${lockDir}/.op-running`]);
  }
});

// ---------- 5. (可选)容器重启 toast 三段式 ----------
if (RESTART_CONTAINER) {
  await check(`重启 toast 三段式(${RESTART_CONTAINER})`, async () => {
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE + '/containers', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const row = page.locator('div', { hasText: RESTART_CONTAINER }).last();
    await row.locator('button', { hasText: '重启' }).first().click({ timeout: 8000 });
    await page.locator('[role="alert"]', { hasText: `开始重启「${RESTART_CONTAINER}」` }).waitFor({ timeout: 10000 });
    await page.locator('[role="alert"]', { hasText: `「${RESTART_CONTAINER}」重启完成` }).waitFor({ timeout: 45000 });
    await ctx.close();
  });
}

await browser.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
process.exit(failed.length ? 1 : 0);
