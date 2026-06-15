import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import ActionMenu, { type MenuItem } from './ActionMenu';
import { usePro } from '../hooks/usePro';

// 【阶段 P2-批量 - 2026-06-17 续 32-4】批量选择模式 + checkbox
// 【阶段 P1-详情 - 2026-06-17 续 32-5】onViewDetails 打开 ContainerDetailsModal
export function DockerList({
  containers,
  actionLoading,
  restartingContainers,
  onAction,
  onViewLogs,
  onViewDetails,
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

function ContainerItem({
  container,
  loading,
  restarting,
  onAction,
  onViewLogs,
  onViewDetails,
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
  isSelected: boolean;
  onToggleSelect?: (id: string) => void;
  highlighted?: boolean;
}) {
  // 【续 50 C8】深链定位:高亮时把卡片滚到可视区中央(jsdom 无 scrollIntoView,用 ?. 兜底)
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const stateColor = getContainerStateColor(container.state);
  // 【续 55 商业化】容器详情/日志 → Pro;未解锁时菜单项带 🔒,点击跳设置页 License 区
  // (单个启停/重启/暂停动作保持免费)
  const pro = usePro();
  const navigate = useNavigate();
  const goUnlock = () => navigate('/settings', { state: { focusLicense: true } });
  const menuItems: MenuItem[] = pro
    ? [
        ...(onViewDetails ? [{ label: '📊 详情', onClick: () => onViewDetails(container) }] : []),
        { label: '📋 日志', onClick: () => onViewLogs(container) },
      ]
    : [
        ...(onViewDetails ? [{ label: '🔒 详情', onClick: goUnlock }] : []),
        { label: '🔒 日志', onClick: goUnlock },
      ];
  if (container.state === 'running') {
    menuItems.push(
      {
        label: '🔄 重启',
        onClick: () => onAction(container.containerId, 'restart'),
        disabled: loading,
      },
      {
        label: '⏹ 停止',
        onClick: () => onAction(container.containerId, 'stop'),
        disabled: loading,
        danger: true,
      }
    );
  } else {
    menuItems.push({
      label: '▶ 启动',
      onClick: () => onAction(container.containerId, 'start'),
      disabled: loading,
    });
  }

  return (
    <div
      ref={cardRef}
      data-container-name={container.name}
      className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm transition-colors ${
        isSelected ? 'ring-2 ring-primary-500 bg-primary-50/40 dark:bg-primary-900/20' : ''
      } ${highlighted ? 'ring-2 ring-blue-500' : ''}`}
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
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stateColor}`} />
            <span className="font-medium truncate">{container.name}</span>
            {restarting && <span className="text-xs text-blue-500">重启中...</span>}
          </div>
          <p className="text-xs text-gray-500 truncate">{container.image}</p>
        </div>
        <ActionMenu items={menuItems} />
      </div>
    </div>
  );
}

function VmItem({
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
  const stateColor = getVMStateColor(vm.state);
  const stateText = getVMStateText(vm.state);
  // 【续 55 商业化】VM 详情(点卡片) → Pro;未解锁时点击不弹详情,跳设置页 License 区
  // (VM 启停/重启/暂停/恢复动作保持免费)
  const pro = usePro();
  const navigate = useNavigate();
  const handleCardClick = () => {
    if (!pro) {
      navigate('/settings', { state: { focusLicense: true } });
      return;
    }
    onClick?.(vm);
  };

  const menuItems: MenuItem[] = [];
  if (isPaused) {
    menuItems.push({
      label: '▶ 恢复',
      onClick: () => onAction(vm.vmUuid, 'resume'),
      disabled: loading,
    });
  } else if (isRunning) {
    menuItems.push(
      { label: '🔄 重启', onClick: () => onAction(vm.vmUuid, 'reboot'), disabled: loading },
      { label: '⏸ 暂停', onClick: () => onAction(vm.vmUuid, 'pause'), disabled: loading },
      {
        label: '⏹ 停止',
        onClick: () => onAction(vm.vmUuid, 'stop'),
        disabled: loading,
        danger: true,
      }
    );
  } else {
    menuItems.push({
      label: '▶ 启动',
      onClick: () => onAction(vm.vmUuid, 'start'),
      disabled: loading,
    });
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm transition-colors ${
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
            <span className={`w-2 h-2 rounded-full ${stateColor}`} />
            <span className="font-medium truncate">{vm.name}</span>
            {rebooting && <span className="text-xs text-blue-500">重启中...</span>}
          </div>
          <p className="text-xs text-gray-500">{stateText}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}

function getContainerStateColor(state: string) {
  switch (state) {
    case 'running':
      return 'bg-green-500';
    case 'paused':
      return 'bg-yellow-500';
    case 'restarting':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}

function getVMStateColor(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started')) return 'bg-green-500';
  if (normalized.includes('shut') || normalized.includes('stopped')) return 'bg-gray-500';
  if (normalized.includes('paused')) return 'bg-yellow-500';
  return 'bg-blue-500';
}

function getVMStateText(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started')) return '运行中';
  if (normalized.includes('shut') || normalized.includes('stopped')) return '已停止';
  if (normalized.includes('paused')) return '已暂停';
  return state;
}
