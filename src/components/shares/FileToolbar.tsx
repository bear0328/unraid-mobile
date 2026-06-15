// 【阶段 1 P0 - 2026-06-17 续 29-1】从 Shares.tsx 拆出顶部工具栏
// 按钮:刷新 / 上传 / 新建文件夹 / 选择(或退出选择) / 清理
// 【续 37-3】加 onCleanup 入口
// 【续 55 商业化】上传/新建文件夹/清理(磁盘清理) → Pro,未解锁时换 🔒 占位按钮
import { ProGateButton } from '../ProGate';
import { usePro } from '../../hooks/usePro';
interface FileToolbarProps {
  inRoot: boolean;
  selectMode: boolean;
  onRefresh: () => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onToggleSelect: () => void;
  onCleanup: () => void;
  selectedCount: number;
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
}: FileToolbarProps) {
  const pro = usePro();
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">文件管理</h1>
      <div className="flex gap-2 flex-wrap">
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
                ↑ 上传
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
                + 新建文件夹
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
            {selectMode ? `✕ 退出选择${selectedCount > 0 ? ` (${selectedCount})` : ''}` : '☑ 选择'}
          </button>
        )}
        {pro ? (
          <button
            onClick={onCleanup}
            className="px-3 py-1.5 text-sm bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-md"
            title="扫描大文件 / 长期未动文件"
          >
            🧹 清理
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
