// 【阶段 1 P0 - 2026-06-15】Dashboard 薄层组合
// 原 616 行 → ~140 行，只剩 state + data fetching + 卡片组合
// 【阶段 P2-监控图 - 2026-06-17 续 32-7】加历史采样 + MiniSparkline 折线图
// 【阶段 P2-拖拽 - 2026-06-17 续 34-2】卡片拖拽重排
// 【续 45.7 2026-07-01】加 🔄 头部按钮 + 5 个数据卡 staleness 提示
// 【续 91】数据层 bug 全修:失败返 null 约定(A1)/不谎报刷新(A2)/single-flight(M3)/
//   切服务器重置(M4)/错误降级 banner(M5)/惰性初始化+ref 化(L9/L10)/spinMap 浅比较(L11)
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  UnraidSystemInfo,
  UnraidDisk,
  UnraidNetworkInfo,
  UnraidDockerContainer,
  UnraidVM,
  UnraidServerMeta,
  UnraidParityStatus,
  UnraidUpsDevice,
  getApiConfig,
} from '../services';
import { getParityCheckStatus } from '../services/unraidApi/parityApi';
import { getUpsDevices } from '../services/unraidApi/upsApi';
import { isPro } from '../services/license';
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
import DiskCard from '../components/dashboard/DiskCard';
import FavoritesCard from '../components/dashboard/FavoritesCard';
import ContainerSummaryCard from '../components/dashboard/ContainerSummaryCard';
import VmSummaryCard from '../components/dashboard/VmSummaryCard';
import DraggableCard from '../components/dashboard/DraggableCard';
import { ConfigRequiredState } from '../components/dashboard/EmptyState';
import ServerHeroCard from '../components/dashboard/ServerHeroCard';
import OtherServersCard from '../components/dashboard/OtherServersCard';
import ParityCard from '../components/dashboard/ParityCard';
import UpsCard from '../components/dashboard/UpsCard';
import Icon from '../components/ui/Icon';
import { useDashboardOrder, type DashboardCardKey } from '../hooks/useDashboardOrder';
import { useContainersData } from '../hooks/useContainersData';
// 【续 90】原生 confirm 换项目既有 useDialog + Dialog 渲染层
import { useDialog } from '../hooks/useDialog';
import Dialog from '../components/shares/Dialog';
import { recordDiskSnapshot } from '../utils/diskHistory';
import { markRefreshed } from '../utils/lastRefresh';
import { cacheAgeMs, getCacheKey, invalidateNamespace } from '../services/unraidApi/cache';

// 【续 32-7】历史采样窗口(过去 10 分钟 = 60 个采样点 @ 10s polling)
const HISTORY_POINTS = 60;

/**
 * 【续 91 L11】spinMap 浅比较复用(照 useContainersData.ts mergeList 模式):
 * 内容相同返回 prev 引用,DiskCard memo 不因每轮 polling 的新 Map 失效
 */
function mergeSpinMap(prev: Map<string, boolean>, next: Map<string, boolean>): Map<string, boolean> {
  if (prev.size === next.size) {
    let same = true;
    for (const [k, v] of next) {
      if (prev.get(k) !== v) {
        same = false;
        break;
      }
    }
    if (same) return prev;
  }
  return next;
}

export default function Dashboard() {
  const api = useUnraidApi();
  const { config, isConfigured } = useApiConfig();
  // 【续 91 M4】当前服务器地址:采样 ref 按它 key 化(防跨机差分)
  const serverUrl = config?.serverUrl ?? '';

  // 【续 91 L9】loadDashboardCache 惰性初始化:原每次 render 都读+parse LS
  const [cache] = useState(() => loadDashboardCache());
  const [systemInfo, setSystemInfo] = useState<UnraidSystemInfo | null>(cache?.systemInfo ?? null);
  const [disks, setDisks] = useState<UnraidDisk[]>(cache?.disks ?? []);
  const [networks, setNetworks] = useState<UnraidNetworkInfo[]>(cache?.networks ?? []);
  // 【续 89b】头卡元信息(版本/license/OS 更新提醒)
  const [serverMeta, setServerMeta] = useState<UnraidServerMeta | null>(cache?.serverMeta ?? null);
  // 【续 66】磁盘休眠状态(轻查询,不唤盘,随每次真实刷新更新;不进 LS 缓存)
  const [spinMap, setSpinMap] = useState<Map<string, boolean>>(new Map());
  // 【续 91 D/G】parity 校验状态 + UPS 设备(第一个);失败/无数据 → null,对应卡不渲染
  const [parity, setParity] = useState<UnraidParityStatus | null>(null);
  const [ups, setUps] = useState<UnraidUpsDevice | null>(null);
  const [loading, setLoading] = useState(!cache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 【续 91 M5】hasConfig 惰性初始化:原 useState(false)+effect 同步,
  // 已配置用户首帧会闪一下"需要配置"整屏
  const [hasConfig, setHasConfig] = useState(() => isConfigured);

  // 【续 32-7】历史采样(过去 N 次的 CPU%/内存%)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  // 上次采样数据（用于计算实时读写速度）
  // 【续 91 M4】按 serverUrl key 化(照 networkApi.ts prevNetSample):切服务器后
  // 旧 prev 作废,不拿两台机器的累积计数器差分(否则首轮必出虚假速率尖峰)
  const lastSampleRef = useRef<{
    serverUrl: string;
    timestamp: number;
    disks: Map<string, { reads: number; writes: number }>;
  } | null>(null);

  // 【续 91 M3】single-flight:在飞的刷新 promise;交叠调用复用它,
  // 防重复请求 + network/disk 差分采样 dt≈0 爆速率尖峰
  const inFlightRef = useRef<{ promise: Promise<void>; includeDisks: boolean } | null>(null);

  // 【续 91 L10】fetcher 改从 ref 读最新 state:refreshDashboard deps 不再含
  // disks/serverMeta/networks,消除回调重建 + 陈旧闭包覆盖缓存
  const disksRef = useRef(disks);
  const networksRef = useRef(networks);
  const serverMetaRef = useRef(serverMeta);
  useEffect(() => {
    disksRef.current = disks;
  }, [disks]);
  useEffect(() => {
    networksRef.current = networks;
  }, [networks]);
  useEffect(() => {
    serverMetaRef.current = serverMeta;
  }, [serverMeta]);

  // 【续 34-2】Dashboard 卡片顺序(可拖拽)
  const { order, move, reset } = useDashboardOrder();
  // 【续 90】「恢复默认顺序」确认弹窗(替代原生 confirm)
  const dialog = useDialog();
  // 【续 34-5】容器数据(给 ContainerSummaryCard 用)
  // 【续 89】同 hook 顺带返回 vms(本就并行拉 getVMs,零新增网络),给 VmSummaryCard 用
  const { containers, vms, loading: containersLoading } = useContainersData(api, hasConfig);
  // 【续 46.2 2026-07-18】30s 本地 tick 强制重渲染 — polling 在 cache 5min 新鲜期内
  // 全部 skip(防唤盘),期间无 re-render,下面几个 cache age 不会自己增长,staleness
  // badge 最晚 5min 才出现。useNow 零网络零 IO,驱动 useMemo 重算。
  const now = useNow(30_000);
  // 【续 45.7 2026-06-30】容器数据 cache age(给 ContainerSummaryCard staleness 提示用)
  // 用 cacheAgeMs helper (cache miss 时 null,首次加载不显示 staleness)
  // 【续 91 L9】读 LS 的 timestamp 统一 useMemo(now 驱动),不再每次 render 直读
  // eslint-disable-next-line react-hooks/exhaustive-deps -- now 是重算触发器,不是真依赖
  const containersCacheAge = useMemo(() => cacheAgeMs('containers'), [now]);
  // 【续 45.7】dashboard 自身数据 cache age(给 5 个数据卡 + 头部 StaleBadge)
  const dashboardCacheAge = useMemo(() => {
    const ts = getDashboardCacheTimestamp();
    return ts ? now - ts : null;
  }, [now]);
  // 【续 45.8 2026-07-04】磁盘数据独立 cache age — 头部🔄不刷磁盘时,这个不更新
  const disksCacheAge = useMemo(() => {
    const ts = getDisksCacheTimestamp();
    return ts ? now - ts : null;
  }, [now]);

  useEffect(() => {
    setHasConfig(isConfigured);
  }, [isConfigured]);

  // 【续 91 M4】切服务器/改地址 → api 实例重建:serverUrl 真变时重置内存 state
  // (clearServerScopedCaches 只清 LS,内存里的旧服务器数据会串到下一 tick)
  // 并立即用新 api 重拉;同地址变化(只改 key 等)不重置不浪费请求
  const serverUrlRef = useRef(serverUrl);
  const prevApiRef = useRef(api);
  useEffect(() => {
    if (prevApiRef.current === api) return;
    prevApiRef.current = api;
    const url = getApiConfig()?.serverUrl ?? '';
    if (url === serverUrlRef.current) return;
    serverUrlRef.current = url;
    lastSampleRef.current = null;
    setSystemInfo(null);
    setDisks([]);
    setNetworks([]);
    setServerMeta(null);
    setSpinMap(new Map());
    setParity(null);
    setUps(null);
    setCpuHistory([]);
    setMemHistory([]);
    setError(null);
    void refreshDashboardRef.current();
  }, [api]);

  // 【续 45.7 2026-07-01】抽出 fetcher,供 usePolling + handleManualRefresh 复用
  // 【续 45.8 2026-07-04】includeDisks 参数:默认 false,头部 🔄 / 周期 polling 不刷新磁盘
  //   磁盘数据 statfs 会唤醒休眠的 array 盘,所以磁盘刷新必须用户主动点(DiskCard 内按钮)
  // 【续 46.3 2026-07-18】mount 无 cache 也不再自动拉磁盘 —— iOS/无痕模式会清 LS,
  //   冷启动必触发 getDisks → 唤盘(实测:用户手机 2 次全盘唤醒均源于此)。
  //   现在 getDisks 唯一入口 = DiskCard「🌡️ 刷新磁盘」按钮,冷启动显示空态卡
  const refreshDashboard = useCallback(
    async (opts: { manual?: boolean; includeDisks?: boolean } = {}): Promise<void> => {
      const { manual = false, includeDisks = false } = opts;

      // 【续 91 M3】single-flight:交叠调用复用在飞 promise(并发会重复请求 +
      // network/disk 差分采样 dt≈0 爆速率尖峰)。磁盘刷新排在在飞的轻量刷新之后,
      // 否则「刷新磁盘」按钮被合并吞掉(在飞的不拉 disks,复用它 = 按钮没反应)
      const cur = inFlightRef.current;
      if (cur) {
        if (cur.includeDisks || !includeDisks) {
          // 复用在飞 promise;手动点击也给 spinner 反馈
          if (manual) setIsRefreshing(true);
          try {
            await cur.promise.catch(() => {});
          } finally {
            if (manual) setIsRefreshing(false);
          }
          return;
        }
        await cur.promise.catch(() => {});
      }

      const p = (async () => {
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
          // 并行获取所有数据(磁盘按需;spin 轻查询常拉,实测不唤盘)
          // 【续 89b】getServerMeta 随同一节拍(独立 namespace 缓存,失败静默 null)
          // 【续 91 D/G】parity(emhttp 内存态只读,不唤盘)随同一节拍常拉;UPS 仅 Pro 拉
          // (免费版零请求,未解锁时 UpsCard 只渲染 ProGate 引导卡)。
          // unraidApi.ts 类是并行 F 范围不动,这里直调子模块函数
          // (useProxy=true 与 UnraidApiService 构造默认一致)
          const cfg = getApiConfig();
          const wantUps = isPro();
          const tasks: Promise<unknown>[] = [
            api.getSystemInfo(),
            api.getNetworkInfo(),
            api.getSpinStatus(),
            api.getServerMeta(),
            getParityCheckStatus(cfg?.serverUrl ?? serverUrl, cfg?.apiKey ?? '', true),
          ];
          // ups/disks 两个可选位用 Promise.resolve(undefined) 占位:
          // 数组位置固定,Promise.all 结果按下标解构不错位
          tasks.push(
            wantUps
              ? getUpsDevices(cfg?.serverUrl ?? serverUrl, cfg?.apiKey ?? '', true)
              : Promise.resolve(undefined)
          );
          tasks.push(shouldFetchDisks ? api.getDisks() : Promise.resolve(undefined));
          const [sysInfo, networkData, spinStatus, meta, parityStatus, upsDevices, diskRaw] =
            (await Promise.all(tasks)) as [
              UnraidSystemInfo | null,
              UnraidNetworkInfo[] | null,
              Map<string, boolean> | null,
              UnraidServerMeta | null,
              UnraidParityStatus | null,
              UnraidUpsDevice[] | null | undefined,
              UnraidDisk[] | null | undefined,
            ];

          // 【续 91 A1/A2】API 层统一"失败返 null":null = 请求失败,保留旧数据不清卡;
          // 真空(服务器真无网卡/无盘)返 [] 仍正常落 state
          if (sysInfo) {
            setSystemInfo(sysInfo);
          }
          if (meta) {
            setServerMeta(meta);
          }
          if (networkData) {
            setNetworks(networkData);
          }
          if (spinStatus) {
            // 【续 91 L11】浅比较复用:内容相同保留旧 Map 引用,DiskCard memo 不失效
            setSpinMap((prev) => mergeSpinMap(prev, spinStatus));
          }
          // 【续 91 D/G】parity/UPS 语义不同:失败或无数据(null)即不渲染,直接覆盖,
          // 不留旧数据(目标机无 UPS → ups 恒 null → 卡恒不渲染)
          setParity(parityStatus ?? null);
          setUps(upsDevices?.[0] ?? null);

          // 仅当本次真拉了 disks 才更新磁盘 state(失败 null 也保留旧数据,避免清空)
          let diskDataForCache: UnraidDisk[] | undefined;
          if (shouldFetchDisks && diskRaw) {
            const diskData = diskRaw;
            // 计算实时读写速度
            const now = Date.now();
            const updatedDisks = diskData.map((disk) => {
              let readSpeed: number | undefined;
              let writeSpeed: number | undefined;

              // 【续 91 M4】serverUrl 不同(切了服务器)→ 旧采样作废,不做跨机差分
              const lastSample =
                lastSampleRef.current && lastSampleRef.current.serverUrl === serverUrl
                  ? lastSampleRef.current
                  : null;
              if (lastSample && disk.reads !== undefined && disk.writes !== undefined) {
                const prev = lastSample.disks.get(disk.name);
                const timeDiff = (now - lastSample.timestamp) / 1000; // 秒

                if (prev && timeDiff > 0) {
                  const readDiff = disk.reads - prev.reads;
                  const writeDiff = disk.writes - prev.writes;

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
              serverUrl,
              timestamp: now,
              disks: newDiskSample,
            };

            setDisks(updatedDisks);
            // 【续 39-1 候选 - 2026-06-18】磁盘温度历史采样(5min 节流内置)
            recordDiskSnapshot(diskData);
            diskDataForCache = diskData;
          }

          // 【续 91 A2】主数据(getSystemInfo)成功才清 error/记刷新时间/写缓存,
          // 失败(null)不再谎报"已刷新";有旧数据时 error 降级为 banner(M5)
          if (sysInfo) {
            setError(null);
            // 【续 74】真实刷新成功 → 更新全局「上次刷新」时间(自动 tick/手动共用此路径)
            markRefreshed();
            // 保存 cache:本次没拉/拉失败 disks 时用 ref 里的旧 disk 数据,避免覆盖磁盘温度
            // 【续 91 L10】networks/serverMeta 同样从 ref 兜底(对应请求失败时沿用旧值)
            saveDashboardCache(
              {
                systemInfo: sysInfo,
                disks: diskDataForCache ?? disksRef.current,
                networks: networkData ?? networksRef.current,
                serverMeta: meta ?? serverMetaRef.current,
              },
              shouldFetchDisks
            );

            // 【续 32-7】记录历史采样(过去 10 分钟)
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
          } else {
            setError('无法连接到 unRAID 服务器');
          }
        } catch (err) {
          console.error('Failed to fetch data:', err);
          setError('无法连接到 unRAID 服务器');
        } finally {
          if (manual) setIsRefreshing(false);
          setLoading(false);
        }
      })();

      inFlightRef.current = { promise: p, includeDisks };
      try {
        await p;
      } finally {
        if (inFlightRef.current?.promise === p) inFlightRef.current = null;
      }
    },
    [api, isConfigured, serverUrl]
  );

  // 【续 91 M4】给切服务器重置 effect 用:始终指向最新 refreshDashboard
  const refreshDashboardRef = useRef(refreshDashboard);
  useEffect(() => {
    refreshDashboardRef.current = refreshDashboard;
  }, [refreshDashboard]);

  // 【续 45.7 2026-07-01】手动刷新按钮:只清 CPU/内存 cache,**不**清 disks cache
  // refreshDashboard 的 includeDisks=false,本次刷新不会发 getDisks → 不唤盘
  // 用户要看磁盘温度→显式点 DiskCard 上的"刷新磁盘"按钮
  // 【续 88 2026-08-08】删掉原清 getCacheKey('networks') 死代码:networkApi 已不带
  // namespace cache,该 key 永不存在(network/spin 本就不带 cache,见下方 polling 注释)
  // 【续 95 P0】失效口径与轮询 tick 对齐(:442-445 同 4 namespace):原来漏了
  // parity/ups,手动刷新后这两张卡最长 30min 旧数据(30min namespace 缓存)
  const handleManualRefresh = useCallback(async () => {
    invalidateNamespace('systemInfo');
    invalidateNamespace('serverMeta');
    invalidateNamespace('parity');
    invalidateNamespace('ups');
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
  // 【续 95 P1-1】趋势图实际时间窗口 = 采样点数 × 轮询间隔(原 label 写死 10 分钟,
  // 用户改刷新间隔后窗口变了 label 不变,误导)
  const historyWindowMin = Math.max(1, Math.round((HISTORY_POINTS * pollInterval) / 60_000));
  usePolling(
    () => {
      // 【续 73】tick 放行 = dashboard cache 年龄 ≥ pollInterval,此时必须失效
      // 'systemInfo' 的 30min graphql cache,否则 getSystemInfo 喂旧数据,
      // 设置间隔仍被 namespace cache 架空(network/spin 本就不带 cache)
      // 【续 89b】serverMeta 同理(版本/license/更新提醒随同一节拍)
      // 【续 91 D/G】parity/ups 同节拍失效(emhttp 内存态只读,不唤盘不加频)
      invalidateNamespace('systemInfo');
      invalidateNamespace('serverMeta');
      invalidateNamespace('parity');
      invalidateNamespace('ups');
      return refreshDashboard();
    },
    pollInterval,
    true,
    {
      // 【续 45 2026-06-26】dashboard cache < 5min 时跳过 mount 立即 fire,刷新页面不唤醒 array
      skipInitialIf: () => isDashboardCacheFresh(loadDashboardCache()),
      // 【续 73】tick 阈值跟随用户设置的刷新间隔:cache 年龄 < pollInterval 才跳过
      // (原用固定 5min TTL,设置 10-120s 全被架空;磁盘数据不在轮询路径,不唤盘)
      shouldSkipTick: () => {
        const ts = getDashboardCacheTimestamp();
        return ts !== null && Date.now() - ts < pollInterval;
      },
      // 【续 45.7 2026-07-01】默认 respectVisibility=true, resumeDelayMs 默认 30s
      // 切回 tab 不立即 fire,30s 兜底,期间用户操作 (pointerdown/keydown) 立即 fire
    }
  );

  // 【性能优化 2026-06-14】首次加载（无 cache）显示 skeleton + spinner
  if (loading) {
    return <DashboardSkeleton />;
  }

  // 【续 91 M5】错误不再整屏:有数据(上次成功)时降级为顶部 banner,
  // 只有无数据/未配置才整屏提示
  if (!hasConfig || (error && !systemInfo)) {
    return <ConfigRequiredState error={error} />;
  }

  return (
    <div className="p-4 space-y-4">
      {/* 【续 91 M5】有数据时的刷新失败 banner(不遮挡旧数据) */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-3 flex items-center">
          <Icon
            icon={AlertTriangle}
            size={16}
            className="mr-2 shrink-0 text-red-500 dark:text-red-400"
          />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          {/* 【续 97 P1-3】banner 内直接给重试入口(原要回头卡找刷新按钮) */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="重试刷新"
          >
            <Icon icon={RefreshCw} size={12} className={isRefreshing ? 'animate-spin' : ''} />
            重试
          </button>
        </div>
      )}

      {/* 【续 68 GUI 焕新】门面头卡:主色渐变 + 阵列状态 pill + 幽灵刷新按钮
          (原黑字标题 + 灰色 uptime 朴素头部已并入 ServerHeroCard) */}
      <ServerHeroCard
        name={systemInfo?.name}
        uptime={systemInfo?.uptime}
        arrayStatus={systemInfo?.arrayStatus}
        meta={serverMeta}
        isRefreshing={isRefreshing}
        onRefresh={handleManualRefresh}
      />

      {/* 【续 34-2】按 order 渲染卡片(可拖拽重排) */}
      {order.map((key, idx) => {
        const card = renderCard(key, {
          systemInfo,
          history: key === 'cpu' ? cpuHistory : memHistory,
          networks,
          isRefreshing,
          disks,
          containers,
          vms,
          containersLoading,
          containersCacheAge,
          dashboardCacheAge,
          disksCacheAge,
          onRefreshDisks: handleRefreshDisks,
          spinMap,
          parity,
          ups,
          historyWindowMin,
        });
        return (
          <DraggableCard key={key} id={key} index={idx} totalCount={order.length} onMove={move}>
            {card}
          </DraggableCard>
        );
      })}

      {/* 【续 78】多服务器聚合卡(Pro,≥2 台才渲染):固定卡片流末尾,不进拖拽排序 */}
      <OtherServersCard />

      {/* 重置按钮(【续 90】原生 confirm → useDialog 弹窗) */}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            if (
              await dialog.confirm({
                title: '恢复默认顺序',
                message: '恢复 Dashboard 卡片为默认顺序?',
              })
            )
              reset();
          }}
          className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600"
        >
          <Icon icon={RotateCcw} size={12} />
          恢复默认顺序
        </button>
      </div>
      <Dialog {...dialog} />
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
    /** 【续 89】VM 数据(与 containers 同 hook 同轮拉取),给 VmSummaryCard 用 */
    vms: UnraidVM[];
    containersLoading: boolean;
    containersCacheAge?: number | null;
    /** 【续 45.7 2026-07-01】dashboard 自身数据 cache age,给 5 个数据卡用 */
    dashboardCacheAge?: number | null;
    /** 【续 45.8 2026-07-04】磁盘数据独立 cache age(头部🔄不刷磁盘时不变),给 DiskCard 用 */
    disksCacheAge?: number | null;
    /** 【续 45.8 2026-07-04】DiskCard 显式刷新磁盘按钮回调 */
    onRefreshDisks?: () => void;
    /** 【续 66】磁盘休眠状态(name → isSpinning),给 DiskCard 用 */
    spinMap?: Map<string, boolean>;
    /** 【续 91 D】parity 校验状态(null=查询失败/老 schema,ParityCard 不渲染) */
    parity?: UnraidParityStatus | null;
    /** 【续 91 G】UPS 设备(null=无 UPS/查询失败,UpsCard 不渲染;未解锁走 ProGate) */
    ups?: UnraidUpsDevice | null;
    /** 【续 95 P1-1】趋势图实际时间窗口(分钟),给 CpuCard/MemoryCard 的 label 用 */
    historyWindowMin: number;
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
          historyWindowMin={props.historyWindowMin}
        />
      );
    case 'memory':
      return (
        <MemoryCard
          systemInfo={props.systemInfo}
          history={props.history}
          cacheAgeMs={props.dashboardCacheAge}
          historyWindowMin={props.historyWindowMin}
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
    case 'vms':
      return (
        <VmSummaryCard
          vms={props.vms}
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
    case 'disk':
      return (
        <DiskCard
          disks={props.disks}
          cacheAgeMs={props.disksCacheAge}
          onRefreshDisks={props.onRefreshDisks}
          isRefreshing={props.isRefreshing}
          spinMap={props.spinMap}
        />
      );
    // 【续 91 D】parity 校验进度卡(免费;null → 卡内不渲染)
    case 'parity':
      return <ParityCard status={props.parity ?? null} />;
    // 【续 91 G】UPS 监控卡(Pro;门控在前数据在后,卡内处理)
    case 'ups':
      return <UpsCard ups={props.ups ?? null} />;
    default:
      return null;
  }
}
