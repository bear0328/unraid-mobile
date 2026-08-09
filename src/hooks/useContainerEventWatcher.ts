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
import {
  CONTAINER_POLL_FLOOR_MS,
  getCache,
  getCacheKey,
  invalidateNamespace,
  isNamespaceFreshWithin,
} from '../services/unraidApi/cache';
import { loadDashboardCache } from '../components/dashboard/dashboardCache';

const COOLDOWN_MS = 60_000;
const BASELINE_KEY = 'unraid-mobile-webhook-baseline';
const COOLDOWN_KEY = 'unraid-mobile-webhook-cooldown';

export function useContainerEventWatcher() {
  const api = useUnraidApi();
  const { isConfigured } = useApiConfig();
  const [cfg] = useWebhookConfig();
  const pollInterval = usePollInterval();
  // 【续 73】与 useContainersData 一致:跟随设置,60s 地板
  const effectiveInterval = Math.max(pollInterval, CONTAINER_POLL_FLOOR_MS);

  useResourcePoller({
    enabled: !!isConfigured && !!api && cfg.enabled,
    fetcher: async () => {
      // 【续 73】tick 放行时先失效 30min namespace cache,否则拿到旧状态,
      // webhook 检测被架空;skipInitialIf/mount 路径不走 fetcher,不受影响
      invalidateNamespace('containers');
      // 【续 91 A1】失败返 null → 抛错走 onError,不把一次失败当"全部容器消失"
      // (否则一轮失败会把所有 running 容器误判停止,群发 webhook/通知)
      const list = api ? await api.getDockerContainers() : [];
      if (!list) throw new Error('getDockerContainers failed');
      return list;
    },
    keyOf: (c) => c.name,
    stateOf: (c) => c.state,
    baselineKey: BASELINE_KEY,
    cooldownKey: COOLDOWN_KEY,
    cooldownMs: COOLDOWN_MS,
    pollMs: effectiveInterval,
    // 【续 45 2026-06-26】命中 'containers' namespace cache → 跳过 mount 立即 tick,
    // 避免与 useContainersData 重复 fetch 唤醒 disk
    skipInitialIf: () => getCache<unknown>(getCacheKey('containers')) !== null,
    // 【续 73】tick 阈值跟随用户设置(60s 地板):cache 年龄 < 有效间隔才跳过
    // (原用 30min TTL 非空即 skip,设置 10-120s 全被架空)
    shouldSkipTick: () => isNamespaceFreshWithin('containers', effectiveInterval),
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
