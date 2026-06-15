// 【阶段 P2-Webhook - 2026-06-17 续 34-7】App 顶层挂载
// 封装 useContainerEventWatcher(避免 App.tsx 多 hook 套娃)
import { useContainerEventWatcher } from '../hooks/useContainerEventWatcher';
export default function ContainerEventWatcher() {
  useContainerEventWatcher();
  return null;
}
