// 【阶段 2.2 - 2026-06-15】错误边界降级 UI（独立文件,保持 fast-refresh 友好）
interface DefaultFallbackProps {
  error: Error;
  onReset: () => void;
  onHome: () => void;
}

export default function DefaultErrorFallback({ error, onReset, onHome }: DefaultFallbackProps) {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-red-200 dark:border-red-900">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">💥</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">页面出错了</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">请重试或返回首页</p>
        </div>

        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 font-mono break-all max-h-40 overflow-auto">
          {error.name}: {error.message}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onReset}
            className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-sm font-medium"
          >
            🔄 重试
          </button>
          <button
            onClick={onHome}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md text-sm font-medium"
          >
            🏠 回首页
          </button>
        </div>

        <p className="mt-4 text-xs text-center text-gray-400 dark:text-gray-500">
          详细堆栈可在浏览器控制台查看
        </p>
      </div>
    </div>
  );
}
