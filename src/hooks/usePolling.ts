import { useEffect, useRef } from 'react';
import { isPageHidden, useResumeActivity } from './usePageVisibility';

/**
 * 【续 45 2026-06-26】轮询 options
 * - jitter:mount 时随机抖动,避免多个 hook 同时 fire 撞车
 * - respectVisibility:tab 不可见时暂停轮询,避免后台浪费 IO
 * - skipInitialIf:返回 true 时跳过 mount 立即 fire(典型用法:命中 namespace cache)
 * - shouldSkipTick:返回 true 时跳过当前 interval tick(典型用法:graphql namespace cache 命中)
 * - 【续 45.7 2026-07-01】resumeDelayMs:hidden→visible 切回后等多久没操作才 fire 兜底
 *   (ms)。0 = 切回立即 fire (旧行为);默认 30s,期间用户操作会立即 fire。
 */
export interface PollingOptions {
  /** Mount 时跳过立即 fire(返回 true 跳过)。用于"先看 cache,有就先用"。 */
  skipInitialIf?: () => boolean;
  /** tab 不可见时是否暂停。默认 true。设 false 可保留旧行为。 */
  respectVisibility?: boolean;
  /** Mount 立即 fire 的随机抖动上限(ms)。默认 min(delay/4, 1000)。设 0 禁用。 */
  initialJitterMs?: number;
  /**
   * 每次 interval tick 前调用,返 true 跳过本次 fire(不调 callback)。
   * 典型用法:graphql namespace cache 命中时跳过,避免重复 fetch。
   * 注意:skip 不会重置 interval 节拍——下一次 tick 仍按 delay 触发。
   */
  shouldSkipTick?: () => boolean;
  /**
   * 【续 45.7 2026-07-01】visibility 切回 tab 后等多久没操作就 fire 兜底(ms)。
   * 0 = 切回立即 fire (续 45.6 旧行为,不推荐)。
   * 默认 30_000 (30s),期间用户操作 (pointerdown/keydown) → 立即 fire。
   * 解决切回 tab 立即拉数据唤醒硬盘的真问题。
   */
  resumeDelayMs?: number;
}

/**
 * 轮询 Hook
 * @param callback 要执行的回调
 * @param delay 间隔（ms）
 * @param enabled 是否启用
 * @param options 见 PollingOptions
 */
export function usePolling(
  callback: () => void | Promise<void>,
  delay: number,
  enabled: boolean = true,
  options: PollingOptions = {}
) {
  const { skipInitialIf, respectVisibility = true, initialJitterMs, shouldSkipTick, resumeDelayMs = 30_000 } = options;
  const savedCallback = useRef(callback);
  // 用 ref 包 shouldSkipTick 避免 deps 变化频繁重启 interval
  const skipTickRef = useRef(shouldSkipTick);
  // 【续 50 C12】skipInitialIf 同样用 ref 持有:调用方传 inline 箭头时每次 render 都是新引用,
  // 放主 effect deps 会让 effect 拆建、interval 重置,轮询节拍被 render 频率劫持
  const skipInitialRef = useRef(skipInitialIf);
  // 【续 45.7 2026-07-01】ref 提到顶层,让 useResumeActivity (顶层调) 能访问
  const lastFireAtRef = useRef(Date.now());
  const cancelledRef = useRef(false);
  useEffect(() => {
    skipTickRef.current = shouldSkipTick;
    skipInitialRef.current = skipInitialIf;
  });

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const fire = () => {
    if (cancelledRef.current) return;
    void savedCallback.current();
  };

  const trackedFire = () => {
    if (cancelledRef.current) return;
    // tick 时也尊重 shouldSkipTick
    if (skipTickRef.current?.()) return;
    lastFireAtRef.current = Date.now();
    fire();
  };

  // 【续 45.7 2026-07-01】visibility 切回行为,顶层调(不能在 useEffect 里调 hook)
  // 启用条件:respectVisibility && resumeDelayMs > 0
  useResumeActivity({
    enabled: respectVisibility && resumeDelayMs > 0,
    delayMs: resumeDelayMs,
    onIdle: () => {
      if (Date.now() - lastFireAtRef.current >= delay) trackedFire();
    },
    onActive: () => {
      if (Date.now() - lastFireAtRef.current >= delay) trackedFire();
    },
  });

  useEffect(() => {
    if (!enabled) return;

    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Mount 立即 fire(skipInitialIf 命中则跳过)
    // 【续 50 C12】从 ref 读,主 effect deps 只留稳定 primitive,inline 箭头不再重启 interval
    const shouldSkipInitial = skipInitialRef.current?.() === true;
    if (!shouldSkipInitial) {
      const maxJitter = initialJitterMs ?? Math.min(Math.floor(delay / 4), 1000);
      if (maxJitter > 0) {
        const jitter = Math.floor(Math.random() * maxJitter);
        timeoutId = setTimeout(fire, jitter);
      } else {
        fire();
      }
    }

    // 创建 interval 并立即捕获 id(用于 cleanup)
    const intervalId = setInterval(() => {
      if (respectVisibility && isPageHidden()) return;
      trackedFire();
    }, delay);

    return () => {
      cancelledRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, enabled, respectVisibility, initialJitterMs]);
}
