// 【续 55 商业化】Pro 状态 hook(useSyncExternalStore 订阅 license 状态)
import { useSyncExternalStore } from 'react';
import { isPro, subscribeLicense } from '../services/license';

export function usePro(): boolean {
  return useSyncExternalStore(subscribeLicense, isPro, () => false);
}
