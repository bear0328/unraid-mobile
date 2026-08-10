import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
// 【续 104 P1-2】版本号单一来源:package.json(发版时 release.sh 同步),
// 经 define 注入 __APP_VERSION__,Settings「关于」区显示,替代原硬编码 v0.1.0
import { version } from './package.json'

// Vite 5 默认 modulePreload 只在运行时预加载（__vitePreload helper 调用）
// 这导致首次访问有 1 个 RTT waterfall：index.js 解析后才下载 Dashboard chunk
// 这个 plugin 在 dist/index.html 注入 <link rel="modulepreload">，
// 让浏览器在 HTML 解析阶段就并行下载 Dashboard chunk，节省 1 个 RTT
const dashboardPreloadPlugin: Plugin = {
  name: 'dashboard-modulepreload',
  apply: 'build',
  closeBundle() {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html')
    const assetsDir = path.join(process.cwd(), 'dist', 'assets')
    if (!fs.existsSync(indexPath) || !fs.existsSync(assetsDir)) return
    const dashboardFile = fs
      .readdirSync(assetsDir)
      .find(f => f.startsWith('Dashboard-') && f.endsWith('.js'))
    if (!dashboardFile) return
    let html = fs.readFileSync(indexPath, 'utf-8')
    if (html.includes('rel="modulepreload"')) return
    const preloadTag = `<link rel="modulepreload" href="/assets/${dashboardFile}" crossorigin>`
    html = html.replace(
      '<script type="module" crossorigin',
      `${preloadTag}\n    <script type="module" crossorigin`
    )
    fs.writeFileSync(indexPath, html)
  },
}

// 【续 93】构建后把 dist/sw.js 的 __BUILD_HASH__ 替换为入口 bundle hash:
// 每次 build 产物变化 → sw.js 字节变化 → 浏览器 SW 更新检查发现新版
// (配合 default.conf 的 sw.js no-cache 与 main.tsx 的 controllerchange 自动刷新)
const swVersionPlugin: Plugin = {
  name: 'sw-build-hash',
  apply: 'build',
  closeBundle() {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html')
    const swPath = path.join(process.cwd(), 'dist', 'sw.js')
    if (!fs.existsSync(indexPath) || !fs.existsSync(swPath)) return
    const html = fs.readFileSync(indexPath, 'utf-8')
    const match = html.match(/index-([A-Za-z0-9_-]+)\.js/)
    if (!match) return
    let sw = fs.readFileSync(swPath, 'utf-8')
    if (!sw.includes('__BUILD_HASH__')) return
    sw = sw.replaceAll('__BUILD_HASH__', match[1])
    fs.writeFileSync(swPath, sw)
  },
}

export default defineConfig({
  plugins: [react(), dashboardPreloadPlugin, swVersionPlugin],
  define: {
    // 【续 104 P1-2】构建期注入版本号(vitest 也走本 define,测试可见真实版本)
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: true,
    port: 5173
  },
  build: {
    modulePreload: true,
  },
  // 【续 44.1 2026-06-25】vitest 配置:jsdom + 全局 setup(LS 清空、matchMedia polyfill)
  //   - jsdom 必加,否则渲染组件报 document is not defined
  //   - setupFiles 走 src/test/setup.ts(已有 jest-dom 断言 + cleanup)
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // 【续 78】单发 flake 重试 1 次(release.sh 发布链兜底;真实连续失败仍会红)
    retry: 1,
  },
})
