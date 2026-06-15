// 【阶段 1 P0 - 2026-06-15】Shares 单行文件
// 从 Shares.tsx 拆出：图标 + 名称 + 大小 + 操作按钮
// 【阶段 P1-4 - 2026-06-15】支持勾选（批量删除）+ 图片点击预览
// 【阶段 P1-1c - 2026-06-15 续 4】React.memo 包装
//   要求父组件传稳定 callback 引用（useCallback）+ 稳定的 item 对象引用（来自 useState）
//   配合下 modal 打开/关闭、checkbox 切换等场景避免 50+ 行全部 re-render
// 【阶段 P2-收藏 - 2026-06-17 续 32-6】目录加 ⭐ 收藏按钮(只对目录,文件不收藏)
// 【阶段 P2-分享 - 2026-06-17 续 33-6】文件加 📤 分享按钮(Web Share API → 隔空投送/微信/邮件)
import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileItem } from './davAuth';
import { formatBytes } from '../../utils/formatters';
import { isImageFile } from '../../utils/fileTypes';
import { isTextFile } from './textFileTypes';
import { useFavorites } from '../../hooks/useFavorites';
import { useShare } from '../../hooks/useShare';
import { useApiConfig } from '../../hooks/useUnraidApi';
import { usePro } from '../../hooks/usePro';
import ActionMenu, { type MenuItem } from '../ActionMenu';

interface FileRowProps {
  item: FileItem;
  showActions: boolean;
  onNavigate: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onCopy: (item: FileItem) => void;
  onMove: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
  // 批量选择
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (path: string, selected: boolean) => void;
  // 图片预览
  onPreview?: (item: FileItem) => void;
  // 【续 34-8】文本文件编辑
  onEdit?: (item: FileItem) => void;
}

function FileRow({
  item,
  showActions,
  onNavigate,
  onDownload,
  onRename,
  onCopy,
  onMove,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
  onPreview,
  onEdit,
}: FileRowProps) {
  const isImage = !item.isDir && isImageFile(item.name);
  // 【续 34-8】文本文件(< 1MB 限制在 editor 内,这里只判断扩展名)
  const canEdit = !item.isDir && isTextFile(item.name);
  // 【续 32-6】目录可收藏
  const { toggle: toggleFav, isFavorite: isFav } = useFavorites();
  const faved = item.isDir && isFav('path', item.path);
  // 【续 33-6】分享链接
  const { share } = useShare();
  const { config } = useApiConfig();
  // 【续 55 商业化】写操作(编辑/重命名/拷贝/移动/删除) → Pro;
  // 未解锁时菜单项带 🔒,点击跳设置页 License 区(下载/预览/进入目录保持免费)
  const pro = usePro();
  const navigate = useNavigate();
  const goUnlock = () => navigate('/settings', { state: { focusLicense: true } });
  /**
   * 点击主体：
   * - 目录：导航
   * - 图片：预览
   * - 其他文件：下载
   */
  const handleMainClick = () => {
    if (item.isDir) {
      onNavigate(item);
    } else if (isImage && onPreview) {
      onPreview(item);
    } else {
      onDownload(item);
    }
  };

  // 【2026-07-19】操作按钮收进 ⋮ 菜单:
  // 原来平铺最多 8 个按钮(★/下载/✏️/📤/重命名/拷贝/移动/删除),手机竖屏占掉大半行宽,
  // 文件名 truncate 到只剩几个字。现只保留目录 ★ inline,其余全部进 ActionMenu。
  const menuItems: MenuItem[] = [];
  if (!item.isDir) {
    menuItems.push({ label: '下载', onClick: () => onDownload(item) });
    if (canEdit && onEdit) {
      menuItems.push(
        pro
          ? { label: '编辑', onClick: () => onEdit(item) }
          : { label: '🔒 编辑', onClick: goUnlock }
      );
    }
    if (config?.baseUrl) {
      menuItems.push({
        label: '分享链接',
        onClick: () => {
          const baseUrl = config.baseUrl!.replace(/\/$/, '');
          const url = `${baseUrl}/dav/${item.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
          share({ title: item.name, text: `unRAID 文件: ${item.name}`, url });
        },
      });
    }
  }
  menuItems.push(
    ...(pro
      ? [
          { label: '重命名', onClick: () => onRename(item) },
          { label: '拷贝', onClick: () => onCopy(item) },
          { label: '移动', onClick: () => onMove(item) },
          { label: '删除', onClick: () => onDelete(item), danger: true },
        ]
      : [
          { label: '🔒 重命名', onClick: goUnlock },
          { label: '🔒 拷贝', onClick: goUnlock },
          { label: '🔒 移动', onClick: goUnlock },
          { label: '🔒 删除', onClick: goUnlock, danger: true },
        ])
  );

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 ${
        selected
          ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
      }`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange?.(item.path, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 mr-2 cursor-pointer accent-primary-600 shrink-0"
        />
      )}
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={handleMainClick}
      >
        <span className="text-lg">{item.isDir ? '📁' : isImage ? '🖼️' : '📄'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
          {!item.isDir && item.size !== undefined && (
            <div className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(item.size)}</div>
          )}
        </div>
      </div>
      {showActions && (
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {item.isDir && (
            <button
              onClick={() => toggleFav({ kind: 'path', value: item.path, label: item.name })}
              className={`px-1.5 py-1 text-base leading-none rounded ${
                faved
                  ? 'text-yellow-500 hover:text-yellow-600'
                  : 'text-gray-300 hover:text-yellow-500'
              }`}
              aria-label={faved ? '取消收藏' : '添加到收藏'}
              title={faved ? '取消收藏' : '添加到收藏'}
            >
              {faved ? '★' : '☆'}
            </button>
          )}
          <ActionMenu items={menuItems} />
        </div>
      )}
    </div>
  );
}

export default memo(FileRow);
