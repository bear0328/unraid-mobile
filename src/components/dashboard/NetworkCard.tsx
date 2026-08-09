// 【阶段 1 P0 - 2026-06-15】网络 IO 卡片
// 从 Dashboard.tsx 拆出：主网卡下行/上行速度
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
// 【续 90】密度提升:标题旁加主网卡名;数值升 text-lg font-semibold tabular-nums;
//   删「刷新中…」(Hero 卡已有刷新态);卡片头统一走 CardHeader
import { memo } from 'react';
import { ArrowDown, ArrowUp, ArrowDownUp } from 'lucide-react';
import { UnraidNetworkInfo } from '../../services';
import { formatSpeed } from '../../utils/formatters';
import Icon from '../ui/Icon';
import StaleBadge from '../ui/StaleBadge';
import { cardClass, CardHeader } from '../ui/Card';

interface NetworkCardProps {
  networks: UnraidNetworkInfo[];
  /** 保留在 props 里(Dashboard 统一传参),【续 90】「刷新中…」文案已删,不再消费 */
  isRefreshing: boolean;
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function NetworkCard({ networks, cacheAgeMs }: NetworkCardProps) {
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
    <div className={cardClass}>
      <CardHeader
        icon={ArrowDownUp}
        title="网络 IO"
        badge={
          <>
            {/* 【续 90】主网卡名跟在标题后 */}
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              {primaryNetwork.name}
            </span>
            <StaleBadge
              cacheAgeMs={cacheAgeMs}
              thresholdMs={60 * 1000}
              title="Dashboard 缓存数据,点「刷新」拉最新"
            />
          </>
        }
      />
      <div className="flex items-center justify-around">
        <div className="text-center">
          <div className="flex justify-center mb-1 text-green-600 dark:text-green-400">
            <Icon icon={ArrowDown} size={24} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">接收</div>
          {/* 【续 90】数值升一档 + 等宽数字,跳动不抖动 */}
          <div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
            {formatSpeed(primaryNetwork.rxSec)}
          </div>
        </div>
        <div className="text-center">
          <div className="flex justify-center mb-1 text-blue-600 dark:text-blue-400">
            <Icon icon={ArrowUp} size={24} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">发送</div>
          <div className="text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {formatSpeed(primaryNetwork.txSec)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(NetworkCard);
