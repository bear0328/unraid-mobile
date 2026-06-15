// 【阶段 1 P0 - 2026-06-15 续 3】多文件上传队列
// 从单文件改为：UploadItem[] 队列 + 3 并发 + abort/retry/remove + 自动调度
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDavAuthHeader } from '../components/shares/davAuth';
import type { SharesPaths } from './useShares';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  xhr?: XMLHttpRequest;
  /** 入队时锁定的目标路径（避免中途切换目录导致上传错位） */
  targetPath: string;
}

export interface UseFileUploadOpts {
  paths: SharesPaths;
  currentPath: string;
  /** 队列超限时回调（参数：被忽略的文件数）。父组件接 useDialog.alert 统一弹窗 */
  onQueueFull?: (dropped: number) => void;
}

export interface UseFileUploadResult {
  queue: UploadItem[];
  enqueue: (files: FileList | File[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  uploading: boolean;
  activeCount: number;
}

const MAX_QUEUE = 10;
const MAX_CONCURRENT = 3;

export function useFileUpload({
  paths,
  currentPath,
  onQueueFull,
}: UseFileUploadOpts): UseFileUploadResult {
  const [queue, setQueue] = useState<UploadItem[]>([]);

  // paths/currentPath 在 useShares 内是 render 作用域内重算的 const,
  // 用 ref 让 startUpload 保持稳定引用,避免 effect 重复触发导致重复 XHR
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const pathsRef = useRef(paths);
  pathsRef.current = paths;

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const cp = currentPathRef.current;
      const basePath = cp ? (cp.endsWith('/') ? cp : cp + '/') : '';
      setQueue((prev) => {
        const available = Math.max(0, MAX_QUEUE - prev.length);
        if (arr.length > available) {
          const dropped = arr.length - available;
          // 通知父组件（弹窗/Toast 等）。放在 queueMicrotask 避免阻塞 setState 视觉更新
          queueMicrotask(() => onQueueFull?.(dropped));
        }
        const accepted = arr.slice(0, available);
        const items: UploadItem[] = accepted.map((f) => ({
          id: crypto.randomUUID(),
          file: f,
          status: 'queued',
          progress: 0,
          targetPath: basePath + f.name,
        }));
        return [...prev, ...items];
      });
    },
    [onQueueFull]
  );

  const startUpload = useCallback((item: UploadItem) => {
    const ps = pathsRef.current;
    const authHeaders = getDavAuthHeader();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ps.toDavPath(item.targetPath));
    Object.entries(authHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id && it.status === 'uploading'
              ? { ...it, progress: Math.round((e.loaded / e.total) * 100) }
              : it
          )
        );
      }
    };
    xhr.onload = () => {
      setQueue((prev) => {
        const cur = prev.find((it) => it.id === item.id);
        // 已被 cancel/remove:忽略 XHR 后续回调,避免覆盖状态
        if (!cur || cur.status !== 'uploading') return prev;
        if (xhr.status >= 200 && xhr.status < 300) {
          return prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'done' as const, progress: 100, xhr: undefined }
              : it
          );
        }
        // 【续 50.2】nginx 鉴权失败改返 403(防浏览器原生弹窗),401/403 同判
        if (xhr.status === 401 || xhr.status === 403) {
          return prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'failed' as const,
                  xhr: undefined,
                  error: `WebDAV 鉴权失败 (${xhr.status})。请在「设置」页面配置 WebDAV 密码。`,
                }
              : it
          );
        }
        const text = (xhr.responseText || '').slice(0, 100);
        return prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'failed' as const,
                xhr: undefined,
                error: `HTTP ${xhr.status}${text ? ': ' + text : ''}`,
              }
            : it
        );
      });
    };
    xhr.onerror = () => {
      setQueue((prev) => {
        const cur = prev.find((it) => it.id === item.id);
        if (!cur || cur.status !== 'uploading') return prev;
        return prev.map((it) =>
          it.id === item.id
            ? { ...it, status: 'failed' as const, xhr: undefined, error: '网络错误' }
            : it
        );
      });
    };
    setQueue((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading' as const, xhr } : it))
    );
    xhr.send(item.file);
  }, []);

  // 并发调度:扫描 queued,补到 MAX_CONCURRENT 上限
  useEffect(() => {
    const uploadingCount = queue.filter((it) => it.status === 'uploading').length;
    if (uploadingCount >= MAX_CONCURRENT) return;
    const slots = MAX_CONCURRENT - uploadingCount;
    const next = queue.filter((it) => it.status === 'queued').slice(0, slots);
    next.forEach((it) => startUpload(it));
  }, [queue, startUpload]);

  const cancel = useCallback((id: string) => {
    setQueue((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.status === 'uploading' && it.xhr) it.xhr.abort();
      return prev.map((x) =>
        x.id === id ? { ...x, status: 'cancelled' as const, xhr: undefined } : x
      );
    });
  }, []);

  const retry = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, status: 'queued' as const, progress: 0, error: undefined, xhr: undefined }
          : x
      )
    );
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.status === 'uploading' && it.xhr) it.xhr.abort();
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) =>
      prev.filter(
        (it) => it.status !== 'done' && it.status !== 'cancelled' && it.status !== 'failed'
      )
    );
  }, []);

  const uploading = queue.some((it) => it.status === 'uploading');
  const activeCount = queue.filter(
    (it) => it.status === 'queued' || it.status === 'uploading'
  ).length;

  return { queue, enqueue, cancel, retry, remove, clearCompleted, uploading, activeCount };
}
