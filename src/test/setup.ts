// 【阶段 P2-1 - 2026-06-16 续 11】vitest 全局 setup
// 1. 引入 jest-dom 断言(扩展 toBeInTheDocument 等)
// 2. 每个用例结束自动 cleanup(卸载渲染的 React 树) + 清 localStorage
// 3. 给 jsdom 环境加 Node `global` 别名(测试里常用 vi.spyOn(global, 'fetch'))
// 4. 【续 43 2026-06-20】polyfill window.matchMedia(jsdom 没原生,useInstallPrompt 等 hook 依赖)
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

declare global {
  // Node 全局对象,jsdom 环境下 TS lib 只有 DOM 没有 Node,需要显式声明
  var global: typeof globalThis;
}

// jsdom 没原生 window.matchMedia,useInstallPrompt 等 hook 会 crash,polyfill 永远返 matches: false
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  // 【续 15 - 2026-06-16】清 sessionStorage:graphql cache 也存这里,不清会污染后续测试
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
});
