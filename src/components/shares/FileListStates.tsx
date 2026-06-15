// 【阶段 1 P0 - 2026-06-15】Shares 加载/错误/空状态
// 从 Shares.tsx 拆出
export function FileListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export function FileListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <p className="text-red-800 dark:text-red-200">加载失败: {message}</p>
      <button
        onClick={onRetry}
        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
      >
        重试
      </button>
    </div>
  );
}

export function EmptyFolder() {
  return (
    <div className="text-center py-8 text-gray-500">
      <p className="text-4xl mb-2">📂</p>
      <p>空目录</p>
    </div>
  );
}
