// 【阶段 P2-通知 - 2026-06-17 续 37-2】通知中心页
// 列表(全/未读)/ 标记已读 / 跳转 / 删除 / 清空
// 入口:Layout 铃铛 / 命令面板
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type AppNotification } from '../utils/notifications';
import { useDialog } from '../hooks/useDialog';
import { useToast } from '../hooks/useToast';
import EmptyState from '../components/ui/EmptyState';

const LEVEL_STYLE: Record<AppNotification['level'], { dot: string; badge: string }> = {
  info: {
    dot: 'bg-blue-500',
    badge: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30',
  },
  success: {
    dot: 'bg-green-500',
    badge: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30',
  },
  warning: {
    dot: 'bg-yellow-500',
    badge: 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30',
  },
  error: {
    dot: 'bg-red-500',
    badge: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30',
  },
};

const KIND_ICON: Record<AppNotification['kind'], string> = {
  container: '📦',
  error: '⚠️',
  remote: '📡',
  system: '🔔',
};

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return '刚刚';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Notifications() {
  const { list, unread, markRead, markAllRead, remove, clear } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dialog = useDialog();
  const toast = useToast();
  const navigate = useNavigate();

  const visible = useMemo(() => {
    const arr = filter === 'unread' ? list.filter((n) => !n.read) : list;
    return arr;
  }, [list, filter]);

  async function handleClear() {
    if (!list.length) return;
    const ok = await dialog.confirm({
      title: '清空所有通知?',
      message: `共 ${list.length} 条,此操作不可撤销。`,
      confirmText: '清空',
      danger: true,
    });
    if (!ok) return;
    clear();
    toast.success('已清空');
  }

  function handleClick(n: AppNotification) {
    if (!n.read) markRead(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="p-3 sm:p-4 max-w-3xl mx-auto">
      <header className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            🔔 通知中心
            {unread > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white">
                {unread}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">容器状态、错误、远程上报回执</p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter((f) => (f === 'all' ? 'unread' : 'all'))}
            className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg"
          >
            {filter === 'unread' ? '显示全部' : '只看未读'}
          </button>
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-40"
          >
            全部已读
          </button>
          <button
            onClick={handleClear}
            disabled={!list.length}
            className="px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-40"
          >
            清空
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <EmptyState
          icon={filter === 'unread' ? '✓' : '🔔'}
          title={filter === 'unread' ? '没有未读通知' : '暂无通知'}
          hint={
            filter === 'unread'
              ? '切换"显示全部"看看历史'
              : '容器状态、错误、远程上报都会集中到这里'
          }
        />
      ) : (
        <ul className="space-y-1.5">
          {visible.map((n) => {
            const style = LEVEL_STYLE[n.level];
            return (
              <li
                key={n.id}
                className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm flex items-start gap-2.5 ${n.link ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''} ${!n.read ? 'ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
                onClick={() => handleClick(n)}
              >
                <span className="text-lg leading-none mt-0.5">{KIND_ICON[n.kind]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-sm font-medium ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                      {n.title}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.badge}`}>
                      {n.level}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                      {timeAgo(n.ts)}
                    </span>
                  </div>
                  {n.detail && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 break-words line-clamp-3">
                      {n.detail}
                    </p>
                  )}
                  {n.link && (
                    <p className="text-[10px] text-primary-600 dark:text-primary-400 mt-1">
                      ↗ {n.link}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(n.id);
                  }}
                  className="text-gray-400 hover:text-red-500 text-base leading-none shrink-0"
                  aria-label="删除"
                  title="删除"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
