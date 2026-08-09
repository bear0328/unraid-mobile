import { memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  LayoutDashboard,
  ScrollText,
  RefreshCw,
  Square,
  Play,
  Pause,
  ChevronRight,
  ArrowUpCircle,
} from 'lucide-react';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import ActionMenu, { type MenuItem } from './ActionMenu';
import { usePro } from '../hooks/usePro';
import { rowCardClass } from './ui/Card';

// 【续 68 GUI 焕新】状态 pill:文字 + 色点,替代裸圆点(状态不用猜颜色)
type PillTone = 'green' | 'yellow' | 'blue' | 'gray';
const PILL_TONE_CLASS: Record<PillTone, string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400',
};

function StatePill({ text, tone }: { text: string; tone: PillTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${PILL_TONE_CLASS[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}

function getContainerStateMeta(state: string): { text: string; tone: PillTone } {
  switch (state) {
    case 'running':
      return { text: '运行中', tone: 'green' };
    case 'paused':
      return { text: '已暂停', tone: 'yellow' };
    case 'restarting':
      return { text: '重启中', tone: 'blue' };
    default:
      return { text: '已停止', tone: 'gray' };
  }
}

// 【阶段 P2-批量 - 2026-06-17 续 32-4】批量选择模式 + checkbox
// 【阶段 P1-详情 - 2026-06-17 续 32-5】onViewDetails 打开 ContainerDetailsModal
export function DockerList({
  containers,
  actionLoading,
  restartingContainers,
  onAction,
  onViewLogs,
  onViewDetails,
  onUpdate,
  updatingId,
  selected,
  onToggleOne,
  highlightName,
}: {
  containers: UnraidDockerContainer[];
  actionLoading: string | null;
  restartingContainers: Set<string>;
  onAction: (id: string, action: ContainerAction) => void;
  onViewLogs: (container: UnraidDockerContainer) => void;
  onViewDetails?: (container: UnraidDockerContainer) => void;
  /** 【续 91 F】「更新镜像」菜单项 handler(Pro 门控在项内,未解锁换 🔒 跳设置) */
  onUpdate?: (container: UnraidDockerContainer) => void;
  /** 【续 91 F】正在更新中的 containerId(行内「更新中…」反馈 + 菜单项禁用) */
  updatingId?: string | null;
  selected?: Set<string>;
  onToggleOne?: (id: string) => void;
  /** 【续 50 C8】深链 ?focus= 命中的容器名,对应卡片短暂高亮+滚动定位 */
  highlightName?: string | null;
}) {
  return (
    <div className="space-y-2">
      {containers.length === 0 ? (
        <p className="text-gray-500 text-sm">无容器</p>
      ) : (
        containers.map((container) => (
          <ContainerItem
            key={container.containerId}
            container={container}
            loading={actionLoading === container.containerId}
            restarting={restartingContainers.has(container.containerId)}
            onAction={onAction}
            onViewLogs={onViewLogs}
            onViewDetails={onViewDetails}
            onUpdate={onUpdate}
            updating={updatingId === container.containerId}
            isSelected={selected?.has(container.containerId) ?? false}
            onToggleSelect={onToggleOne}
            highlighted={container.name === highlightName}
          />
        ))
      )}
    </div>
  );
}

export function VmList({
  vms,
  actionLoading,
  rebootingVms,
  onAction,
  onVmClick,
  selected,
  onToggleOne,
}: {
  vms: UnraidVM[];
  actionLoading: string | null;
  rebootingVms: Set<string>;
  onAction: (id: string, action: VmAction) => void;
  onVmClick?: (vm: UnraidVM) => void;
  selected?: Set<string>;
  onToggleOne?: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {vms.length === 0 ? (
        <p className="text-gray-500 text-sm">无虚拟机</p>
      ) : (
        vms.map((vm) => (
          <VmItem
            key={vm.vmUuid}
            vm={vm}
            loading={actionLoading === vm.vmUuid}
            rebooting={rebootingVms.has(vm.vmUuid)}
            onAction={onAction}
            onClick={onVmClick}
            isSelected={selected?.has(vm.vmUuid) ?? false}
            onToggleSelect={onToggleOne}
          />
        ))
      )}
    </div>
  );
}

// 【续 78】memo:配合 useContainersData 引用保持 + Containers 稳定 handler,
// 每轮 poll 数据未变的行整行跳过重渲(33 容器 × 60s tick,移动端省 CPU)
// 前提:父组件传稳定 props —— boolean 原语(loading/restarting/isSelected/highlighted)+
// useCallback 稳定 handler + 引用保持的 container 对象
const ContainerItem = memo(function ContainerItem({
  container,
  loading,
  restarting,
  onAction,
  onViewLogs,
  onViewDetails,
  onUpdate,
  updating,
  isSelected,
  onToggleSelect,
  highlighted,
}: {
  container: UnraidDockerContainer;
  loading: boolean;
  restarting: boolean;
  onAction: (id: string, action: ContainerAction) => void;
  onViewLogs: (container: UnraidDockerContainer) => void;
  onViewDetails?: (container: UnraidDockerContainer) => void;
  onUpdate?: (container: UnraidDockerContainer) => void;
  updating?: boolean;
  isSelected: boolean;
  onToggleSelect?: (id: string) => void;
  highlighted?: boolean;
}) {
  // 【续 50 C8】深链定位:高亮时把卡片滚到可视区中央(jsdom 无 scrollIntoView,用 ?. 兜底)
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const stateMeta = getContainerStateMeta(container.state);
  // 【续 90 门控调整】详情/日志(纯 GraphQL 查看)免费;启动/停止/重启操作 → Pro,
  // 未解锁时操作项保留原 label 换锁图标占位,点击跳设置页 License 区(沿用续 55 goUnlock 模式)
  const pro = usePro();
  const navigate = useNavigate();
  const goUnlock = () => navigate('/settings', { state: { focusLicense: true } });
  const menuItems: MenuItem[] = [
    ...(onViewDetails
      ? [{ label: '详情', icon: LayoutDashboard, onClick: () => onViewDetails(container) }]
      : []),
    { label: '日志', icon: ScrollText, onClick: () => onViewLogs(container) },
  ];
  // 【续 91 F】更新镜像(Pro,纯 GraphQL):isUpdateAvailable 时橙点高亮;
  // 未解锁换 🔒 占位跳设置(同启停项模式)
  menuItems.push(
    pro
      ? {
          label: '更新镜像',
          icon: ArrowUpCircle,
          onClick: () => onUpdate?.(container),
          disabled: loading || updating,
          highlight: container.isUpdateAvailable === true,
        }
      : {
          label: '更新镜像',
          icon: Lock,
          onClick: goUnlock,
          highlight: container.isUpdateAvailable === true,
        }
  );
  if (container.state === 'running') {
    menuItems.push(
      pro
        ? {
            label: '重启',
            icon: RefreshCw,
            onClick: () => onAction(container.containerId, 'restart'),
            disabled: loading,
          }
        : { label: '重启', icon: Lock, onClick: goUnlock },
      pro
        ? {
            label: '停止',
            icon: Square,
            onClick: () => onAction(container.containerId, 'stop'),
            disabled: loading,
            danger: true,
          }
        : { label: '停止', icon: Lock, onClick: goUnlock }
    );
  } else {
    menuItems.push(
      pro
        ? {
            label: '启动',
            icon: Play,
            onClick: () => onAction(container.containerId, 'start'),
            disabled: loading,
          }
        : { label: '启动', icon: Lock, onClick: goUnlock }
    );
  }

  // 【续 90 详情入口统一】整行可点进详情(对齐 VmItem),复用菜单「详情」的 handler
  const handleCardClick = () => onViewDetails?.(container);

  return (
    <div
      ref={cardRef}
      data-container-name={container.name}
      className={`${rowCardClass} ${
        onViewDetails ? 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700' : ''
      } ${
        isSelected ? 'ring-2 ring-primary-500 bg-primary-50/40 dark:bg-primary-900/20' : ''
      } ${highlighted ? 'ring-2 ring-blue-500' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between gap-2">
        {/* 【续 55 商业化】批量选择 → Pro,未解锁时隐藏行内 checkbox */}
        {pro && onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(container.containerId)}
            className="w-4 h-4 shrink-0 cursor-pointer accent-primary-600"
            aria-label={`选择 ${container.name}`}
            // 【续 90】整卡可点后防穿透:勾选 checkbox 不触发卡片 onClick
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{container.name}</span>
            {/* 【续 68】状态 pill(文字+色点),替代裸圆点 */}
            <StatePill text={stateMeta.text} tone={stateMeta.tone} />
            {/* 【续 68】有可用更新 → 橙色徽章(isUpdateAvailable 为 null/false 不显示) */}
            {container.isUpdateAvailable === true && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                title="该容器有可用镜像更新"
              >
                更新
              </span>
            )}
            {/* 【续 85】重启过程行内反馈:mutation 执行期「执行中…」→ 轮询等待期「等待恢复运行…」
                (开始/结束另走 toast,对齐 compose 体验) */}
            {restarting && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw size={12} className="animate-spin" />
                等待恢复运行…
              </span>
            )}
            {!restarting && loading && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw size={12} className="animate-spin" />
                执行中…
              </span>
            )}
            {/* 【续 91 F】更新过程行内反馈(mutation 最长 120s) */}
            {!restarting && !loading && updating && (
              <span className="inline-flex items-center gap-1 text-xs text-orange-500">
                <RefreshCw size={12} className="animate-spin" />
                更新中…
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{container.image}</p>
        </div>
        {/* 【续 90】Chevron 暗示整卡可点(详情),对齐 VmItem */}
        {onViewDetails && (
          <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
        )}
        {/* 【续 90】整卡可点后防穿透:点 ⋮ 菜单不触发卡片 onClick(对齐 VmItem :374 模式) */}
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
});

// 【续 78】memo 同 ContainerItem
const VmItem = memo(function VmItem({
  vm,
  loading,
  rebooting,
  onAction,
  onClick,
  isSelected,
  onToggleSelect,
}: {
  vm: UnraidVM;
  loading: boolean;
  rebooting: boolean;
  onAction: (id: string, action: VmAction) => void;
  onClick?: (vm: UnraidVM) => void;
  isSelected: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const isRunning = vm.state.toUpperCase().includes('RUN');
  const isPaused = vm.state.toUpperCase().includes('PAUSE');
  const vmPillTone = getVMStateTone(vm.state);
  const stateText = getVMStateText(vm.state);
  // 【续 90 门控调整】VM 详情(点卡片)免费(基础字段走 GraphQL,未解锁也直接开 VmDetailsModal);
  // 启动/停止/重启/暂停/恢复操作 → Pro,未解锁时操作项保留原 label 换锁图标占位,点击跳设置页
  const pro = usePro();
  const navigate = useNavigate();
  const goUnlock = () => navigate('/settings', { state: { focusLicense: true } });
  const handleCardClick = () => onClick?.(vm);

  const menuItems: MenuItem[] = [];
  if (isPaused) {
    menuItems.push(
      pro
        ? {
            label: '恢复',
            icon: Play,
            onClick: () => onAction(vm.vmUuid, 'resume'),
            disabled: loading,
          }
        : { label: '恢复', icon: Lock, onClick: goUnlock }
    );
  } else if (isRunning) {
    menuItems.push(
      pro
        ? {
            label: '重启',
            icon: RefreshCw,
            onClick: () => onAction(vm.vmUuid, 'reboot'),
            disabled: loading,
          }
        : { label: '重启', icon: Lock, onClick: goUnlock },
      pro
        ? {
            label: '暂停',
            icon: Pause,
            onClick: () => onAction(vm.vmUuid, 'pause'),
            disabled: loading,
          }
        : { label: '暂停', icon: Lock, onClick: goUnlock },
      pro
        ? {
            label: '停止',
            icon: Square,
            onClick: () => onAction(vm.vmUuid, 'stop'),
            disabled: loading,
            danger: true,
          }
        : { label: '停止', icon: Lock, onClick: goUnlock }
    );
  } else {
    menuItems.push(
      pro
        ? {
            label: '启动',
            icon: Play,
            onClick: () => onAction(vm.vmUuid, 'start'),
            disabled: loading,
          }
        : { label: '启动', icon: Lock, onClick: goUnlock }
    );
  }

  return (
    <div
      className={`${rowCardClass} ${
        onClick ? 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700' : ''
      } ${isSelected ? 'ring-2 ring-primary-500 bg-primary-50/40 dark:bg-primary-900/20' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between gap-2">
        {/* 【续 55 商业化】批量选择 → Pro,未解锁时隐藏行内 checkbox */}
        {pro && onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(vm.vmUuid)}
            className="w-4 h-4 shrink-0 cursor-pointer accent-primary-600"
            aria-label={`选择 ${vm.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{vm.name}</span>
            {/* 【续 68】状态 pill(文字+色点),替代裸圆点 + 下行文字 */}
            <StatePill text={stateText} tone={vmPillTone} />
            {/* 【续 85】VM 重启行内反馈,与容器对齐 */}
            {rebooting && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw size={12} className="animate-spin" />
                等待恢复运行…
              </span>
            )}
            {!rebooting && loading && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw size={12} className="animate-spin" />
                执行中…
              </span>
            )}
          </div>
        </div>
        {/* 【续 68】Chevron 暗示整卡可点(详情) */}
        {onClick && (
          <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
});

function getVMStateTone(state: string): PillTone {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started')) return 'green';
  if (normalized.includes('shut') || normalized.includes('stopped')) return 'gray';
  if (normalized.includes('paused')) return 'yellow';
  return 'blue';
}

function getVMStateText(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started')) return '运行中';
  if (normalized.includes('shut') || normalized.includes('stopped')) return '已停止';
  if (normalized.includes('paused')) return '已暂停';
  return state;
}
