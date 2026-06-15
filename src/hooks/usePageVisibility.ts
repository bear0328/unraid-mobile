// 【续 45 2026-06-26】tab 可见性 hook
// 单一职责:封装 document.hidden + visibilitychange 监听,避免 usePolling / 其它轮询
// 模块各自挂 listener 浪费。
// SSR 安全(document 不存在时返回 no-op)。
// 【续 45.7 2026-07-01】useResumeActivity:hidden→visible 切回时启动倒计时 +
// pointerdown/keydown 监听;倒计时内用户操作 → onActive;倒计时结束 → onIdle。
// 解决 visibility resume 立即 fire 唤盘的真问题。
import { useEffect, useRef } from 'react';

export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/**
 * 注册 visibilitychange 监听。
 * @param fn 状态变化时回调(hidden=true 表示 tab 不可见)
 * @returns 取消订阅函数
 */
export function onVisibilityChange(fn: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => fn(document.hidden);
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * 【续 45.7 2026-07-01】切回 tab 后等用户活跃检测。
 * - hidden → visible 切回时启动 delayMs 倒计时,同时挂 pointerdown/keydown 监听
 * - 倒计时内用户操作 → onActive(立即拉,响应"切回就想看")
 * - 倒计时结束(用户没操作) → onIdle(兜底拉 1 次)
 * - 倒计时期间 tab 再切走 → 取消倒计时,不 fire 任何回调
 * - 各 polling hook 调这个 hook 替代"切回立即 fire"的旧行为
 */
export interface ResumeActivityOptions {
  /** 是否启用。false 时不挂 visibilitychange / user activity listener,纯 no-op */
  enabled: boolean;
  /** 切回后等多久没操作就 fire 兜底(ms) */
  delayMs: number;
  /** 倒计时结束(用户没操作)触发 */
  onIdle: () => void;
  /** 倒计时内用户操作(pointerdown/keydown)触发 */
  onActive: () => void;
}

export function useResumeActivity(opts: ResumeActivityOptions): void {
  const { enabled, delayMs, onIdle, onActive } = opts;
  // 用 ref 跟随最新 callback,避免 deps 变化频繁重启 effect
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  useEffect(() => {
    if (!enabled) return;
    let active = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function removeUserListeners() {
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
    }
    function onUserActivity() {
      if (!active) return;
      active = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      removeUserListeners();
      onActiveRef.current();
    }

    const unsubVis = onVisibilityChange((hidden) => {
      if (hidden) {
        // 切走:cancel 倒计时 + 卸 listener, 不 fire 任何回调
        if (active) {
          active = false;
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          removeUserListeners();
        }
        return;
      }
      // 切回 tab:启动倒计时 + 监听用户操作
      active = true;
      timer = setTimeout(() => {
        active = false;
        timer = undefined;
        removeUserListeners();
        onIdleRef.current();
      }, delayMs);
      // 不传 once: 手动管理 (pointerdown 触发后 keydown listener 还在)
      window.addEventListener('pointerdown', onUserActivity, { passive: true });
      window.addEventListener('keydown', onUserActivity);
    });

    return () => {
      unsubVis();
      if (active) {
        active = false;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        removeUserListeners();
      }
    };
  }, [enabled, delayMs]);
}
