// 【续 74】订阅全局「上次刷新」时间戳,返回 ms 或 null
import { useSyncExternalStore } from 'react';
import { getLastRefresh, subscribeLastRefresh } from '../utils/lastRefresh';

export function useLastRefresh(): number | null {
  return useSyncExternalStore(subscribeLastRefresh, getLastRefresh, () => null);
}
