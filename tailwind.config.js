/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      // 【续 65】z-index 分层常量(数值与原魔法数字一致,零视觉回归):
      // dropdown=40 下拉/局部吸顶条, sticky=50 顶栏/底栏/普通 Modal,
      // banner=60 顶部横幅, overlay=80 底部抽屉/灯箱/编辑器, toast=100 全局搜索/命令面板/Toast
      zIndex: {
        dropdown: '40',
        sticky: '50',
        banner: '60',
        overlay: '80',
        toast: '100',
      },
    },
  },
  plugins: [],
}
