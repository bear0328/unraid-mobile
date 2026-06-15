// 【阶段 P2-监控 - 2026-06-17 续 36-3】多容器 stats 轮询 + 历史
// 每个 pollInterval 采一次,保留 60 个点
// 用于 Dashboard Top 5 running 容器卡片
// 【续 45.4 2026-06-28】POLL_MS 5s → 10s + 加 visibility pause:
// - 5s 太吵,10s 足够 sparkline 有实时感
// - tab 隐藏时停轮询,可见时立即补 1 次 + 恢复轮询
// 【续 46.4】stats 源改订阅制:fetcher 只读 containerStatsStream 本地 Map,零网络请求
// (不再走 DOCKER_STATS_QUERY graphql,4.35 已删除该查询字段)
// 【续 45.7 2026-07-01】加 resumeDelayMs:visibility 切回不立即 fire,等 30s 兜底
// 期间用户操作 (pointerdown/keydown) 立即 fire,绕过 shouldSkipTick (建 history 必须有新点)
// 【续 50 C12b】shouldSkipTick 参数保留(通用跳过能力),但续 45.5 的"cache 命中跳过
// 省 graphql"用法已随订阅制改造失效 —— 本地读 Map 零成本,跳 tick 只会冻结 sparkline,
// 唯一调用方 ContainerSummaryCard 已停用该参数
import { useEffect, useRef, useState } from 'react';
import { isPageHidden, onVisibilityChange, useResumeActivity } from './usePageVisibility';
import { usePollInterval } from './usePollInterval';

export interface ContainerStatsSnap {
  ts: number;
  cpuPercent: number;
  memPercent: number;
}

export type StatsMap = Record<string, ContainerStatsSnap[]>;

const HISTORY_POINTS = 60;

interface UseMultiContainerStatsOpts {
  /** 容器 ID 列表(传空数组停轮询) */
  ids: string[];
  /** 单次 GraphQL 拿全 stats,回调返 (id -> snap) */
  fetcher: (ids: string[]) => Promise<Record<string, { cpuPercent: number; memPercent: number }>>;
  /**
   * 每次 tick 前调用,返 true 跳过本次 fetch(不调 callback)。
   * 注意:skip 不会重置 setTimeout 节拍,下一次 tick 仍按 pollInterval 触发。
   * 【续 50 C12b】续 45.5 的"cache 命中跳过省 graphql"用法已失效(订阅制后
   * fetcher 零网络),ContainerSummaryCard 已停用;参数保留供有真实 IO 的 fetcher 用。
   */
  shouldSkipTick?: () => boolean;
  /**
   * 【续 45.7 2026-07-01】visibility 切回 tab 后等多久没操作才 fire 兜底(ms)。
   * 0 = 切回立即 fire (旧行为)。默认 30_000 (30s)。
   */
  resumeDelayMs?: number;
}

export function useMultiContainerStats({ ids, fetcher, shouldSkipTick, resumeDelayMs = 30_000 }: UseMultiContainerStatsOpts) {
  const [history, setHistory] = useState<StatsMap>({});
  // 【续 46 2026-07-12】轮询周期从全局配置读取,用户可在 Settings 调节(默认 30s)
  const pollInterval = usePollInterval();
  // ids 在 render scope 里每次重算,这里用 ref 跟随最新值
  const idsRef = useRef(ids);
  idsRef.current = ids;
  // 【续 45.5】shouldSkipTick 用 ref 包,避免 deps 变化导致 effect 重启
  const skipTickRef = useRef(shouldSkipTick);
  skipTickRef.current = shouldSkipTick;
  // 【续 45.7】顶层 ref 暴露 tick + isFirstTick,让 useResumeActivity (顶层调) 能访问
  const stateRef = useRef<{
    tick: (() => Promise<void>) | null;
    isFirstTick: boolean;
  }>({ tick: null, isFirstTick: true });

  useResumeActivity({
    enabled: resumeDelayMs > 0,
    delayMs: resumeDelayMs,
    onIdle: () => {
      // 切回 tab 30s 倒计时结束:重置 isFirstTick 绕过 shouldSkipTick
      // (建 history 必须有新点,跟续 45.5 行为一致)
      stateRef.current.isFirstTick = true;
      void stateRef.current.tick?.();
    },
    onActive: () => {
      // 切回 tab 30s 内用户操作:同上
      stateRef.current.isFirstTick = true;
      void stateRef.current.tick?.();
    },
  });

  const idsKey = ids.join(',');
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    let timer: number | undefined;
    // 【续 45.5】isFirstTick 标志:mount 立即 fire 跳过 shouldSkipTick 检查
    // (建 history 必须有 1 次 fetch);后续 tick 走 shouldSkipTick 路径
    // 【续 45.7】用 ref 替代 local,useResumeActivity 也能重置
    stateRef.current.isFirstTick = true;

    async function tick() {
      if (cancelled) return;
      // 【续 45.5】isFirstTick=true(mount)不查 shouldSkipTick,直接 fire 建 history
      const skip = !stateRef.current.isFirstTick && skipTickRef.current?.();
      stateRef.current.isFirstTick = false;
      // 【续 45.4】tab 隐藏时跳过本次 tick(setTimeout 仍跑,但 tick 内检查)
      if (isPageHidden()) {
        if (!cancelled) timer = window.setTimeout(tick, pollInterval);
        return;
      }
      // 【续 45.5】shouldSkipTick 命中时跳过本次 fetch
      if (skip) {
        if (!cancelled) timer = window.setTimeout(tick, pollInterval);
        return;
      }
      try {
        const snap = await fetcher(idsRef.current);
        if (cancelled) return;
        const now = Date.now();
        setHistory((prev) => {
          const next: StatsMap = { ...prev };
          for (const [id, v] of Object.entries(snap)) {
            const item: ContainerStatsSnap = {
              ts: now,
              cpuPercent: v.cpuPercent,
              memPercent: v.memPercent,
            };
            const arr = next[id] ? [...next[id], item] : [item];
            next[id] = arr.length > HISTORY_POINTS ? arr.slice(-HISTORY_POINTS) : arr;
          }
          return next;
        });
      } catch {
        /* 单次失败忽略 */
      }
      if (!cancelled) timer = window.setTimeout(tick, pollInterval);
    }

    // 【续 45.7】暴露给顶层 useResumeActivity
    stateRef.current.tick = tick;

    // 【续 45.7 2026-07-01】visibility 切回行为由顶层 useResumeActivity 接管 (30s 兜底 + 活跃检测)
    // 切走时清 timer 防止后台 fire
    const unsubVisibility = onVisibilityChange((hidden) => {
      if (hidden && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    });

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubVisibility();
      // 清理 ref,防止 useResumeActivity 调 dangling
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stateRef.current.tick = null;
    };
  }, [idsKey, fetcher, ids.length, pollInterval]);

  return history;
}
