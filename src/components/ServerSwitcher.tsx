// 【阶段 P2-多服务器 - 2026-06-17 续 33-10】顶栏服务器切换下拉
// 只在 getServers().length >= 2 时显示
// 点击切换后整个 app 重新拉数据(useApiConfig 订阅)
import { useEffect, useState } from 'react';
import {
  getServers,
  getActiveServer,
  setActiveServer,
  subscribeServersChange,
  type Server,
} from '../services/unraidApi/config';

export default function ServerSwitcher() {
  const [servers, setServers] = useState<Server[]>([]);
  const [active, setActive] = useState<Server | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setServers(getServers());
      setActive(getActiveServer());
    };
    refresh();
    return subscribeServersChange(refresh);
  }, []);

  if (servers.length < 2) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs sm:text-sm"
        aria-label="切换服务器"
        title={active?.name}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: active?.color || '#3b82f6' }}
        />
        <span className="hidden sm:inline max-w-[80px] truncate font-medium">
          {active?.name || '服务器'}
        </span>
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[200px] py-1"
            role="menu"
          >
            {servers.map((srv) => (
              <button
                key={srv.id}
                onClick={() => {
                  setActiveServer(srv.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  srv.id === active?.id ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                }`}
                role="menuitem"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: srv.color || '#3b82f6' }}
                />
                <span className="flex-1 truncate">{srv.name}</span>
                {srv.id === active?.id && (
                  <span className="text-primary-600 dark:text-primary-400">✓</span>
                )}
              </button>
            ))}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1 px-3 py-1.5 text-[10px] text-gray-400">
              在「设置」中添加/编辑/删除服务器
            </div>
          </div>
        </>
      )}
    </div>
  );
}
