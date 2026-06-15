// 【续 47 2026-07-19】Compose 栈管理(原 pages/Compose.tsx)
// 【续 48 2026-07-19】从独立页面抽成组件,并入 Containers 页 compose tab(docker/compose/vm)
// 数据源: compose.manager 插件项目目录(宿主 PHP 端点,见 compose-api/api.php)
// 不自动轮询(操作驱动型页面),头部 🔄 手动刷新
import { useCallback, useEffect, useState } from 'react';
import { useApiConfig } from '../../hooks/useUnraidApi';
import { useToast } from '../../hooks/useToast';
import StackDetailModal from './StackDetailModal';
import { getStacks, ComposeApiError, type ComposeStack } from '../../services/composeApi';

/** 【续 49.3】这些状态码 = 宿主没装 compose-api 后端(优雅降级,显示安装指引而非报错) */
const BACKEND_MISSING_STATUS = new Set([404, 502, 503]);

function statusLabel(stack: ComposeStack): string {
  if (stack.status === null) return '未运行';
  return stack.status;
}

export default function ComposeStacks() {
  const [stacks, setStacks] = useState<ComposeStack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 【续 49.3】后端不存在(404/502/503)→ 显示安装指引空态,不显示报错
  const [backendMissing, setBackendMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { isConfigured } = useApiConfig();
  const toast = useToast();

  // 【续 50 C10】返回是否成功,给刷新 toast 用(原实现吞错,"已刷新"无条件弹)
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const list = await getStacks();
      setStacks(list);
      setError(null);
      setBackendMissing(false);
      return true;
    } catch (err) {
      const status = err instanceof ComposeApiError ? err.status : 0;
      if (BACKEND_MISSING_STATUS.has(status)) {
        setBackendMissing(true);
        setError(null);
      } else {
        const msg = err instanceof Error ? err.message : '加载失败';
        // 【续 50 C-补充】401 附加 API Key 提示按 status 判定,不再靠 message 字符串匹配
        setError(status === 401 ? `${msg} — 请检查设置页的 API Key` : msg);
        setBackendMissing(false);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConfigured) {
      void load();
    } else {
      setLoading(false);
    }
  }, [isConfigured, load]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    // 【续 50 C10】成功才弹"已刷新";失败弹错误,不再无条件报成功
    const ok = await load();
    if (ok) {
      toast.info('已刷新');
    } else {
      toast.error('刷新失败,请检查后端连接或 API Key');
    }
  }, [load, toast]);

  const runningCount = stacks.filter((s) => s.running).length;

  return (
    <div>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compose 栈</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {loading
              ? '加载中…'
              : backendMissing
                ? '后端未安装'
                : `${stacks.length} 个栈 · ${runningCount} 个运行中`}
          </p>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          aria-label="刷新"
          title="刷新栈列表"
        >
          🔄
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-3">
          {error}
        </div>
      )}

      {!isConfigured && (
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
          请先在设置页配置服务器和 API Key
        </div>
      )}

      {isConfigured && !loading && !error && !backendMissing && stacks.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
          未发现 compose.manager 项目
        </div>
      )}

      {/* 【续 49.3】后端未安装:友好空态 + 安装指引(公开版降级,本地后端正常时永不出现) */}
      {isConfigured && !loading && backendMissing && (
        <div
          data-testid="compose-backend-missing"
          className="bg-white dark:bg-gray-800 rounded-xl p-5 text-sm"
        >
          <div className="text-base mb-1">🧩 Compose 后端未安装</div>
          <p className="text-gray-500 dark:text-gray-400 mb-3">
            Compose 栈管理需要一个小小的宿主端组件。其余功能不受影响。
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-gray-600 dark:text-gray-300 mb-4">
            <li>
              unRAID 应用市场安装 <span className="font-medium">compose.manager</span> 插件
            </li>
            <li>
              容器添加挂载：
              <code className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5">
                /var/run/php-fpm.sock:/hostrun/php-fpm.sock
              </code>
            </li>
            <li>
              宿主上以 root 运行{' '}
              <code className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5">
                install-compose-api.sh
              </code>
              （随镜像发布，见项目 README)
            </li>
          </ol>
          <button
            onClick={() => void handleRefresh()}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700"
          >
            重新检测
          </button>
        </div>
      )}

      {/* 栈列表 */}
      <div className="space-y-2">
        {stacks.map((stack) => (
          <button
            key={stack.name}
            onClick={() => setSelected(stack.name)}
            className="w-full text-left bg-white dark:bg-gray-800 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3"
          >
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                stack.running ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900 dark:text-white truncate">
                  {stack.name}
                </span>
                {stack.autostart && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0"
                    title="随阵列自动启动"
                  >
                    自启
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {statusLabel(stack)}
                {stack.lastResult && stack.lastResult.result !== 'success' && (
                  <span className="text-red-500 ml-1.5">
                    上次 {stack.lastResult.operation} 失败
                  </span>
                )}
              </div>
            </div>
            <span className="text-gray-300 dark:text-gray-600 shrink-0">›</span>
          </button>
        ))}
      </div>

      <StackDetailModal
        stackName={selected}
        onClose={() => setSelected(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
