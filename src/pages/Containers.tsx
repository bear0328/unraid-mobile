// 【2026-06-17 续 27】合并原 Vms 页:VmDetailsModal 进 VM tab;Vms 路由/页面/测试均已删
// 【2026-06-17 续 32-4】容器批量操作(checkbox + 工具条 + 批量 start/stop/restart)
// 【续 45.7 2026-07-01】加 🔄 头部按钮 + 容器 staleness 提示
// 【续 48 2026-07-19】Compose 页并入为 compose tab,tab 顺序 docker/compose/vm;/compose 路由重定向到 /containers
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Play, Square, ArrowUpCircle } from 'lucide-react';
import { UnraidDockerContainer, UnraidVM } from '../services';
import { ContainerAction, VmAction } from '../services/actionTypes';
import { useUnraidApi, useApiConfig } from '../hooks/useUnraidApi';
import { useContainersData } from '../hooks/useContainersData';
import { useContainerActions } from '../hooks/useContainerActions';
import { useContainerLogs } from '../hooks/useContainerLogs';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { DockerList, VmList } from '../components/ContainerLists';
import { LogsModal } from '../components/LogsModal';
import VmDetailsModal from '../components/vms/VmDetailsModal';
import ContainerDetailsModal from '../components/containers/ContainerDetailsModal';
import ComposeStacks from '../components/compose/ComposeStacks';
import LastRefreshText from '../components/ui/LastRefreshText';
import Icon from '../components/ui/Icon';
import ProGate from '../components/ProGate';
import Dialog from '../components/shares/Dialog';
import { usePro } from '../hooks/usePro';
import { invalidateNamespace } from '../services/unraidApi/cache';

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
  // 【续 91 F】更新确认对话框(useDialog + <Dialog> 渲染在页底)
  const dialog = useDialog();
  // 【续 91 F】正在更新中的 containerId(行内「更新中…」反馈)
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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

  // 【续 74】页级 StaleBadge 移除,刷新时间统一走全局 <LastRefreshText>;
  // useNow/cacheAgeMs 随之不再需要( polling 刷新本身会触发 re-render)

  // 【续 45.7】手动刷新按钮:invalidate containers + vms cache + 调 useContainersData.refresh
  // 【续 99】①缓存失效口径统一为 invalidateNamespace(同 useContainerActions.refreshBypassCache,
  //   不再手撸 localStorage.removeItem(getCacheKey(...)));
  //   ②refreshing 态:原 disabled 用首屏 loading(首次加载后恒 false),刷新中按钮可连点
  //   且无反馈;改独立 refreshing state,驱动 disabled + 图标旋转
  const [refreshing, setRefreshing] = useState(false);
  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      invalidateNamespace('containers');
      invalidateNamespace('vms');
      await refreshContainers();
    } finally {
      setRefreshing(false);
    }
  }, [refreshContainers]);

  // 【续 70】compose tab 的刷新:信号递增 → ComposeStacks 内部 handleRefresh
  // (失效 containers 缓存由 ComposeStacks.handleRefresh 里的 invalidateNamespace 负责)
  const [composeTick, setComposeTick] = useState(0);
  const [composeLoading, setComposeLoading] = useState(false);
  const handleComposeRefresh = useCallback(() => {
    setComposeTick((t) => t + 1);
  }, []);

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
  // 找到卡片(按卡片渲染的 container/vm name 匹配)→ 高亮 ring 1.5s(滚动由 ContainerItem/VmItem 做),
  // 然后 replace 清掉 query,防刷新重复滚动
  const [searchParams, setSearchParams] = useSearchParams();
  const focusName = searchParams.get('focus');
  const [highlightName, setHighlightName] = useState<string | null>(null);

  // 【续 89】深链 ?tab=docker|compose|vm(Dashboard VM 卡「管理 →」跳 /containers?tab=vm):
  // tab 参数有效时同步 activeTab;focus 流程清 query 后 tab=null,不强制回 docker
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam === 'docker' || tabParam === 'compose' || tabParam === 'vm') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (!focusName) return;
    // 【续 99】focus 深链匹配扩到 VM 名(原只查 containers,?tab=vm&focus= 无定位反馈)
    const hit =
      containers.some((c) => c.name === focusName) || vms.some((v) => v.name === focusName);
    if (!hit) return;
    setHighlightName(focusName);
    setSearchParams({}, { replace: true });
  }, [focusName, containers, vms, setSearchParams]);

  // 高亮 1.5s 后自动消。独立 effect:清 query 会让上面的 effect 重跑,
  // 若 timer 挂在其 cleanup 下会被一起 clear,高亮永不消
  useEffect(() => {
    if (!highlightName) return;
    const timer = setTimeout(() => setHighlightName(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightName]);

  // 查看容器日志
  // 【续 78】useCallback 稳定化(memo 行组件 props)
  const handleViewLogs = useCallback(
    async (container: UnraidDockerContainer) => {
      if (!api) return;
      setLogsModal({
        open: true,
        containerName: container.name,
        containerId: container.containerId,
      });
    },
    [api]
  );

  const closeLogsModal = useCallback(() => {
    setLogsModal((prev) => ({ ...prev, open: false }));
  }, []);

  // 【续 32-4】批量操作 handlers(compose tab 无可选列表,返回空 → 批量工具条/全选行自动隐藏)
  // 【续 78】useMemo 稳定化:配合行组件 memo,避免每次 render 新数组
  const currentList = useMemo(
    () =>
      activeTab === 'docker'
        ? containers.map((c) => ({ id: c.containerId, label: c.name, state: c.state }))
        : activeTab === 'vm'
          ? vms.map((v) => ({ id: v.vmUuid, label: v.name, state: v.state }))
          : [],
    [activeTab, containers, vms]
  );

  // 【续 78】以下 handler 全部 useCallback:ContainerItem/VmItem memo 生效前提是 props 稳定
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === currentList.length ? new Set() : new Set(currentList.map((c) => c.id))
    );
  }, [currentList]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // 切换 tab 时清掉选中(容器 id 跟 VM id 是不同 namespace,但保险起见)
  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setSelected(new Set());
  }, []);

  // 批量执行容器/VM action
  const handleBatch = async (action: ContainerAction | VmAction) => {
    if (selected.size === 0) return;
    setBatchBusy(true);
    const ids = Array.from(selected);
    let success = 0;
    let fail = 0;
    // 串行执行,避免 GraphQL 风暴
    // 【续 50 C2】按 handle*Action 返回的真实成败计数(原实现吞掉失败,fail 恒 0)
    // 【续 85】silent: 批量不刷单条"开始重启"toast,末尾统一汇总
    for (const id of ids) {
      try {
        const ok =
          activeTab === 'docker'
            ? await handleContainerAction(id, action as ContainerAction, { silent: true })
            : await handleVmAction(id, action as VmAction, { silent: true });
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

  // 【续 91 F】容器一键更新(Pro,纯 GraphQL):详情弹窗按钮与 ⋮ 菜单「更新镜像」
  // 共用本 handler —— 确认对话框 → mutation(最长 120s)→ toast + 刷新;
  // 失败/超时也后备刷新一次 containers,防徽标/状态陈旧。返回成败供调用方(详情弹窗)收尾
  const handleUpdateContainer = useCallback(
    async (container: UnraidDockerContainer): Promise<boolean> => {
      if (!api) return false;
      const ok = await dialog.confirm({
        title: '更新容器',
        message: `将拉取「${container.name}」的最新镜像并重建容器(配置保留),期间容器会短暂不可用。`,
        confirmText: '更新',
      });
      if (!ok) return false;
      setUpdatingId(container.containerId);
      let r: { success: boolean; error?: string };
      try {
        r = await api.updateContainer(container.containerId);
      } finally {
        setUpdatingId(null);
      }
      if (r.success) {
        toast.success(`「${container.name}」更新完成`);
        await refreshContainers();
        return true;
      }
      toast.error(`「${container.name}」更新失败:${r.error || '未知错误'}`, 6000);
      await refreshContainers();
      return false;
    },
    [api, dialog, toast, refreshContainers]
  );

  // 【续 91 F】批量更新选中(updateContainers(ids) 一次请求;返回 [DockerContainer!]! 结构简单)
  const handleBatchUpdate = useCallback(async () => {
    if (!api || selected.size === 0) return;
    const ids = Array.from(selected);
    const ok = await dialog.confirm({
      title: '批量更新容器',
      message: `将拉取选中的 ${ids.length} 个容器的最新镜像并重建(配置保留),期间容器会短暂不可用。`,
      confirmText: '更新',
    });
    if (!ok) return;
    setBatchBusy(true);
    let r: { success: boolean; error?: string };
    try {
      r = await api.updateContainers(ids);
    } finally {
      setBatchBusy(false);
    }
    clearSelection();
    if (r.success) {
      toast.success(`批量更新完成: ${ids.length} 个`);
    } else {
      toast.error(`批量更新失败:${r.error || '未知错误'}`, 6000);
    }
    // 成功/失败都刷新一次:成功消徽标,失败兜底状态
    await refreshContainers();
  }, [api, selected, dialog, toast, refreshContainers, clearSelection]);

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
        {/* 【续 70】三 tab 统一走页级刷新钮:docker/vm 刷容器数据,compose 信号联动 ComposeStacks */}
        <button
          onClick={activeTab === 'compose' ? handleComposeRefresh : handleManualRefresh}
          disabled={activeTab === 'compose' ? composeLoading : refreshing}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 text-gray-700 dark:text-gray-300 font-medium hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="手动刷新容器列表"
          title="立即拉新容器数据(不唤醒硬盘)"
        >
          <Icon
            icon={RefreshCw}
            size={12}
            className={activeTab !== 'compose' && refreshing ? 'animate-spin' : ''}
          />
          刷新
        </button>
        {/* 【续 74】页签刷新时间统一走全局「更新于」(原容器 StaleBadge 移除) */}
        <LastRefreshText />
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
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={Play} size={12} />
                启动
              </button>
              <button
                onClick={() => handleBatch('restart')}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={RefreshCw} size={12} />
                重启
              </button>
              <button
                onClick={() => handleBatch('stop')}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={Square} size={12} fill="currentColor" />
                停止
              </button>
              {/* 【续 91 F】批量更新选中(updateContainers 一次请求,Pro——批量选择本身已 Pro 门控) */}
              <button
                onClick={handleBatchUpdate}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={ArrowUpCircle} size={12} />
                更新
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleBatch('start')}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={Play} size={12} />
                启动
              </button>
              <button
                onClick={() => handleBatch('reboot')}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={RefreshCw} size={12} />
                重启
              </button>
              <button
                onClick={() => handleBatch('stop')}
                disabled={batchBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg"
              >
                <Icon icon={Square} size={12} fill="currentColor" />
                停止
              </button>
            </>
          )}
          <button
            onClick={clearSelection}
            disabled={batchBusy}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg"
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
          <ComposeStacks refreshSignal={composeTick} onLoadingChange={setComposeLoading} />
        </ProGate>
      ) : activeTab === 'docker' ? (
        <DockerList
          containers={containers}
          actionLoading={actionLoading}
          restartingContainers={restartingContainers}
          onAction={handleContainerAction}
          onViewLogs={handleViewLogs}
          onViewDetails={setDetailsContainer}
          onUpdate={handleUpdateContainer}
          updatingId={updatingId}
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
          highlightName={highlightName}
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
          onUpdate={handleUpdateContainer}
        />
      )}

      {/* 【续 91 F】更新确认对话框(单个/批量共用) */}
      <Dialog {...dialog} />
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
