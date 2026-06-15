// 【阶段 1 P0 - 2026-06-15】网络 IO 卡片
// 从 Dashboard.tsx 拆出：主网卡下行/上行速度
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
import { memo } from 'react';
import { UnraidNetworkInfo } from '../../services';
import { formatSpeed } from '../../utils/formatters';
import StaleBadge from '../ui/StaleBadge';

interface NetworkCardProps {
  networks: UnraidNetworkInfo[];
  isRefreshing: boolean;
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function NetworkCard({ networks, isRefreshing, cacheAgeMs }: NetworkCardProps) {
  if (networks.length === 0) return null;

  // 优先级：br0 / shim-br0 → eth/bond/en → 第一项
  const primaryNetwork =
    networks.find((n) => n.name === 'br0' || n.name === 'shim-br0') ||
    networks.find(
      (n) =>
        n.name.toLowerCase().includes('eth') ||
        n.name.toLowerCase().includes('bond') ||
        n.name.toLowerCase().includes('en')
    ) ||
    networks[0];

  if (!primaryNetwork) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">网络 IO</h3>
          <StaleBadge
            cacheAgeMs={cacheAgeMs}
            thresholdMs={60 * 1000}
            title="Dashboard 缓存数据,点 🔄 刷新拉最新"
          />
        </div>
        {isRefreshing && <span className="text-xs text-gray-500 dark:text-gray-400">刷新中…</span>}
      </div>
      <div className="flex items-center justify-around">
        <div className="text-center">
          <div className="text-2xl mb-1">⬇️</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">接收</div>
          <div className="text-sm font-medium text-green-600 dark:text-green-400">
            {formatSpeed(primaryNetwork.rxSec)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl mb-1">⬆️</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">发送</div>
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {formatSpeed(primaryNetwork.txSec)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(NetworkCard);
