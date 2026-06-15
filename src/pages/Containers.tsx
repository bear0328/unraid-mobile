// 【2026-06-17 续 27】合并原 Vms 页:VmDetailsModal 进 VM tab;Vms 路由/页面/测试均已删
// 【2026-06-17 续 32-4】容器批量操作(checkbox + 工具条 + 批量 start/stop/restart)
// 【续 45.7 2026-07-01】加 🔄 头部按钮 + 容器 staleness 提示
// 【续 48 2026-07-19】Compose 页并入为 compose tab,tab 顺序 docker/compose/vm;/compose 路由重定向到 /containers
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import { useUnraidApi, useApiConfig } from '../hooks/useUnraidApi';
import { useContainersData } from '../hooks/useContainersData';
import { useContainerActions } from '../hooks/useContainerActions';
import { useContainerLogs } from '../hooks/useContainerLogs';
import { useToast } from '../hooks/useToast';
import { useNow } from '../hooks/useNow';
import { DockerList, VmList } from '../components/ContainerLists';
import { LogsModal } from '../components/LogsModal';
import VmDetailsModal from '../components/vms/VmDetailsModal';
import ContainerDetailsModal from '../components/containers/ContainerDetailsModal';
import ComposeStacks from '../components/compose/ComposeStacks';
import StaleBadge from '../components/ui/StaleBadge';
import ProGate from '../components/ProGate';
import { usePro } from '../hooks/usePro';
import { cacheAgeMs, getCacheKey } from '../services/unraidApi/cache';

type TabType = 'docker' | 'compose' | 'vm';

export default function Containers() {
  const [activeTab, setActiveTab] = useState<TabType>('docker');
  const [logsModal, setLogsModal] = useState({
    open: false,
    containerName: '',
    containerId: '' as string | null,
  });
  const [selectedVm, setSelectedVm] = useState<UnraidVM | null>(null);
  // 【续 32-5】容器详情 modal
  const [detailsContainer, setDetailsContainer] = useState<UnraidDockerContainer | null>(null);
  // 【续 32-4】批量选择 state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const api = useUnraidApi();
  const { isConfigured } = useApiConfig();
  const hasConfig = isConfigured && !!api;
  const toast = useToast();
  // 【续 55 商业化】Pro 状态:Compose tab / 批量选择(全选行+行内 checkbox)未解锁时隐藏
  const pro = usePro();

  const {
    containers,
    vms,
    loading,
    error,
    refresh: refreshContainers,
    containersRef,
    vmsRef,
  } = useContainersData(api, hasConfig);

  // 【续 46.2 2026-07-18】30s 本地 tick 强制重渲染 — 同 Dashboard,polling skip 窗口内
  // 让 containersCacheAge 自己增长,staleness badge 及时出现(零网络零 IO)
  useNow(30_000);
  // 【续 45.7 2026-07-01】容器数据 cache age(给 StaleBadge 提示)
  const containersCacheAge = cacheAgeMs('containers');

  // 【续 45.7】手动刷新按钮:invalidate containers + vms cache + 调 useContainersData.refresh
  const handleManualRefresh = useCallback(async () => {
    try {
      localStorage.removeItem(getCacheKey('containers'));
      localStorage.removeItem(getCacheKey('vms'));
    } catch {
      /* LS 不可用忽略 */
    }
    await refreshContainers();
  }, [refreshContainers]);

  const {
    actionLoading,
    actionError,
    restartingContainers,
    rebootingVms,
    handleContainerAction,
    handleVmAction,
  } = useContainerActions(api, refreshContainers, containersRef, vmsRef);

  const {
    logs,
    loading: logsLoading,
    error: logsError,
    liveRefresh,
    setLiveRefresh,
  } = useContainerLogs(api, logsModal.containerId, logsModal.open ?? false);

  // 【续 50 C8】消费收藏/全局搜索的深链 ?focus=<容器名>:
  // 找到卡片(按卡片渲染的 container.name 匹配)→ 高亮 ring 1.5s(滚动由 ContainerItem 做),
  // 然后 replace 清掉 query,防刷新重复滚动
  const [searchParams, setSearchParams] = useSearchParams();
  const focusName = searchParams.get('focus');
  const [highlightName, setHighlightName] = useState<string | null>(null);

  useEffect(() => {
    if (!focusName) return;
    if (!containers.some((c) => c.name === focusName)) return;
    setHighlightName(focusName);
    setSearchParams({}, { replace: true });
  }, [focusName, containers, setSearchParams]);

  // 高亮 1.5s 后自动消。独立 effect:清 query 会让上面的 effect 重跑,
  // 若 timer 挂在其 cleanup 下会被一起 clear,高亮永不消
  useEffect(() => {
    if (!highlightName) return;
    const timer = setTimeout(() => setHighlightName(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightName]);

  // 查看容器日志
  const handleViewLogs = async (container: UnraidDockerContainer) => {
    if (!api) return;
    setLogsModal({
      open: true,
      containerName: container.name,
      containerId: container.containerId,
    });
  };

  const closeLogsModal = () => {
    setLogsModal((prev) => ({ ...prev, open: false }));
  };

  // 【续 32-4】批量操作 handlers(compose tab 无可选列表,返回空 → 批量工具条/全选行自动隐藏)
  const currentList =
    activeTab === 'docker'
      ? containers.map((c) => ({ id: c.containerId, label: c.name, state: c.state }))
      : activeTab === 'vm'
        ? vms.map((v) => ({ id: v.vmUuid, label: v.name, state: v.state }))
        : [];

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === currentList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(currentList.map((c) => c.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  // 切换 tab 时清掉选中(容器 id 跟 VM id 是不同 namespace,但保险起见)
  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setSelected(new Set());
  };

  // 批量执行容器/VM action
  const handleBatch = async (action: ContainerAction | VmAction) => {
    if (selected.size === 0) return;
    setBatchBusy(true);
    const ids = Array.from(selected);
    let success = 0;
    let fail = 0;
    // 串行执行,避免 GraphQL 风暴
    // 【续 50 C2】按 handle*Action 返回的真实成败计数(原实现吞掉失败,fail 恒 0)
    for (const id of ids) {
      try {
        const ok =
          activeTab === 'docker'
            ? await handleContainerAction(id, action as ContainerAction)
            : await handleVmAction(id, action as VmAction);
        if (ok) {
          success++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }
    setBatchBusy(false);
    clearSelection();
    if (fail === 0) {
      toast.success(`批量 ${actionLabel(action)} 完成: ${success} 个`);
    } else {
      toast.warning(`批量 ${actionLabel(action)}: 成功 ${success} / 失败 ${fail}`, 5000);
    }
  };

  if (loading) {
    return <div className="p-4">加载中...</div>;
  }

  if (!hasConfig) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            {error || '请先在设置页面配置 unRAID 服务器地址和 API 密钥'}
          </p>
        </div>
      </div>
    );
  }

  const allSelected = selected.size > 0 && selected.size === currentList.length;
  const partiallySelected = selected.size > 0 && selected.size < currentList.length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">容器管理</h1>
        {/* 【续 45.7 2026-07-01】手动刷新按钮 */}
        <button
          onClick={handleManualRefresh}
          disabled={loading}
          className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="手动刷新容器列表"
          title="立即拉新容器数据(不唤醒硬盘)"
        >
          🔄 刷新
        </button>
        {/* 【续 45.7】容器 staleness 提示 (复用 30s 阈值) */}
        <StaleBadge
          cacheAgeMs={containersCacheAge}
          thresholdMs={30_000}
          title="容器缓存数据,点 🔄 刷新拉最新"
        />
      </div>

      {actionError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-red-800 dark:text-red-200 text-sm">{actionError}</p>
        </div>
      )}
      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => switchTab('docker')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'docker'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Docker
        </button>
        <button
          onClick={() => switchTab('compose')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'compose'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Compose
        </button>
        <button
          onClick={() => switchTab('vm')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'vm'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          虚拟机
        </button>
      </div>

      {/* 【续 32-4】批量操作工具条 */}
      {selected.size > 0 && (
        <div className="sticky top-[52px] sm:top-[60px] z-30 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-xl p-2.5 flex flex-wrap items-center gap-2 shadow-sm">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            已选 {selected.size} 个
          </span>
          <div className="flex-1" />
          {activeTab === 'docker' ? (
            <>
              <button
                onClick={() => handleBatch('start')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                ▶ 启动
              </button>
              <button
                onClick={() => handleBatch('restart')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                🔄 重启
              </button>
              <button
                onClick={() => handleBatch('stop')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                ⏹ 停止
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleBatch('start')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                ▶ 启动
              </button>
              <button
                onClick={() => handleBatch('reboot')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                🔄 重启
              </button>
              <button
                onClick={() => handleBatch('stop')}
                disabled={batchBusy}
                className="text-xs px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                ⏹ 停止
              </button>
            </>
          )}
          <button
            onClick={clearSelection}
            disabled={batchBusy}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg"
          >
            取消
          </button>
        </div>
      )}

      {/* 全选行(列表上方)【续 55 商业化】批量操作 → Pro,未解锁不渲染 */}
      {pro && currentList.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = partiallySelected;
            }}
            onChange={toggleAll}
            className="w-4 h-4 cursor-pointer accent-primary-600"
            aria-label="全选/反选"
          />
          <span>
            {selected.size > 0
              ? `已选 ${selected.size} / ${currentList.length}`
              : `共 ${currentList.length} 个,点击 checkbox 多选后批量操作`}
          </span>
        </div>
      )}

      {activeTab === 'compose' ? (
        /* 【续 55 商业化】Compose tab 整体 → Pro(tab 按钮保留可点) */
        <ProGate feature="Compose 管理">
          <ComposeStacks />
        </ProGate>
      ) : activeTab === 'docker' ? (
        <DockerList
          containers={containers}
          actionLoading={actionLoading}
          restartingContainers={restartingContainers}
          onAction={handleContainerAction}
          onViewLogs={handleViewLogs}
          onViewDetails={setDetailsContainer}
          selected={selected}
          onToggleOne={toggleOne}
          highlightName={highlightName}
        />
      ) : (
        <VmList
          vms={vms}
          actionLoading={actionLoading}
          rebootingVms={rebootingVms}
          onAction={handleVmAction}
          onVmClick={setSelectedVm}
          selected={selected}
          onToggleOne={toggleOne}
        />
      )}

      <LogsModal
        open={logsModal.open}
        title={logsModal.containerName}
        loading={logsLoading}
        logs={logs}
        error={logsError}
        liveRefresh={liveRefresh}
        onClose={closeLogsModal}
        onToggleLiveRefresh={setLiveRefresh}
      />

      {selectedVm && <VmDetailsModal vm={selectedVm} onClose={() => setSelectedVm(null)} />}

      {detailsContainer && (
        <ContainerDetailsModal
          container={detailsContainer}
          api={api}
          onClose={() => setDetailsContainer(null)}
        />
      )}
    </div>
  );
}

// ==================== 工具函数 ====================

function actionLabel(action: ContainerAction | VmAction): string {
  switch (action) {
    case 'start':
      return '启动';
    case 'stop':
      return '停止';
    case 'restart':
    case 'reboot':
      return '重启';
    case 'pause':
      return '暂停';
    case 'resume':
      return '恢复';
    default:
      return action;
  }
}
