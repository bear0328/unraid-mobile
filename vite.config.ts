import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

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

export default defineConfig({
  plugins: [react(), dashboardPreloadPlugin],
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
  },
})
