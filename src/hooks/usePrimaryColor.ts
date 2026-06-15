// 【阶段 P2-主题色 - 2026-06-17 续 34-3】自定义主色
// 思路:Tailwind primary-* 编译期固定,运行时换色需动态注入 CSS
// 策略:document.head 插入 <style id="unraid-mobile-primary"> 覆盖 .bg-primary-*.text-primary-* 等类
// 这样无需改 tailwind.config,所有现有的 bg-primary-600 按钮都跟着变
// LS 持久化 + 订阅通知 + 默认蓝色 #3b82f6
import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'unraid-mobile-primary-color';
const STYLE_ID = 'unraid-mobile-primary-style';
export const DEFAULT_COLOR = '#3b82f6';

export const PRESET_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#6366f1', // indigo
] as const;

function getStored(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_COLOR;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_COLOR;
}

function setStored(color: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, color);
  } catch {
    /* ignore */
  }
}

/** 把 hex 转成 100/200/.../900 的色阶(简单 light/dark 派生,基于 HSL) */
function deriveScale(
  hex: string
): Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string> {
  // 解析 hex → RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // RGB → HSL
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb),
    min = Math.min(rr, gg, bb);
  const l: number = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      case bb:
        h = (rr - gg) / d + 4;
        break;
    }
    h /= 6;
  }
  // 派生 9 个色阶(每个 L 调整,饱和度略调)
  function hslToHex(h: number, s: number, l: number): string {
    function hue2rgb(p: number, q: number, t: number) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return (
      '#' +
      [r, g, b]
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    );
  }
  return {
    50: hslToHex(h, s, 0.96),
    100: hslToHex(h, s, 0.92),
    200: hslToHex(h, s, 0.84),
    300: hslToHex(h, s, 0.72),
    400: hslToHex(h, s, Math.min(l + 0.15, 0.7)),
    500: hslToHex(h, s, l),
    600: hslToHex(h, s, Math.max(l - 0.08, 0.35)),
    700: hslToHex(h, s, Math.max(l - 0.16, 0.28)),
    800: hslToHex(h, s, Math.max(l - 0.22, 0.22)),
    900: hslToHex(h, s, Math.max(l - 0.28, 0.18)),
  };
}

function generateCss(hex: string): string {
  const scale = deriveScale(hex);
  const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
  let css = ':root{';
  for (const k of keys) css += `--primary-${k}:${scale[k]};`;
  css += '}';
  // 覆盖 tailwind primary 类
  for (const k of keys) {
    css += `.bg-primary-${k}{background-color:var(--primary-${k})!important}`;
    css += `.text-primary-${k}{color:var(--primary-${k})!important}`;
    css += `.border-primary-${k}{border-color:var(--primary-${k})!important}`;
    css += `.ring-primary-${k}{--tw-ring-color:var(--primary-${k})!important}`;
    css += `.from-primary-${k}{--tw-gradient-from:var(--primary-${k})!important}`;
    css += `.to-primary-${k}{--tw-gradient-to:var(--primary-${k})!important}`;
    css += `.placeholder-primary-${k}::placeholder{color:var(--primary-${k})!important}`;
  }
  // hover variants
  for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) {
    css += `.hover\\:bg-primary-${String(k).replace(/(\d)/, '\\$1')}:hover{background-color:var(--primary-${k})!important}`;
  }
  return css;
}

function applyColor(hex: string) {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = generateCss(hex);
}

// 初始化:模块加载时就应用(避免首次渲染闪烁)
applyColor(getStored());

// 订阅(便于其他组件监听变化)
type Listener = (color: string) => void;
const listeners = new Set<Listener>();

function notify(color: string) {
  for (const fn of listeners) {
    try {
      fn(color);
    } catch {
      /* ignore */
    }
  }
}

export function setPrimaryColor(color: string) {
  setStored(color);
  applyColor(color);
  notify(color);
}

/** 【续 42.5 2026-06-19】暴露 applyColor 供组件同步触发(避免 useToast/notify 异步时丢变更) */
export function applyPrimaryColor(color: string) {
  applyColor(color);
}

export function subscribePrimaryColor(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(getStored());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(fn);
  };
}

export function usePrimaryColor() {
  const [color, setColor] = useState(getStored);

  useEffect(() => {
    return subscribePrimaryColor((c) => {
      setColor(c);
      // 【续 42.5 2026-06-19】订阅时也重新 apply 一次,确保动态注入的 style 元素存在
      // (iOS Safari PWA 模式下,模块加载时 applyColor 可能没跑就被 GC 掉)
      applyColor(c);
    });
  }, []);

  const update = useCallback((newColor: string) => {
    setPrimaryColor(newColor);
  }, []);

  const reset = useCallback(() => {
    setPrimaryColor(DEFAULT_COLOR);
  }, []);

  return useMemo(
    () => ({ color, update, reset, presets: PRESET_COLORS, defaultColor: DEFAULT_COLOR }),
    [color, update, reset]
  );
}
