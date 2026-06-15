// 【阶段 1 P0 - 2026-06-15】Dashboard 骨架屏
// 从 Dashboard.tsx 拆出，首次加载无 cache 时显示
export default function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {/* Server Name skeleton */}
      <div className="mb-6">
        <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      {/* CPU card skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mr-2" />
            <div>
              <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>

      {/* Memory card skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mr-2" />
            <div>
              <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>

      {/* Network skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
        <div className="flex items-center justify-around">
          <div className="text-center">
            <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-1" />
            <div className="h-3 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-1" />
            <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto" />
          </div>
          <div className="text-center">
            <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-1" />
            <div className="h-3 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-1" />
            <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto" />
          </div>
        </div>
      </div>

      {/* Array status skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>

      {/* Disks skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
        首次加载中…（unraid-api 冷启动约 4-5 秒）
      </p>
    </div>
  );
}
