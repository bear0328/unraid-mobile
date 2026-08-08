// 【续 89】VM 摘要卡片:首页显示虚拟机(running/其他计数 + 最多 5 条列表 + 跳 /containers?tab=vm)
// 数据源零成本:Dashboard 的 useContainersData 本就并行拉 getVMs(60s 地板 polling,
// libvirt 内存数据不唤盘),这里只消费 vms prop,零新增网络/polling。
// 加载完成后无 VM → 返回 null,不占无 VM 用户的首页空间
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { UnraidVM } from '../../services';
import StaleBadge from '../ui/StaleBadge';
import Icon from '../ui/Icon';
import { cardClass, iconChipClass } from '../ui/Card';

interface VmSummaryCardProps {
  vms: UnraidVM[];
  loading?: boolean;
  /** 与 containers 同轮拉取,复用其 cache age 做 staleness 提示 */
  cacheAgeMs?: number | null;
}

// 与 ContainerLists.tsx 的 getVMStateTone/getVMStateText 同一套口径
function vmStateMeta(state: string): { color: string; label: string } {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started'))
    return { color: '#10b981', label: '运行中' };
  if (normalized.includes('shut') || normalized.includes('stopped'))
    return { color: '#9ca3af', label: '已停止' };
  if (normalized.includes('paused')) return { color: '#f59e0b', label: '已暂停' };
  return { color: '#3b82f6', label: state };
}

const isRunning = (state: string) => {
  const n = state.toLowerCase();
  return n.includes('running') || n.includes('started');
};

function VmSummaryCard({ vms, loading, cacheAgeMs }: VmSummaryCardProps) {
  if (loading) {
    return (
      <div className={cardClass}>
        <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  // 无 VM:卡片整体不渲染
  if (vms.length === 0) return null;

  const runningCount = vms.filter((v) => isRunning(v.state)).length;
  const shown = vms.slice(0, 5);

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <span className={iconChipClass}>
            <Icon icon={Monitor} size={18} />
          </span>
          虚拟机
          <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
            {runningCount}/{vms.length} 运行中
          </span>
          <StaleBadge
            cacheAgeMs={cacheAgeMs}
            thresholdMs={30_000}
            title="Dashboard 缓存中的虚拟机数据,切到 /containers 页会拉最新"
          />
        </h3>
        <Link
          to="/containers?tab=vm"
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          管理 →
        </Link>
      </div>

      <div className="space-y-1.5">
        {shown.map((vm) => {
          const m = vmStateMeta(vm.state);
          return (
            <div key={vm.vmUuid} className="flex items-center gap-2 text-xs">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <span className="font-medium text-gray-700 dark:text-gray-200 truncate flex-1">
                {vm.name}
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-[10px] shrink-0">
                {m.label}
              </span>
            </div>
          );
        })}
        {vms.length > shown.length && (
          <Link
            to="/containers?tab=vm"
            className="block text-center text-[10px] text-gray-500 dark:text-gray-400 hover:text-primary-600 pt-1"
          >
            还有 {vms.length - shown.length} 个 →
          </Link>
        )}
      </div>
    </div>
  );
}

export default memo(VmSummaryCard);
