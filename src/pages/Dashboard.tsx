// 【阶段 1 P0 - 2026-06-15】Dashboard 薄层组合
// 原 616 行 → ~140 行，只剩 state + data fetching + 卡片组合
// 【阶段 P2-监控图 - 2026-06-17 续 32-7】加历史采样 + MiniSparkline 折线图
// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】卡片拖拽重排
// 【续 45.7 2026-07-01】加 🔄 头部按钮 + 5 个数据卡 staleness 提示
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UnraidSystemInfo,
  UnraidDisk,
  UnraidNetworkInfo,
  UnraidDockerContainer,
} from '../services';
import { useApiConfig, useUnraidApi } from '../hooks/useUnraidApi';
import { usePolling } from '../hooks/usePolling';
import { usePollInterval } from '../hooks/usePollInterval';
import { useNow } from '../hooks/useNow';
import {
  loadDashboardCache,
  saveDashboardCache,
  isDashboardCacheFresh,
  getDashboardCacheTimestamp,
  getDisksCacheTimestamp,
} from '../components/dashboard/dashboardCache';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import CpuCard from '../components/dashboard/CpuCard';
import MemoryCard from '../components/dashboard/MemoryCard';
import NetworkCard from '../components/dashboard/NetworkCard';
import ArrayCard from '../components/dashboard/ArrayCard';
import DiskCard from '../components/dashboard/DiskCard';
import FavoritesCard from '../components/dashboard/FavoritesCard';
import ContainerSummaryCard from '../components/dashboard/ContainerSummaryCard';
import DraggableCard from '../components/dashboard/DraggableCard';
import { ConfigRequiredState } from '../components/dashboard/EmptyState';
import StaleBadge from '../components/ui/StaleBadge';
import { useDashboardOrder, type DashboardCardKey } from '../hooks/useDashboardOrder';
import { useContainersData } from '../hooks/useContainersData';
import { recordDiskSnapshot } from '../utils/diskHistory';
import { cacheAgeMs, getCacheKey } from '../services/unraidApi/cache';

// 【续 32-7】历史采样窗口(过去 10 分钟 = 60 个采样点 @ 10s polling)
const HISTORY_POINTS = 60;

export default function Dashboard() {
  const cache = loadDashboardCache();
  const [systemInfo, setSystemInfo] = useState<UnraidSystemInfo | null>(cache?.systemInfo ?? null);
  const [disks, setDisks] = useState<UnraidDisk[]>(cache?.disks ?? []);
  const [networks, setNetworks] = useState<UnraidNetworkInfo[]>(cache?.networks ?? []);
  const [loading, setLoading] = useState(!cache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConfig, setHasConfig] = useState(false);

  // 【续 32-7】历史采样(过去 N 次的 CPU%/内存%)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  // 上次采样数据（用于计算实时读写速度）
  const lastSampleRef = useRef<{
    timestamp: number;
    disks: Map<string, { reads: number; writes: number }>;
  } | null>(null);

  const api = useUnraidApi();
  const { isConfigured } = useApiConfig();
  // 【续 34-2】Dashboard 卡片顺序(可拖拽)
  const { order, move, reset } = useDashboardOrder();
  // 【续 34-5】容器数据(给 ContainerSummaryCard 用)
  const { containers, loading: containersLoading } = useContainersData(api, hasConfig);
  // 【续 45.7 2026-06-30】容器数据 cache age(给 ContainerSummaryCard staleness 提示用)
  // 用 cacheAgeMs helper (cache miss 时 null,首次加载不显示 staleness)
  const containersCacheAge = cacheAgeMs('containers');
  // 【续 46.2 2026-07-18】30s 本地 tick 强制重渲染 — polling 在 cache 5min 新鲜期内
  // 全部 skip(防唤盘),期间无 re-render,下面两个 cache age 不会自己增长,staleness
  // badge 最晚 5min 才出现。useNow 零网络零 IO,只让 age 在每次 render 时重算。
  useNow(30_000);
  // 【续 45.7】dashboard 自身数据 cache age(给 5 个数据卡 + 头部 StaleBadge)
  // 【续 45.7】不是 readState(因为是读 LS cache),而是每次 render 时算
  const dashboardCacheAge = (() => {
    const ts = getDashboardCacheTimestamp();
    return ts ? Date.now() - ts : null;
  })();
  // 【续 45.8 2026-07-04】磁盘数据独立 cache age — 头部🔄不刷磁盘时,这个不更新
  const disksCacheAge = (() => {
    const ts = getDisksCacheTimestamp();
    return ts ? Date.now() - ts : null;
  })();

  useEffect(() => {
    setHasConfig(isConfigured);
  }, [isConfigured]);

  // 【续 45.7 2026-07-01】抽出 fetcher,供 usePolling + handleManualRefresh 复用
  // 【续 45.8 2026-07-04】includeDisks 参数:默认 false,头部 🔄 / 周期 polling 不刷新磁盘
  //   磁盘数据 statfs 会唤醒休眠的 array 盘,所以磁盘刷新必须用户主动点(DiskCard 内按钮)
  // 【续 46.3 2026-07-18】mount 无 cache 也不再自动拉磁盘 —— iOS/无痕模式会清 LS,
  //   冷启动必触发 getDisks → 唤盘(实测:用户手机 2 次全盘唤醒均源于此)。
  //   现在 getDisks 唯一入口 = DiskCard「🌡️ 刷新磁盘」按钮,冷启动显示空态卡
  const refreshDashboard = useCallback(
    async (opts: { manual?: boolean; includeDisks?: boolean } = {}) => {
      const { manual = false, includeDisks = false } = opts;
      if (!isConfigured || !api) {
        setHasConfig(false);
        setError('请先在设置页面配置 unRAID 服务器地址和 API 密钥');
        setLoading(false);
        return;
      }

      setHasConfig(true);

      // 【续 46.3】磁盘只显式拉(刷新磁盘按钮),mount/polling/头部🔄一律不拉
      const shouldFetchDisks = includeDisks;

      try {
        if (manual) setIsRefreshing(true);
        // 并行获取所有数据(磁盘按需)
        const tasks: Promise<unknown>[] = [api.getSystemInfo(), api.getNetworkInfo()];
        if (shouldFetchDisks) tasks.push(api.getDisks());
        const [sysInfo, networkData, diskRaw] = (await Promise.all(tasks)) as [
          UnraidSystemInfo | null,
          UnraidNetworkInfo[],
          UnraidDisk[] | undefined,
        ];

        if (sysInfo) {
          setSystemInfo(sysInfo);
        }

        setNetworks(networkData);

        // 仅当本次真拉了 disks 才更新磁盘 state(否则保留旧数据,避免被 undefined 清空)
        let diskDataForCache: UnraidDisk[] | undefined;
        if (shouldFetchDisks && diskRaw) {
          const diskData = diskRaw;
          // 计算实时读写速度
          const now = Date.now();
          const updatedDisks = diskData.map((disk) => {
            let readSpeed: number | undefined;
            let writeSpeed: number | undefined;

            if (lastSampleRef.current && disk.reads !== undefined && disk.writes !== undefined) {
              const lastSample = lastSampleRef.current.disks.get(disk.name);
              const timeDiff = (now - lastSampleRef.current.timestamp) / 1000; // 秒

              if (lastSample && timeDiff > 0) {
                const readDiff = disk.reads - lastSample.reads;
                const writeDiff = disk.writes - lastSample.writes;

                // 只计算正增量（避免重启导致的负值）
                if (readDiff >= 0) {
                  readSpeed = readDiff / timeDiff;
                }
                if (writeDiff >= 0) {
                  writeSpeed = writeDiff / timeDiff;
                }
              }
            }

            return {
              ...disk,
              readSpeed,
              writeSpeed,
            };
          });

          // 更新上次采样数据
          const newDiskSample = new Map<string, { reads: number; writes: number }>();
          diskData.forEach((disk) => {
            if (disk.reads !== undefined && disk.writes !== undefined) {
              newDiskSample.set(disk.name, {
                reads: disk.reads,
                writes: disk.writes,
              });
            }
          });
          lastSampleRef.current = {
            timestamp: now,
            disks: newDiskSample,
          };

          setDisks(updatedDisks);
          // 【续 39-1 候选 - 2026-06-18】磁盘温度历史采样(5min 节流内置)
          recordDiskSnapshot(diskData);
          diskDataForCache = diskData;
        }

        setError(null);
        // 保存 cache:本次没拉 disks 时用旧 disk 数据(沿用 LS 已有的),避免覆盖磁盘温度
        if (sysInfo) {
          const diskForSave = diskDataForCache ?? disks;
          saveDashboardCache(
            { systemInfo: sysInfo, disks: diskForSave, networks: networkData },
            shouldFetchDisks
          );
        }

        // 【续 32-7】记录历史采样(过去 10 分钟)
        if (sysInfo) {
          const cpu = sysInfo.cpu ?? 0;
          const mem = sysInfo.memory ?? 0;
          setCpuHistory((prev) => {
            const next = [...prev, cpu];
            return next.length > HISTORY_POINTS ? next.slice(-HISTORY_POINTS) : next;
          });
          setMemHistory((prev) => {
            const next = [...prev, mem];
            return next.length > HISTORY_POINTS ? next.slice(-HISTORY_POINTS) : next;
          });
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('无法连接到 unRAID 服务器');
      } finally {
        if (manual) setIsRefreshing(false);
        setLoading(false);
      }
    },
    [api, isConfigured, disks]
  );

  // 【续 45.7 2026-07-01】手动刷新按钮:只清 CPU/内存/网络 cache,**不**清 disks cache
  // refreshDashboard 的 includeDisks=false,本次刷新不会发 getDisks → 不唤盘
  // 用户要看磁盘温度→显式点 DiskCard 上的"刷新磁盘"按钮
  const handleManualRefresh = useCallback(async () => {
    try {
      localStorage.removeItem(getCacheKey('systemInfo'));
      // 【续 50 C9】namespace 是 'networks'(networkApi.ts),原 'networkInfo' 清的是不存在的 key
      localStorage.removeItem(getCacheKey('networks'));
    } catch {
      /* LS 不可用忽略 */
    }
    await refreshDashboard({ manual: true });
  }, [refreshDashboard]);

  // 【续 45.8 2026-07-04】DiskCard 顶部的"刷新磁盘"按钮触发:清 disks cache + 显式拉一次
  const handleRefreshDisks = useCallback(async () => {
    try {
      localStorage.removeItem(getCacheKey('disks'));
    } catch {
      /* LS 不可用忽略 */
    }
    await refreshDashboard({ manual: true, includeDisks: true });
  }, [refreshDashboard]);

  const pollInterval = usePollInterval();
  usePolling(
    () => refreshDashboard(),
    pollInterval,
    true,
    {
      // 【续 45 2026-06-26】dashboard cache < 5min 时跳过 mount 立即 fire,刷新页面不唤醒 array
      skipInitialIf: () => isDashboardCacheFresh(loadDashboardCache()),
      // 【续 45 2026-06-26】interval tick 也尊重 cache:5min 内完全不 fetch
      shouldSkipTick: () => isDashboardCacheFresh(loadDashboardCache()),
      // 【续 45.7 2026-07-01】默认 respectVisibility=true, resumeDelayMs 默认 30s
      // 切回 tab 不立即 fire,30s 兜底,期间用户操作 (pointerdown/keydown) 立即 fire
    }
  );

  // 【性能优化 2026-06-14】首次加载（无 cache）显示 skeleton + spinner
  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !hasConfig) {
    return <ConfigRequiredState error={error} />;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Server Name */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {systemInfo?.name || 'unRAID Server'}
          </h2>
          {/* 【续 45.7 2026-07-01】手动刷新按钮:invalidate cache + 强制 fetch */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="手动刷新 Dashboard 数据"
            title="立即拉新数据(不拉磁盘,不唤醒硬盘)"
          >
            🔄 刷新
          </button>
          {isRefreshing && (
            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1">
              后台刷新中…
            </span>
          )}
          {/* 【续 45.7】头部 staleness 提示 */}
          <StaleBadge
            cacheAgeMs={dashboardCacheAge}
            thresholdMs={60 * 1000}
            title="Dashboard 缓存数据,点 🔄 刷新拉最新"
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          运行时长: {systemInfo?.uptime || 'N/A'}
        </p>
      </div>

      {/* 【续 34-2】按 order 渲染卡片(可拖拽重排) */}
      {order.map((key, idx) => {
        const card = renderCard(key, {
          systemInfo,
          history: key === 'cpu' ? cpuHistory : memHistory,
          networks,
          isRefreshing,
          disks,
          containers,
          containersLoading,
          containersCacheAge,
          dashboardCacheAge,
          disksCacheAge,
          onRefreshDisks: handleRefreshDisks,
        });
        return (
          <DraggableCard key={key} id={key} index={idx} totalCount={order.length} onMove={move}>
            {card}
          </DraggableCard>
        );
      })}

      {/* 重置按钮 */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            if (confirm('恢复 Dashboard 卡片为默认顺序?')) reset();
          }}
          className="text-xs text-gray-400 hover:text-primary-600"
        >
          ↺ 恢复默认顺序
        </button>
      </div>
    </div>
  );
}

// 【续 34-2】按 key 渲染对应卡片
function renderCard(
  key: DashboardCardKey,
  props: {
    systemInfo: UnraidSystemInfo | null;
    history?: number[];
    networks: UnraidNetworkInfo[];
    isRefreshing: boolean;
    disks: UnraidDisk[];
    containers: UnraidDockerContainer[];
    containersLoading: boolean;
    containersCacheAge?: number | null;
    /** 【续 45.7 2026-07-01】dashboard 自身数据 cache age,给 5 个数据卡用 */
    dashboardCacheAge?: number | null;
    /** 【续 45.8 2026-07-04】磁盘数据独立 cache age(头部🔄不刷磁盘时不变),给 DiskCard 用 */
    disksCacheAge?: number | null;
    /** 【续 45.8 2026-07-04】DiskCard 显式刷新磁盘按钮回调 */
    onRefreshDisks?: () => void;
  }
) {
  switch (key) {
    case 'favorites':
      return <FavoritesCard />;
    case 'cpu':
      return (
        <CpuCard
          systemInfo={props.systemInfo}
          history={props.history}
          cacheAgeMs={props.dashboardCacheAge}
        />
      );
    case 'memory':
      return (
        <MemoryCard
          systemInfo={props.systemInfo}
          history={props.history}
          cacheAgeMs={props.dashboardCacheAge}
        />
      );
    case 'containers':
      return (
        <ContainerSummaryCard
          containers={props.containers}
          loading={props.containersLoading}
          cacheAgeMs={props.containersCacheAge}
        />
      );
    case 'network':
      return (
        <NetworkCard
          networks={props.networks}
          isRefreshing={props.isRefreshing}
          cacheAgeMs={props.dashboardCacheAge}
        />
      );
    case 'array':
      return (
        <ArrayCard
          systemInfo={props.systemInfo}
          disks={props.disks}
          cacheAgeMs={props.disksCacheAge}
        />
      );
    case 'disk':
      return (
        <DiskCard
          disks={props.disks}
          cacheAgeMs={props.disksCacheAge}
          onRefreshDisks={props.onRefreshDisks}
          isRefreshing={props.isRefreshing}
        />
      );
    default:
      return null;
  }
}
