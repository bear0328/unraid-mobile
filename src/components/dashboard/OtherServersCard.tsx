// 【续 78】多服务器聚合卡(Pro):Dashboard 卡片流末尾列出除 active 外的服务器摘要
// 设计要点:
// - 不动「单 active + 切换」模型,点击卡片 = setActiveServer(现有切换机制,缓存清理自动生效)
// - 每台直连(useProxy=false)轻量 systemInfo;namespace:null + skipCpuTemp ——
//   非 active 数据绝不写共享 'systemInfo' 缓存,compose-api 只代理 active 不跨服务器调
// - 无 key / 超时 / 失败 → 灰色「离线」;轮询跟随全局 pollInterval,tab 隐藏暂停
import { useCallback, useState } from 'react';
import { Server as ServerIcon } from 'lucide-react';
import {
  getServers,
  getActiveServerId,
  getServerApiKey,
  setActiveServer,
} from '../../services/unraidApi/config';
import { getSystemInfo } from '../../services/unraidApi/systemApi';
import type { UnraidSystemInfo } from '../../services/types';
import { usePro } from '../../hooks/usePro';
import { usePolling } from '../../hooks/usePolling';
import { usePollInterval } from '../../hooks/usePollInterval';
import { DEFAULT_COLOR } from '../../hooks/usePrimaryColor';
import { cardClass } from '../ui/Card';
import Icon from '../ui/Icon';

interface ServerSummary {
  online: boolean;
  info: UnraidSystemInfo | null;
}

export default function OtherServersCard() {
  const pro = usePro();
  const others = getServers().filter((s) => s.id !== getActiveServerId());
  const [summaries, setSummaries] = useState<Record<string, ServerSummary>>({});
  const pollInterval = usePollInterval();
  const enabled = pro && others.length > 0;

  const refresh = useCallback(async () => {
    // 每次刷新重读服务器列表(设置页增删后下一轮自动跟上)
    const list = getServers().filter((s) => s.id !== getActiveServerId());
    const results = await Promise.all(
      list.map(async (s) => {
        const key = getServerApiKey(s.id);
        if (!key) return [s.id, { online: false, info: null }] as const;
        try {
          const info = await getSystemInfo(s.serverUrl, key, false, {
            namespace: null,
            skipCpuTemp: true,
          });
          return [s.id, { online: info !== null, info }] as const;
        } catch {
          return [s.id, { online: false, info: null }] as const;
        }
      })
    );
    setSummaries(Object.fromEntries(results));
  }, []);

  usePolling(refresh, pollInterval, enabled);

  if (!enabled) return null;

  return (
    <div className={cardClass} data-testid="other-servers-card">
      <div className="flex items-center gap-2 mb-3">
        <Icon icon={ServerIcon} className="text-primary-600 dark:text-primary-400" />
        {/* 【续 90】标题统一 text-base font-semibold(index.css 卡片标题约定) */}
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">其他服务器</h3>
      </div>
      <div className="space-y-2">
        {others.map((s) => {
          const sum = summaries[s.id];
          const loading = sum === undefined;
          const online = sum?.online ?? false;
          return (
            <button
              key={s.id}
              onClick={() => setActiveServer(s.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
              title={`切换到 ${s.name}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color || DEFAULT_COLOR }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {s.name}
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                  {loading
                    ? '连接中…'
                    : online && sum.info
                      ? `CPU ${sum.info.cpu.toFixed(0)}% · 内存 ${sum.info.memory.toFixed(0)}% · ${sum.info.uptime}`
                      : '离线'}
                </span>
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  loading ? 'bg-gray-300 dark:bg-gray-600' : online ? 'bg-green-500' : 'bg-gray-400'
                }`}
                aria-label={online ? '在线' : '离线'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
