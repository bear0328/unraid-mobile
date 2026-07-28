// 【续 74】全局「上次刷新」时间戳
// 所有页签显示同一个刷新时间:任何数据源(Dashboard/容器/compose/日志/分享)
// 真实刷新成功后 markRefreshed(),各页顶部 <LastRefreshText> 订阅同一个值。
// 模式照抄 pollInterval.ts:localStorage + 自定义事件广播 + storage 跨 tab。
const LAST_REFRESH_KEY = 'unraid-mobile-last-refresh';
const CHANGE_EVENT = 'unraid-mobile-last-refresh-change';

/** 记录一次真实刷新(写当前时间戳 + 广播) */
export function markRefreshed(): void {
  try {
    window.localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* storage 不可用时忽略 */
  }
}

/** 读上次刷新时间戳(ms),无记录/损坏值返 null */
export function getLastRefresh(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_REFRESH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 订阅刷新时间变更(含跨 tab 的 storage 事件),返回取消订阅函数 */
export function subscribeLastRefresh(cb: () => void): () => void {
  const handler = () => cb();
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
