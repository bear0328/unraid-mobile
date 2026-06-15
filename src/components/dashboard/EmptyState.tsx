// 【阶段 1 P0 - 2026-06-15】Dashboard 空状态 / 错误状态卡片
// 从 Dashboard.tsx 拆出：未配置 / 无数据 / 错误提示
export function ConfigRequiredState({ error }: { error?: string | null }) {
  return (
    <div className="p-4">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-2xl mr-3">⚠️</span>
          <div>
            <h3 className="font-medium text-yellow-800 dark:text-yellow-200">需要配置</h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              {error || '请在设置页面配置 unRAID 服务器地址和 API 密钥'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoDataState() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
      <p className="text-gray-500 dark:text-gray-400">暂无数据，请检查服务器连接</p>
    </div>
  );
}
