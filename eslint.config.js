// 【阶段 1 P0 - 2026-06-15】ESLint v9 flat config
// 王洪涛 14:21 拍板方向
// 目标:统一代码风格 + 兜底 any 滥用 + React Hooks 误用
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.config.js',
      '*.config.ts',
      'eslint.config.js',
      'scripts/**',
      'public/**',
      '.tmp/**',
      'nginx/.davpasswd',
      'nginx/.logpasswd',
    ],
  },
  // 基础推荐
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 浏览器代码
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React 17+ 不需要显式 import React
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TS: 不许 any(硬卡)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 不强制 import order(交给 Prettier)
      'import/order': 'off',
      // console 在 dev 阶段允许
      'no-console': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  // 最后插入 prettier(关掉会与 prettier 冲突的规则)
  prettier,
  // 【阶段 1 P0 2026-06-15】unraidApi.ts 历史代码 narrowing 成本太高,允许 any
  // 其他文件强卡 any,只有这个服务文件放行
  {
    files: ['src/services/unraidApi.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
