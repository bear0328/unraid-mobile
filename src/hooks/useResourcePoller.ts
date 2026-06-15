// 【阶段 P2-质量 - 2026-06-17 续 39-3】useResourcePoller
// 替代"API 轮询 + baseline 比对 + cooldown LS"重复 pattern
// 典型用例:useContainerEventWatcher(80+ 行 → 调用本 hook + 简短的 onChange 处理器)
// 任何"轮询拉列表 + 状态从 X 切到 Y 时触发副作用"都能用
// 【续 45 2026-06-26】加 skipInitialIf + respectVisibility:刷新页面不立即 fire、tab 隐藏停轮询
// 【续 45.7 2026-07-01】加 resumeDelayMs:visibility 切回不立即 fire,等兜底;期间用户操作立即 fire
import { useEffect, useRef } from 'react';
import { isPageHidden, onVisibilityChange, useResumeActivity } from './usePageVisibility';

interface ResourceItem {
  // 资源唯一标识
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

interface Options<T extends ResourceItem> {
  /** 总开关 */
  enabled: boolean;
  /** 拉数据的 fetcher,返回资源列表 */
  fetcher: () => Promise<T[]>;
  /** 资源唯一 key 提取 */
  keyOf: (item: T) => string;
  /** 资源当前状态提取 */
  stateOf: (item: T) => string;
  /** baseline LS key(存上次状态映射) */
  baselineKey: string;
  /** cooldown LS key(存每资源 lastFire 时间) */
  cooldownKey: string;
  /** 同一资源连续触发的最小间隔 */
  cooldownMs: number;
  /** 轮询间隔 */
  pollMs: number;
  /** 状态变化回调(prev → cur)。可空,表示只 fire-and-forget */
  onChange?: (item: T, prevState: string) => void;
  /** 拉取失败的回调 */
  onError?: (e: unknown) => void;
  /** 【续 45 2026-06-26】返回 true 跳过 mount 立即 fire。命中 cache 时跳过,避免刷新页面唤醒 disk */
  skipInitialIf?: () => boolean;
  /** 【续 45 2026-06-26】tab 隐藏时停轮询。默认 true */
  respectVisibility?: boolean;
  /** 【续 45 2026-06-26】每次 tick 前调用,返 true 跳过本次 fetch。cache 命中时跳过 */
  shouldSkipTick?: () => boolean;
  /** 【续 45.7 2026-07-01】visibility 切回 tab 后等多久没操作才 fire 兜底(ms)。0 = 切回立即 fire (旧行为)。默认 30_000 (30s) */
  resumeDelayMs?: number;
}

function readMap(key: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeMap(key: string, m: Record<string, string>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function useResourcePoller<T extends ResourceItem>(opts: Options<T>): void {
  const {
    enabled,
    fetcher,
    keyOf,
    stateOf,
    baselineKey,
    cooldownKey,
    cooldownMs,
    pollMs,
    onChange,
    onError,
    skipInitialIf,
    respectVisibility = true,
    shouldSkipTick,
    resumeDelayMs = 30_000,
  } = opts;
  // 用 ref 持有最新回调,避免 deps 变化导致 effect 重启
  // 【续 50 C12】skipInitialIf 也进 ref:调用方传 inline 箭头时每次 render 新引用,
  // 放 deps 会让 effect 拆建、轮询节拍被 render 频率劫持
  const cbRef = useRef({ onChange, onError, fetcher, keyOf, stateOf, shouldSkipTick, skipInitialIf });
  cbRef.current = { onChange, onError, fetcher, keyOf, stateOf, shouldSkipTick, skipInitialIf };

  // 【续 45.7 2026-07-01】顶层 ref 暴露 tick / scheduleNext / missedTicks,让 useResumeActivity (顶层调) 能访问
  const stateRef = useRef<{
    tick: (() => void) | null;
    scheduleNext: (() => void) | null;
    missedTicks: number;
  }>({ tick: null, scheduleNext: null, missedTicks: 0 });

  useResumeActivity({
    enabled: respectVisibility && resumeDelayMs > 0,
    delayMs: resumeDelayMs,
    onIdle: () => {
      if (stateRef.current.missedTicks > 0) {
        stateRef.current.missedTicks = 0;
        stateRef.current.tick?.();
      } else {
        stateRef.current.scheduleNext?.();
      }
    },
    onActive: () => {
      if (stateRef.current.missedTicks > 0) {
        stateRef.current.missedTicks = 0;
        stateRef.current.tick?.();
      }
    },
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isFirstRun = true;

    async function tick() {
      if (cancelled) return;
      // 【续 45 2026-06-26】每次 tick 前查 shouldSkipTick(cache 命中跳过 fetch)
      if (cbRef.current.shouldSkipTick?.()) {
        scheduleNext();
        return;
      }
      try {
        const items = await cbRef.current.fetcher();
        if (cancelled) return;
        const baseline = readMap(baselineKey);
        const cooldown = readMap(cooldownKey);
        const now = Date.now();
        const nextBaseline: Record<string, string> = {};
        for (const item of items) {
          const k = cbRef.current.keyOf(item);
          const st = cbRef.current.stateOf(item);
          nextBaseline[k] = st;
          if (isFirstRun) continue;
          const prev = baseline[k];
          if (prev == null || prev === st) continue;
          // 状态变化
          const lastTs = Number(cooldown[k] || 0);
          if (now - lastTs < cooldownMs) continue;
          cooldown[k] = String(now);
          writeMap(cooldownKey, cooldown);
          try {
            cbRef.current.onChange?.(item, prev);
          } catch (e) {
            /* 防止 onChange 抛错毁整个 tick */ console.warn('[resourcePoller] onChange threw:', e);
          }
        }
        writeMap(baselineKey, nextBaseline);
        isFirstRun = false;
      } catch (e) {
        if (!cancelled) cbRef.current.onError?.(e);
      } finally {
        if (!cancelled) scheduleNext();
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      // visibility 暂停:tab 隐藏时跳过,visible 后补
      if (respectVisibility && isPageHidden()) {
        stateRef.current.missedTicks++;
        // 等到 visible 才调度下一次(由 visibilitychange 处理)
        return;
      }
      timer = setTimeout(tick, pollMs);
    }

    // 【续 45.7】暴露给 useResumeActivity (顶层 hook)
    stateRef.current.tick = tick;
    stateRef.current.scheduleNext = scheduleNext;
    stateRef.current.missedTicks = 0;

    // 【续 45 2026-06-26】skipInitialIf 命中 → 跳过 mount 立即 tick
    // 【续 50 C12】从 cbRef 读,deps 只留稳定值,inline 箭头不再重启 effect
    const shouldSkipInitial = cbRef.current.skipInitialIf?.() === true;
    if (shouldSkipInitial) {
      isFirstRun = false; // 不算首次(否则 baseline 不会被建立,反而不安全)
      // 调度第一次(走正常 pollMs 路径)
      scheduleNext();
    } else {
      tick();
    }

    // 【续 45.7 2026-07-01】切走时清 timer;切回行为由 useResumeActivity 接管
    let unsubVisibility: (() => void) | undefined;
    if (respectVisibility) {
      unsubVisibility = onVisibilityChange((hidden) => {
        if (hidden) {
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
        }
        // visible 切回逻辑由顶层 useResumeActivity 处理 (30s 倒计时 + 活跃检测)
      });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubVisibility?.();
      // 清理 ref,防止 useResumeActivity 调 dangling
      stateRef.current.tick = null;
      stateRef.current.scheduleNext = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stateRef.current.missedTicks = 0;
    };
  }, [enabled, baselineKey, cooldownKey, cooldownMs, pollMs, respectVisibility]);
}
