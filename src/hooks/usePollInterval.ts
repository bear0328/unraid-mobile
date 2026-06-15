// 【续 46 2026-07-12】读取全局轮询间隔(ms)的 React hook
// 订阅 pollInterval 变更事件 + 跨 tab storage 事件,配置变化后自动重渲染,
// 让 usePolling/useResourcePoller/useMultiContainerStats 的 delay 随之更新并重启 interval。
import { useEffect, useState } from 'react';
import { getPollInterval, subscribePollInterval } from '../utils/pollInterval';

/**
 * 返回当前轮询间隔(ms)。配置变化(本 tab setPollInterval 或跨 tab storage)时自动更新。
 */
export function usePollInterval(): number {
  const [interval, setIntervalMs] = useState<number>(() => getPollInterval());
  useEffect(() => {
    return subscribePollInterval(() => setIntervalMs(getPollInterval()));
  }, []);
  return interval;
}
