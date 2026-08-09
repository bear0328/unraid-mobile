// 【阶段 1 P0 - 2026-06-17 续 29-1】从 Shares.tsx 拆出顶部工具栏
// 按钮:刷新 / 上传 / 新建文件夹 / 选择(或退出选择) / 清理
// 【续 37-3】加 onCleanup 入口
// 【续 55 商业化】上传/新建文件夹/清理(磁盘清理) → Pro,未解锁时换 🔒 占位按钮
// 【续 90】加排序控件:紧凑 <select> 选维度 + 图标按钮切升/降序(选项由父级按根/子目录下发)
import { ArrowDown, ArrowUp, Brush, ListChecks, Plus, Upload, X } from 'lucide-react';
import { ProGateButton } from '../ProGate';
import { usePro } from '../../hooks/usePro';
import Icon from '../ui/Icon';
import type { SortDirection } from '../../utils/sharesSort';
interface FileToolbarProps {
  inRoot: boolean;
  selectMode: boolean;
  onRefresh: () => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onToggleSelect: () => void;
  onCleanup: () => void;
  selectedCount: number;
  // 【续 90】排序控件(根/子目录选项不同,由 Shares 页下发)
  sortKey: string;
  sortDir: SortDirection;
  sortOptions: ReadonlyArray<{ value: string; label: string }>;
  onSortKeyChange: (key: string) => void;
  onToggleSortDir: () => void;
}

export default function FileToolbar({
  inRoot,
  selectMode,
  onRefresh,
  onUpload,
  onNewFolder,
  onToggleSelect,
  onCleanup,
  selectedCount,
  sortKey,
  sortDir,
  sortOptions,
  onSortKeyChange,
  onToggleSortDir,
}: FileToolbarProps) {
  const pro = usePro();
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">文件管理</h1>
      <div className="flex gap-2 flex-wrap items-center">
        {/* 【续 90】排序:select 选维度 + 箭头按钮切升/降序,430px 下随 flex-wrap 换行 */}
        <select
          aria-label="排序方式"
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value)}
          className="px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md border border-gray-200 dark:border-gray-600"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={onToggleSortDir}
          aria-label={sortDir === 'asc' ? '升序,点击切换为降序' : '降序,点击切换为升序'}
          title={sortDir === 'asc' ? '升序' : '降序'}
          className="px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-md"
        >
          <Icon icon={sortDir === 'asc' ? ArrowUp : ArrowDown} size={14} />
        </button>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-md"
        >
          刷新
        </button>
        {inRoot && !selectMode && (
          <>
            {pro ? (
              <button
                onClick={onUpload}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                <span className="inline-flex items-center gap-1">
                  <Icon icon={Upload} size={14} />
                  上传
                </span>
              </button>
            ) : (
              <ProGateButton
                label="上传"
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md"
              />
            )}
            {pro ? (
              <button
                onClick={onNewFolder}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                <span className="inline-flex items-center gap-1">
                  <Icon icon={Plus} size={14} />
                  新建文件夹
                </span>
              </button>
            ) : (
              <ProGateButton
                label="新建文件夹"
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              />
            )}
          </>
        )}
        {inRoot && (
          <button
            onClick={onToggleSelect}
            className={`px-3 py-1.5 text-sm rounded-md ${
              selectMode
                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
            }`}
          >
            {selectMode ? (
              <span className="inline-flex items-center gap-1">
                <Icon icon={X} size={14} />
                {`退出选择${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Icon icon={ListChecks} size={14} />
                选择
              </span>
            )}
          </button>
        )}
        {pro ? (
          <button
            onClick={onCleanup}
            className="px-3 py-1.5 text-sm bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-md"
            title="扫描大文件 / 长期未动文件"
          >
            <span className="inline-flex items-center gap-1">
              <Icon icon={Brush} size={14} />
              清理
            </span>
          </button>
        ) : (
          <ProGateButton
            label="清理"
            className="px-3 py-1.5 text-sm bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-md"
            title="扫描大文件 / 长期未动文件"
          />
        )}
      </div>
    </div>
  );
}
