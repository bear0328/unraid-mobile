// 【阶段 P0 - 2026-06-17 续 29-1】Shares 进一步拆分
// 原 526 行 → 目标 < 350 行
// 拆出:useFileActions (handlers + modal state) / FileToolbar / BatchActionsBar
// 本文件只保留:共享数据 + 搜索 + 批量选择 + 拖拽 + 渲染
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Lightbulb, Search, Upload } from 'lucide-react';
import Icon from '../components/ui/Icon';
import LastRefreshText from '../components/ui/LastRefreshText';
import { FileItem } from '../components/shares/davAuth';
import Breadcrumb from '../components/shares/Breadcrumb';
import FileRow from '../components/shares/FileRow';
import ImageLightbox from '../components/shares/ImageLightbox';
import FileToolbar from '../components/shares/FileToolbar';
import BatchActionsBar from '../components/shares/BatchActionsBar';
import { NewFolderModal } from '../components/shares/NewFolderModal';
import { RenameModal } from '../components/shares/RenameModal';
import { MoveCopyModal } from '../components/shares/MoveCopyModal';
import UploadQueue from '../components/shares/UploadQueue';
import Dialog from '../components/shares/Dialog';
import TextFileEditor from '../components/shares/TextFileEditor';
import DiskCleanupModal from '../components/DiskCleanupModal';
import { FileListSkeleton, FileListError, EmptyFolder } from '../components/shares/FileListStates';
import { useShares } from '../hooks/useShares';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileActions } from '../hooks/useFileActions';
import { useFavorites } from '../hooks/useFavorites';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { usePro } from '../hooks/usePro';
import {
  FILE_SORT_OPTIONS,
  SHARE_SORT_OPTIONS,
  loadSharesSort,
  saveSharesSort,
  sortFileItems,
  sortRootShares,
  type FileSortKey,
  type ShareSortKey,
  type SharesSortState,
} from '../utils/sharesSort';

const SEARCH_DEBOUNCE_MS = 300;

export default function Shares() {
  const { path, items, loading, error, paths, fetchDir, refresh, navigateTo, navigateToPath, navigateUp } =
    useShares();

  // 【续 55 商业化】写操作 → Pro:拖拽上传/批量删除未解锁时拦下,跳设置页 License 区
  // (工具条按钮由 FileToolbar 换 🔒 占位;这里兜住非按钮入口)
  const pro = usePro();
  const navigate = useNavigate();
  const goUnlock = useCallback(
    () => navigate('/settings', { state: { focusLicense: true } }),
    [navigate]
  );

  // 【P1-4b】图片预览
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  // 【续 34-8】文本文件编辑
  const [editItem, setEditItem] = useState<FileItem | null>(null);
  // 【续 37-3】磁盘清理 modal
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // 【P1-4c】批量选择
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // 【P1-4d】客户端搜索（debounce）
  const [searchInput, setSearchInput] = useState('');
  const [searchActive, setSearchActive] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchActive(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 【续 90】排序:文件(名称/修改日期/大小) + 根 share(名称/已用/剩余)各存一份,
  // 初始读 LS,变更即写回(unraid-mobile-shares-sort);目录永远排文件前
  const [sort, setSort] = useState<SharesSortState>(loadSharesSort);
  const patchSort = useCallback((patch: Partial<SharesSortState>) => {
    setSort((prev) => {
      const next = { ...prev, ...patch };
      saveSharesSort(next);
      return next;
    });
  }, []);

  // 切换目录时重置批量选择 + 搜索
  useEffect(() => {
    setSelectedPaths(new Set());
    setSelectMode(false);
    setSearchInput('');
    setSearchActive('');
  }, [path]);

  // 危险操作 confirm 弹窗（删除等）— 必须先于 useFileActions 声明并传入,
  // 保证 confirm 弹的是本页渲染的这个 <Dialog>
  const dialog = useDialog();
  // 文件操作 hook（handlers + modal state）
  const actions = useFileActions({ path, paths, fetchDir, dialog });

  // 【续 88 2026-08-08】favorites 订阅上提到列表层,只此一份:
  // 原来每个 FileRow 各自 useFavorites(),N 行 = N 订阅 + N 份 state,收藏增删全表重渲
  const { toggle: toggleFavorite, isFavorite } = useFavorites();
  const handleToggleFavorite = useCallback(
    (item: FileItem) => toggleFavorite({ kind: 'path', value: item.path, label: item.name }),
    [toggleFavorite]
  );

  // 上传 hook（队列 + 拖拽）
  const toast = useToast();
  const upload = useFileUpload({
    paths,
    currentPath: path,
    onQueueFull: (dropped) => {
      toast.warning(`队列最多 10 个文件,已忽略 ${dropped} 个。请分批上传。`);
    },
  });
  const [showUpload, setShowUpload] = useState(false);
  const openUpload = () => setShowUpload(true);
  const closeUpload = () => {
    setShowUpload(false);
    fetchDir(path);
  };

  // 拖拽上传
  const [isDragOver, setIsDragOver] = useState(false);
  const canDrop = path !== '';
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    setIsDragOver(false);
    // 【续 55 商业化】上传 → Pro
    if (!pro) {
      goUnlock();
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    upload.enqueue(files);
    setShowUpload(true);
  };

  // 批量选择 handlers
  const toggleSelect = useCallback((itemPath: string, checked: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemPath);
      else next.delete(itemPath);
      return next;
    });
  }, []);
  const selectAll = () => setSelectedPaths(new Set(filteredItems.map((i) => i.path)));
  const clearSelection = () => setSelectedPaths(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };
  const onBatchDelete = () => {
    // 【续 55 商业化】批量删除 → Pro
    if (!pro) {
      goUnlock();
      return;
    }
    void actions.handleBatchDelete(selectedPaths, exitSelectMode);
  };

  // 【续 90】先排序再搜索过滤:根目录走 share 排序(名称/已用/剩余),子目录走文件排序
  const sortedItems = useMemo(
    () => (path === '' ? sortRootShares(items, sort.share) : sortFileItems(items, sort.file)),
    [items, path, sort]
  );

  // 搜索过滤
  const filteredItems = useMemo(() => {
    if (!searchActive.trim()) return sortedItems;
    const q = searchActive.toLowerCase();
    return sortedItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [sortedItems, searchActive]);

  const inRoot = path !== '';
  const allSelected = filteredItems.length > 0 && selectedPaths.size === filteredItems.length;

  return (
    <div className="p-4 pb-20">
      {/* 【续 74】页签刷新时间统一走全局「更新于」,放工具栏上方右对齐 */}
      <div className="flex justify-end mb-1">
        <LastRefreshText />
      </div>
      <FileToolbar
        inRoot={inRoot}
        selectMode={selectMode}
        onRefresh={refresh}
        onUpload={openUpload}
        onNewFolder={actions.openNewFolder}
        onToggleSelect={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        onCleanup={() => setCleanupOpen(true)}
        selectedCount={selectedPaths.size}
        sortKey={inRoot ? sort.file.key : sort.share.key}
        sortDir={inRoot ? sort.file.dir : sort.share.dir}
        sortOptions={inRoot ? FILE_SORT_OPTIONS : SHARE_SORT_OPTIONS}
        onSortKeyChange={(key) =>
          inRoot
            ? patchSort({ file: { ...sort.file, key: key as FileSortKey } })
            : patchSort({ share: { ...sort.share, key: key as ShareSortKey } })
        }
        onToggleSortDir={() =>
          inRoot
            ? patchSort({ file: { ...sort.file, dir: sort.file.dir === 'asc' ? 'desc' : 'asc' } })
            : patchSort({ share: { ...sort.share, dir: sort.share.dir === 'asc' ? 'desc' : 'asc' } })
        }
      />

      {/* 搜索框 */}
      {inRoot && (
        <div className="mb-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Icon icon={Search} size={15} />
            </span>
            <input
              type="text"
              placeholder="搜索文件名..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
          {searchActive && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              匹配 {filteredItems.length} / {items.length} 项
              {filteredItems.length === 0 && (
                <button
                  onClick={() => setSearchInput('')}
                  className="ml-2 text-primary-600 dark:text-primary-400 hover:underline"
                >
                  清空
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <Breadcrumb path={path} onNavigate={navigateToPath} />

      {loading ? (
        <FileListSkeleton />
      ) : error ? (
        <FileListError message={error} onRetry={refresh} />
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative ${isDragOver ? 'ring-2 ring-primary-500 ring-offset-2 rounded-lg' : ''}`}
        >
          {isDragOver && canDrop && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary-500/10 border-2 border-dashed border-primary-500 rounded-lg pointer-events-none">
              <div className="text-primary-700 dark:text-primary-300 text-lg font-medium inline-flex items-center gap-2">
                <Icon icon={Upload} size={20} />
                松开上传到当前目录
              </div>
            </div>
          )}

          {selectMode && filteredItems.length > 0 && (
            <BatchActionsBar
              total={filteredItems.length}
              selected={selectedPaths.size}
              allSelected={allSelected}
              disabled={selectedPaths.size === 0 || actions.actionLoading}
              onToggleAll={(checked) => (checked ? selectAll() : clearSelection())}
              onBatchDelete={onBatchDelete}
            />
          )}

          {path === '' && (
            <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Icon icon={Lightbulb} size={14} className="shrink-0" />
              <span>提示:操作只能在共享内部进行,点击共享进入后可创建/删除/重命名/移动/拷贝</span>
            </div>
          )}
          {path !== '' && (
            <button
              onClick={navigateUp}
              className="flex items-center gap-2 w-full p-3 mb-2 text-left text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
            >
              <span className="inline-flex text-gray-400 dark:text-gray-500">
                <Icon icon={Folder} size={20} />
              </span>
              <span>..</span>
            </button>
          )}

          <div className="space-y-1">
            {filteredItems.map((item) => (
              <FileRow
                key={item.path}
                item={item}
                showActions={path !== '' && !selectMode}
                selectable={selectMode}
                selected={selectedPaths.has(item.path)}
                onSelectChange={toggleSelect}
                onNavigate={navigateTo}
                onDownload={actions.handleDownload}
                onPreview={setPreviewItem}
                onRename={actions.openRename}
                onCopy={actions.openCopy}
                onMove={actions.openMove}
                onDelete={actions.handleDelete}
                onEdit={setEditItem}
                faved={item.isDir && isFavorite('path', item.path)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>

          {filteredItems.length === 0 && items.length > 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">无匹配 "{searchActive}"</div>
          )}
          {filteredItems.length === 0 && items.length === 0 && <EmptyFolder />}
        </div>
      )}

      <NewFolderModal
        open={actions.showNewFolder}
        onClose={actions.closeNewFolder}
        onCreate={actions.handleCreateFolder}
        value={actions.newFolderName}
        onChange={actions.setNewFolderName}
        loading={actions.actionLoading}
      />

      <RenameModal
        open={actions.showRename !== null}
        onClose={actions.closeRename}
        onRename={actions.handleRename}
        item={actions.showRename?.item ?? null}
        newName={actions.showRename?.newName ?? ''}
        onChangeNewName={actions.setRenameName}
        loading={actions.actionLoading}
      />

      <MoveCopyModal
        open={actions.showMoveCopy !== null}
        onClose={actions.closeMoveCopy}
        onConfirm={actions.handleMoveCopy}
        item={actions.showMoveCopy?.item ?? null}
        dest={actions.showMoveCopy?.dest ?? ''}
        onChangeDest={actions.setMoveCopyDest}
        loading={actions.actionLoading}
        mode={actions.showMoveCopy?.mode ?? 'copy'}
        currentPath={path}
      />

      <UploadQueue
        open={showUpload}
        onClose={closeUpload}
        items={upload.queue}
        onAdd={upload.enqueue}
        onCancel={upload.cancel}
        onRetry={upload.retry}
        onRemove={upload.remove}
        onClearCompleted={upload.clearCompleted}
      />

      <ImageLightbox
        item={previewItem}
        items={filteredItems}
        urlFor={paths.toDavPath}
        onClose={() => setPreviewItem(null)}
        onChange={setPreviewItem}
      />

      {/* 【续 34-8】文本文件编辑 */}
      <TextFileEditor
        open={editItem !== null}
        davUrl={editItem ? paths.toDavPath(editItem.path) : ''}
        displayName={editItem?.name ?? ''}
        onClose={() => setEditItem(null)}
      />

      {/* 【续 37-3】磁盘清理建议 */}
      <DiskCleanupModal
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        filesUrl={paths.filesUrl}
        onPick={(p) => navigateToPath(p)}
      />

      <Dialog {...dialog} />
    </div>
  );
}
