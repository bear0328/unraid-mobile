// 【阶段 1 P0 2026-06-15】ThemeContext 导出对象会被 fast-refresh 报警,
// 用 file-level disable 关掉(useTheme 已拆到 useTheme.ts 单独 hook 文件)
// 【阶段 P2-高对比度 - 2026-06-17 续 33-7】加 hc-light / hc-dark 主题(无障碍)
// 【阶段 P2-系统主题 - 2026-06-17 续 36-1】auto 模式:跟 prefers-color-scheme,用户手动切后关 auto
/* eslint-disable react-refresh/only-export-components */
import { createContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'hc-light' | 'hc-dark';

const THEME_CYCLE: Theme[] = ['light', 'dark', 'hc-light', 'hc-dark'];
const LS_THEME = 'theme';
const LS_AUTO = 'theme-auto';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  /** 是否跟系统(默认 true;用户手动选过会变 false) */
  auto: boolean;
  setAuto: (v: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => undefined,
  setTheme: () => undefined,
  auto: true,
  setAuto: () => undefined,
});

function systemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readAuto(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(LS_AUTO);
  // 默认 true;只有显式存 'false' 才关闭
  return v === null ? true : v === 'true';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 初始:有 LS 主题且未开 auto → 用 LS;否则用系统偏好
  const [auto, setAutoState] = useState<boolean>(readAuto);
  const [theme, setTheme] = useState<Theme>(() => {
    const a = readAuto();
    if (!a) {
      const stored = localStorage.getItem(LS_THEME) as Theme | null;
      if (stored && THEME_CYCLE.includes(stored)) return stored;
    }
    return systemPref();
  });

  // auto 模式下,跟系统偏好变化
  useEffect(() => {
    if (!auto) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(systemPref());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [auto]);

  // 应用主题到 <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'hc-light', 'hc-dark', 'hc');
    if (theme === 'dark' || theme === 'hc-dark') {
      root.classList.add('dark');
    }
    if (theme === 'hc-light' || theme === 'hc-dark') {
      root.classList.add('hc');
    }
    // auto 模式下不写 LS(每次进都重新跟系统);手动选后写
    if (!auto) {
      localStorage.setItem(LS_THEME, theme);
    } else {
      localStorage.removeItem(LS_THEME);
    }
  }, [theme, auto]);

  function setAuto(v: boolean) {
    setAutoState(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_AUTO, String(v));
    if (v) {
      // 切回 auto:立即跟系统
      setTheme(systemPref());
    }
  }

  const toggleTheme = () => {
    // 手动切 = 关 auto
    if (auto) setAuto(false);
    setTheme((prev) => {
      const idx = THEME_CYCLE.indexOf(prev);
      return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, auto, setAuto }}>
      {children}
    </ThemeContext.Provider>
  );
}
