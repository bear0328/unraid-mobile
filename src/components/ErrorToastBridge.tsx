// 【阶段 P1-toast - 2026-06-17 续 30-2】错误 toast 桥接
// 挂 App 顶层,内部调 useErrorToast() 启动订阅
// 拆出组件是因为 hook 必须在 React 树里调用(不能写在 App 顶层外的工具函数)
import { useErrorToast } from '../hooks/useErrorToast';

export default function ErrorToastBridge() {
  useErrorToast();
  return null;
}
