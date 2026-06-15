// 【阶段 1 P0 - 2026-06-17 续 29-1】从 Shares.tsx 拆出文件操作 handler
// 包含:delete / rename / move / copy / createFolder / download / batchDelete
// + 7 个 modal state + actionLoading
// 依赖:useDialog (confirm 弹窗) + useToast (错误提示) + davFetch (DAV 操作)
// 【阶段 P1-toast - 2026-06-17 续 29-5】危险操作的 confirm 仍走 dialog,
//        普通失败/完成提示改 toast(不阻塞操作)
// 【2026-07-19 修复】dialog 改为调用方传入:
//   useDialog() 是每实例独立 useState,hook 内部自建实例的 Dialog 无人渲染,
//   confirm promise 永远挂起 → 删除/批量删除点击无效。
//   必须由页面传入"已渲染 <Dialog>"的那个实例。
import { useCallback, useMemo, useState } from 'react';
import { davFetch, FileItem } from '../components/shares/davAuth';
import { useDialog } from './useDialog';
import { useToast } from './useToast';

export interface UseFileActionsArgs {
  path: string;
  paths: { toDavPath: (p: string) => string };
  fetchDir: (p: string) => Promise<void>;
  /** 页面侧 useDialog 实例(其 <Dialog> 已渲染),危险操作 confirm 用 */
  dialog: ReturnType<typeof useDialog>;
}

export interface FileActionState {
  actionLoading: boolean;
  showNewFolder: boolean;
  newFolderName: string;
  showRename: { item: FileItem; newName: string } | null;
  showMoveCopy: { item: FileItem; dest: string; mode: 'move' | 'copy' } | null;
}

export interface UseFileActionsResult extends FileActionState {
  // openers (UI click)
  openNewFolder: () => void;
  closeNewFolder: () => void;
  setNewFolderName: (v: string) => void;
  openRename: (item: FileItem) => void;
  closeRename: () => void;
  setRenameName: (v: string) => void;
  openCopy: (item: FileItem) => void;
  openMove: (item: FileItem) => void;
  closeMoveCopy: () => void;
  setMoveCopyDest: (v: string) => void;
  // executors
  handleCreateFolder: () => Promise<void>;
  handleRename: () => Promise<void>;
  handleMoveCopy: () => Promise<void>;
  handleDelete: (item: FileItem) => Promise<void>;
  handleDownload: (item: FileItem) => Promise<void>;
  handleBatchDelete: (selectedPaths: Set<string>, onDone: () => void) => Promise<void>;
}

export function useFileActions({
  path,
  paths,
  fetchDir,
  dialog,
}: UseFileActionsArgs): UseFileActionsResult {
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRename, setShowRename] = useState<{ item: FileItem; newName: string } | null>(null);
  const [showMoveCopy, setShowMoveCopy] = useState<{
    item: FileItem;
    dest: string;
    mode: 'move' | 'copy';
  } | null>(null);

  // openers
  const openNewFolder = useCallback(() => setShowNewFolder(true), []);
  const closeNewFolder = useCallback(() => setShowNewFolder(false), []);
  const openRename = useCallback((item: FileItem) => {
    setShowRename({ item, newName: item.name });
  }, []);
  const closeRename = useCallback(() => setShowRename(null), []);
  const setRenameName = useCallback((v: string) => {
    setShowRename((prev) => (prev ? { ...prev, newName: v } : prev));
  }, []);
  const openCopy = useCallback((item: FileItem) => {
    setShowMoveCopy({ item, dest: '', mode: 'copy' });
  }, []);
  const openMove = useCallback((item: FileItem) => {
    setShowMoveCopy({ item, dest: '', mode: 'move' });
  }, []);
  const closeMoveCopy = useCallback(() => setShowMoveCopy(null), []);
  const setMoveCopyDest = useCallback((v: string) => {
    setShowMoveCopy((prev) => (prev ? { ...prev, dest: v } : prev));
  }, []);

  // executors
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    setActionLoading(true);
    try {
      const basePath = path ? (path.endsWith('/') ? path : path + '/') : '';
      const response = await davFetch(paths.toDavPath(basePath + newFolderName.trim() + '/'), {
        method: 'MKCOL',
      });
      if (!response.ok && response.status !== 405) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setShowNewFolder(false);
      setNewFolderName('');
      fetchDir(path);
    } catch (err) {
      toast.error(`创建失败: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  }, [newFolderName, path, paths, fetchDir, toast]);

  const handleRename = useCallback(async () => {
    if (!showRename) return;
    const { item, newName } = showRename;
    if (!newName.trim() || newName === item.name) {
      setShowRename(null);
      return;
    }
    setActionLoading(true);
    try {
      let parent = item.path;
      if (parent.endsWith('/')) parent = parent.slice(0, -1);
      const lastSlash = parent.lastIndexOf('/');
      parent = lastSlash < 0 ? '' : parent.substring(0, lastSlash + 1);
      const destPath = `${parent}${newName}${item.isDir ? '/' : ''}`;
      const response = await davFetch(paths.toDavPath(item.path), {
        method: 'MOVE',
        headers: { Destination: paths.toDavPath(destPath) },
      });
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        // 目录 move 在某些 nginx 上返 404 但实际成功,做一次兜底
        if (item.isDir && response.status === 404) {
          const checkResp = await davFetch(paths.toDavPath(destPath), { method: 'HEAD' });
          if (checkResp.ok) {
            await davFetch(paths.toDavPath(item.path), { method: 'DELETE' });
            setShowRename(null);
            fetchDir(path);
            return;
          }
        }
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setShowRename(null);
      fetchDir(path);
    } catch (err) {
      toast.error(`重命名失败: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  }, [showRename, paths, path, fetchDir, toast]);

  const handleMoveCopy = useCallback(async () => {
    if (!showMoveCopy) return;
    const { item, dest, mode } = showMoveCopy;
    if (!dest.trim()) return;
    setActionLoading(true);
    try {
      const destBase = dest.startsWith('/') ? dest.replace(/^\/+/, '') : (path ? path : '') + dest;
      const finalDest =
        destBase.endsWith('/') || item.isDir
          ? `${destBase}${destBase.endsWith('/') ? '' : '/'}${item.name}${item.isDir ? '/' : ''}`
          : destBase;
      const response = await davFetch(paths.toDavPath(item.path), {
        method: mode === 'move' ? 'MOVE' : 'COPY',
        headers: { Destination: paths.toDavPath(finalDest) },
      });
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        if (mode === 'move' && item.isDir && response.status === 404) {
          const checkResp = await davFetch(paths.toDavPath(finalDest), { method: 'HEAD' });
          if (checkResp.ok) {
            await davFetch(paths.toDavPath(item.path), { method: 'DELETE' });
            setShowMoveCopy(null);
            fetchDir(path);
            return;
          }
        }
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setShowMoveCopy(null);
      fetchDir(path);
    } catch (err) {
      toast.error(`${mode === 'move' ? '移动' : '拷贝'}失败: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  }, [showMoveCopy, paths, path, fetchDir, toast]);

  const handleDelete = useCallback(
    async (item: FileItem) => {
      const ok = await dialog.confirm({
        title: '删除',
        message: `确定删除 "${item.name}"？${item.isDir ? '\n（目录内所有内容将一并删除）' : ''}\n5 秒内可撤销,文件会暂存到 .trash/`,
        danger: true,
      });
      if (!ok) return;
      setActionLoading(true);
      try {
        // 【阶段 P1-undo - 2026-06-17 续 30-3】软删除:MOVE 到 .trash/ 而非真 DELETE
        // 撤销 = 移回原路径。不撤销则文件留在 .trash(用户可后续清理)
        const trashDir = '.trash/';
        // 确保 .trash 存在(允许 405=已存在)
        await davFetch(paths.toDavPath(trashDir), { method: 'MKCOL' });
        const ts = Date.now();
        const trashName = `${ts}_${item.name}${item.isDir ? '/' : ''}`;
        const trashPath = `${trashDir}${trashName}`;
        const response = await davFetch(paths.toDavPath(item.path), {
          method: 'MOVE',
          headers: { Destination: paths.toDavPath(trashPath) },
        });
        if (!response.ok && response.status !== 201 && response.status !== 204) {
          // 某些 nginx MOVE 失败兜底:真 DELETE
          const fallback = await davFetch(paths.toDavPath(item.path), { method: 'DELETE' });
          if (!fallback.ok && fallback.status !== 404) {
            const text = await fallback.text();
            throw new Error(text || `HTTP ${fallback.status}`);
          }
        }
        // 弹可撤销 toast(5 秒)
        toast.success(`已删除 ${item.name}`, 5000, {
          label: '撤销',
          onClick: () => {
            void (async () => {
              try {
                const back = await davFetch(paths.toDavPath(trashPath), {
                  method: 'MOVE',
                  headers: { Destination: paths.toDavPath(item.path) },
                });
                if (!back.ok && back.status !== 201 && back.status !== 204) {
                  const text = await back.text();
                  throw new Error(text || `HTTP ${back.status}`);
                }
                toast.success(`已恢复 ${item.name}`);
                fetchDir(path);
              } catch (e) {
                toast.error(`恢复失败: ${(e as Error).message}`);
              }
            })();
          },
        });
        fetchDir(path);
      } catch (err) {
        toast.error(`删除失败: ${(err as Error).message}`);
      } finally {
        setActionLoading(false);
      }
    },
    [dialog, paths, path, fetchDir, toast]
  );

  const handleDownload = useCallback(
    async (item: FileItem) => {
      try {
        const response = await davFetch(paths.toDavPath(item.path));
        if (!response.ok) throw new Error('Download failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.error(`下载失败: ${(err as Error).message}`);
      }
    },
    [paths, toast]
  );

  const handleBatchDelete = useCallback(
    async (selectedPaths: Set<string>, onDone: () => void) => {
      if (selectedPaths.size === 0) return;
      const ok = await dialog.confirm({
        title: '批量删除',
        message: `确定删除选中的 ${selectedPaths.size} 项？\n目录内所有内容将一并删除,文件会暂存到 .trash/`,
        danger: true,
      });
      if (!ok) return;
      setActionLoading(true);
      // 【阶段 P1-undo - 2026-06-17 续 30-3】批量软删除:逐个 MOVE 到 .trash/
      const trashDir = '.trash/';
      // 确保 .trash 存在(允许 405=已存在)
      try {
        await davFetch(paths.toDavPath(trashDir), { method: 'MKCOL' });
      } catch {
        // 忽略
      }
      const batchTs = Date.now();
      const movedPaths: Array<{ original: string; trashPath: string; name: string }> = [];
      let okCount = 0;
      let failCount = 0;
      try {
        for (const p of selectedPaths) {
          const name = p.split('/').filter(Boolean).pop() || p;
          const trashName = `${batchTs}_${name}`;
          const trashPath = `${trashDir}${trashName}`;
          try {
            // 先尝试 MOVE
            const resp = await davFetch(paths.toDavPath(p), {
              method: 'MOVE',
              headers: { Destination: paths.toDavPath(trashPath) },
            });
            if (resp.ok || resp.status === 201 || resp.status === 204) {
              okCount++;
              movedPaths.push({ original: p, trashPath, name });
            } else {
              // 兜底:真 DELETE
              const fb = await davFetch(paths.toDavPath(p), { method: 'DELETE' });
              if (fb.ok || fb.status === 404) okCount++;
              else failCount++;
            }
          } catch {
            failCount++;
          }
        }
      } finally {
        setActionLoading(false);
      }
      // 批量结果走 toast(成功/失败一目了然,不阻塞)
      if (failCount === 0 && movedPaths.length > 0) {
        toast.success(`批量删除 ${okCount} 项(在 .trash/)`, 5000, {
          label: '撤销',
          onClick: () => {
            void (async () => {
              let restored = 0;
              for (const m of movedPaths) {
                try {
                  const back = await davFetch(paths.toDavPath(m.trashPath), {
                    method: 'MOVE',
                    headers: { Destination: paths.toDavPath(m.original) },
                  });
                  if (back.ok || back.status === 201 || back.status === 204) restored++;
                } catch {
                  // 继续下一个
                }
              }
              if (restored > 0) {
                toast.success(`已恢复 ${restored} 项`);
                fetchDir(path);
              } else {
                toast.error('恢复失败');
              }
            })();
          },
        });
      } else if (failCount === 0) {
        toast.success(`批量删除成功 ${okCount} 项`);
      } else if (okCount === 0) {
        toast.error(`批量删除全部失败 (${failCount} 项)`);
      } else {
        toast.warning(`批量删除完成: 成功 ${okCount}, 失败 ${failCount}`);
      }
      onDone();
      fetchDir(path);
    },
    [dialog, paths, path, fetchDir, toast]
  );

  return useMemo(
    () => ({
      actionLoading,
      showNewFolder,
      newFolderName,
      showRename,
      showMoveCopy,
      openNewFolder,
      closeNewFolder,
      setNewFolderName,
      openRename,
      closeRename,
      setRenameName,
      openCopy,
      openMove,
      closeMoveCopy,
      setMoveCopyDest,
      handleCreateFolder,
      handleRename,
      handleMoveCopy,
      handleDelete,
      handleDownload,
      handleBatchDelete,
    }),
    [
      actionLoading,
      showNewFolder,
      newFolderName,
      showRename,
      showMoveCopy,
      openNewFolder,
      closeNewFolder,
      openRename,
      closeRename,
      setRenameName,
      openCopy,
      openMove,
      closeMoveCopy,
      setMoveCopyDest,
      handleCreateFolder,
      handleRename,
      handleMoveCopy,
      handleDelete,
      handleDownload,
      handleBatchDelete,
    ]
  );
}
