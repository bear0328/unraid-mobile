import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Boxes,
  FolderOpen,
  ScrollText,
  Settings as SettingsIcon,
  Search,
  Bell,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import Icon from './ui/Icon';
import { useTheme } from '../context/useTheme';
import GlobalSearch from './GlobalSearch';
import ServerSwitcher from './ServerSwitcher';
import CommandPalette from './CommandPalette';
import RouteErrorBoundary from './RouteErrorBoundary';
import { useNotifications } from '../utils/notifications';

const NAV_ITEMS: Array<{
  to: string;
  end: boolean;
  icon: LucideIcon;
  label: string;
  external?: boolean;
}> = [
  { to: '/', end: true, icon: LayoutDashboard, label: '仪表盘' },
  { to: '/containers', end: false, icon: Boxes, label: '容器/VM' },
  { to: '/shares', end: false, icon: FolderOpen, label: '共享' },
  { to: '/logs', end: false, icon: ScrollText, label: '日志' },
  { to: '/settings', end: false, icon: SettingsIcon, label: '设置' },
];

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  // 【续 50 D2】路由级错误边界按 pathname 重置:某页抛错后点导航/返回仪表盘,边界自动回正常态
  const location = useLocation();
  // 【阶段 P1-搜索 - 2026-06-17 续 32-3】Ctrl/Cmd+K 唤起全局搜索
  const [searchOpen, setSearchOpen] = useState(false);
  // 【阶段 P2-命令面板 - 2026-06-17 续 34-6】Ctrl/Cmd+Shift+P 唤起命令面板
  const [paletteOpen, setPaletteOpen] = useState(false);
  // 【续 37-2】通知中心未读
  const { unread } = useNotifications();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && !searchOpen && !paletteOpen) {
        // 简单 / 也能唤起(常见搜索习惯,只读非 input)
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, paletteOpen]);

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header — 【续 68】半透明 + 毛玻璃,滚动时内容透出层次感 */}
      <header
        className="sticky top-0 z-sticky bg-white/80 dark:bg-[#273244]/80 backdrop-blur-md shadow-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold text-primary-600 dark:text-primary-400 shrink-0">
            unRAID
          </h1>
          {/* 搜索按钮(桌面端 inline,移动端用图标按钮) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-xs sm:text-sm text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="打开全局搜索"
          >
            <Icon icon={Search} size={15} className="shrink-0" />
            <span className="hidden sm:inline truncate">搜索页面、收藏、路径...</span>
            <span className="sm:hidden truncate">搜索</span>
            <kbd className="hidden sm:inline-block ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#273244] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
              ⌘K
            </kbd>
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
            aria-label="切换主题"
            title={`当前: ${theme} (点击循环切换)`}
          >
            {theme === 'dark' ? (
              <Icon icon={Sun} />
            ) : (
              <Icon icon={Moon} />
            )}
          </button>
          {/* 【续 37-2】通知中心入口 */}
          <NavLink
            to="/notifications"
            className="relative p-1.5 sm:p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-600"
            aria-label="通知中心"
            title="通知中心"
          >
            <Icon icon={Bell} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center font-medium">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          {/* 【续 33-10】多服务器切换下拉(>=2 台时显示) */}
          <ServerSwitcher />
        </div>
      </header>

      {/* Main Content(【续 90】底部留白适配 tab bar 高度 + iOS 安全区,防遮挡) */}
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {/* 【续 50 D2】路由级错误边界:页面组件抛错只换内容区,顶栏/底栏导航仍可用 */}
        {/* 【续 65】页面切换淡入:边界按 pathname remount,anim-fade 随之重放 */}
        <RouteErrorBoundary key={location.pathname}>
          <div className="anim-fade">
            <Outlet />
          </div>
        </RouteErrorBoundary>
      </main>

      {/* Bottom Navigation — 【续 68】半透明毛玻璃 + 活动项胶囊 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-sticky bg-white/80 dark:bg-[#273244]/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-between sm:justify-around py-1.5 sm:py-2 px-1 max-w-screen-lg mx-auto">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.to}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center py-1.5 sm:py-2 px-1.5 sm:px-3 rounded-lg transition-all duration-200 min-w-0 flex-1 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
              >
                <Icon icon={item.icon} size={22} className="mb-0.5" />
                <span className="text-[10px] sm:text-xs font-medium truncate w-full text-center">
                  {item.label}
                </span>
              </a>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center py-1.5 sm:py-2 px-1.5 sm:px-3 rounded-lg min-w-0 flex-1 transition-colors ${
                    isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <span
                    className={`flex flex-col items-center px-3 py-1 rounded-full transition-colors duration-200 ${
                      isActive ? 'bg-primary-50 dark:bg-primary-900/40' : ''
                    }`}
                  >
                    <Icon icon={item.icon} size={22} className="mb-0.5" />
                    <span className="text-[10px] sm:text-xs font-medium truncate w-full text-center">
                      {item.label}
                    </span>
                  </span>
                )}
              </NavLink>
            )
          )}
        </div>
      </nav>

      {/* Global Search modal (Ctrl+K) */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Command Palette (Ctrl+Shift+P) */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
