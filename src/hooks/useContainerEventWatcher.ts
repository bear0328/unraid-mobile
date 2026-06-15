// 【阶段 P2-Webhook - 2026-06-17 续 34-7】容器事件监听
// 全局挂载在 App.tsx;轮询容器列表,状态由 running -> 非 running 时触发 webhook
// 首次加载不触发(需要至少一次 baseline)
// 60s 同容器冷却
// 【续 37-2】同时 push 到通知中心
// 【续 39-3】改用通用 useResourcePoller,删除 50+ 行重复 pattern
// 【续 45.3 2026-06-28】删掉 mount 时无条件 api.getSystemInfo() 调用 ——
// 它跟 Dashboard 的 getSystemInfo 重复,且无 skipInitialIf 保护,65s 后刷新必发 1 个多余 graphql。
// 改成在 onChange(webhook 发送时)从 dashboardCache 读 systemInfo.name,0 graphql 副作用。
import { useApiConfig, useUnraidApi } from './useUnraidApi';
import { sendWebhook, useWebhookConfig } from '../utils/webhook';
import { pushNotification } from '../utils/notifications';
import { useResourcePoller } from './useResourcePoller';
import { usePollInterval } from './usePollInterval';
import { getCache, getCacheKey } from '../services/unraidApi/cache';
import { loadDashboardCache } from '../components/dashboard/dashboardCache';

const COOLDOWN_MS = 60_000;
const BASELINE_KEY = 'unraid-mobile-webhook-baseline';
const COOLDOWN_KEY = 'unraid-mobile-webhook-cooldown';

export function useContainerEventWatcher() {
  const api = useUnraidApi();
  const { isConfigured } = useApiConfig();
  const [cfg] = useWebhookConfig();
  const pollInterval = usePollInterval();

  useResourcePoller({
    enabled: !!isConfigured && !!api && cfg.enabled,
    fetcher: async () => (api ? await api.getDockerContainers() : []),
    keyOf: (c) => c.name,
    stateOf: (c) => c.state,
    baselineKey: BASELINE_KEY,
    cooldownKey: COOLDOWN_KEY,
    cooldownMs: COOLDOWN_MS,
    pollMs: pollInterval,
    // 【续 45 2026-06-26】命中 'containers' namespace cache → 跳过 mount 立即 tick,
    // 避免与 useContainersData 重复 fetch 唤醒 disk
    skipInitialIf: () => getCache<unknown>(getCacheKey('containers')) !== null,
    // 【续 45 2026-06-26】interval tick 也尊重 cache:60s 内跳过 fetch
    shouldSkipTick: () => getCache<unknown>(getCacheKey('containers')) !== null,
    onChange: (c, prev) => {
      // 【续 50 B6】方向过滤:只在"停止"(prev=running → 当前非 running)时通知。
      // useResourcePoller 对任何 prev!==cur 都回调,不过滤的话启动(stopped→running)
      // 也会报"容器停止"误报
      if (prev !== 'running' || c.state === 'running') return;
      const detail = `${c.name} → ${c.state}`;
      // 【续 45.3 2026-06-28】从 dashboardCache 读 server name,避免 mount 时发 getSystemInfo
      const serverName = loadDashboardCache()?.systemInfo?.name || 'unRAID Server';
      void sendWebhook(cfg, {
        container: c.name,
        state: c.state,
        server: serverName,
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
      });
      pushNotification({
        kind: 'container',
        title: `容器停止: ${c.name}`,
        detail,
        link: '/containers',
        level: c.state === 'exited' || c.state === 'stopped' ? 'warning' : 'info',
      });
    },
  });
}
