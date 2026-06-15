// 【续 46 2026-07-12】全局轮询间隔配置
// 让用户在 Settings 里调节 Dashboard / 容器数据的刷新频率(默认 30s,范围 10s-2min)。
// 数据走 localStorage + 自定义事件广播,各 polling hook 订阅后热更新 delay,
// 自动重启 interval(usePolling/useResourcePoller 的 effect 已把 delay/pollMs 纳入 deps)。
export const POLL_INTERVAL_KEY = 'unraid-mobile-poll-interval';
export const DEFAULT_POLL_INTERVAL = 30_000;
export const MIN_POLL_INTERVAL = 10_000;
export const MAX_POLL_INTERVAL = 120_000;

const CHANGE_EVENT = 'unraid-mobile-poll-interval-change';

/** 读当前轮询间隔(ms),clamp 到 [MIN, MAX],无效值回退 DEFAULT */
export function getPollInterval(): number {
  if (typeof window === 'undefined') return DEFAULT_POLL_INTERVAL;
  try {
    const raw = window.localStorage.getItem(POLL_INTERVAL_KEY);
    if (!raw) return DEFAULT_POLL_INTERVAL;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_INTERVAL;
    return Math.min(MAX_POLL_INTERVAL, Math.max(MIN_POLL_INTERVAL, Math.round(n)));
  } catch {
    return DEFAULT_POLL_INTERVAL;
  }
}

/** 写轮询间隔(ms),clamp + 广播变更事件 */
export function setPollInterval(ms: number): void {
  const clamped = Math.min(MAX_POLL_INTERVAL, Math.max(MIN_POLL_INTERVAL, Math.round(ms)));
  try {
    window.localStorage.setItem(POLL_INTERVAL_KEY, String(clamped));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* storage 不可用时忽略 */
  }
}

/** 订阅轮询间隔变更(含跨 tab 的 storage 事件),返回取消订阅函数 */
export function subscribePollInterval(cb: () => void): () => void {
  const handler = () => cb();
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
