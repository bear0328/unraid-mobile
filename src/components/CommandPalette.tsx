// 【阶段 P2-命令面板 - 2026-06-17 续 34-6】Ctrl/Cmd+Shift+P 唤出
// 简化版命令面板(不接 LLM,纯预设命令)
// 模糊匹配 + Enter 执行 + Esc 关闭 + ↑↓ 选择
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useToast } from '../hooks/useToast';
import { useDialog } from '../hooks/useDialog';
import { useTheme } from '../context/useTheme';
import { exportBackup } from '../utils/backup';
import { getServers, getActiveServer, setActiveServer } from '../services/unraidApi/config';
import Dialog from './shares/Dialog';

interface Command {
  id: string;
  title: string;
  hint?: string;
  icon: string;
  category: 'nav' | 'theme' | 'action' | 'server';
  /** 不需要参数直接执行 */
  run?: () => void | Promise<void>;
}

function fuzzy(q: string, text: string): number {
  const lq = q.toLowerCase();
  const lt = text.toLowerCase();
  if (lt === lq) return 1000;
  if (lt.startsWith(lq)) return 500;
  if (lt.includes(lq)) return 200;
  // 字符顺序模糊
  let i = 0,
    j = 0;
  while (i < lq.length && j < lt.length) {
    if (lq[i] === lt[j]) i++;
    j++;
  }
  return i === lq.length ? 50 : 0;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { setTheme } = useTheme();
  const trapRef = useFocusTrap(open, onClose);
  // 【P0-1 2026-06-17】清空缓存走 useDialog(原本地 confirm 不一致体验)
  const dialog = useDialog();

  // 打开时重置
  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 构建命令列表(每次渲染重新算,避免过期)
  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      {
        id: 'nav-dashboard',
        title: '前往 仪表盘',
        icon: '📊',
        category: 'nav',
        run: () => navigate('/'),
      },
      {
        id: 'nav-containers',
        title: '前往 容器/VM',
        icon: '📦',
        category: 'nav',
        run: () => navigate('/containers'),
      },
      {
        id: 'nav-shares',
        title: '前往 共享',
        icon: '📁',
        category: 'nav',
        run: () => navigate('/shares'),
      },
      {
        id: 'nav-logs',
        title: '前往 日志',
        icon: '📋',
        category: 'nav',
        run: () => navigate('/logs'),
      },
      {
        id: 'nav-settings',
        title: '前往 设置',
        icon: '⚙️',
        category: 'nav',
        run: () => navigate('/settings'),
      },
      {
        id: 'nav-debug',
        title: '前往 诊断',
        icon: '🔧',
        category: 'nav',
        run: () => navigate('/debug'),
      },
      {
        id: 'nav-notifications',
        title: '前往 通知中心',
        icon: '🔔',
        category: 'nav',
        run: () => navigate('/notifications'),
      },
      {
        id: 'theme-light',
        title: '主题: 浅色',
        icon: '🌞',
        category: 'theme',
        run: () => {
          setTheme('light');
          toast.success('已切换到浅色');
        },
      },
      {
        id: 'theme-dark',
        title: '主题: 深色',
        icon: '🌙',
        category: 'theme',
        run: () => {
          setTheme('dark');
          toast.success('已切换到深色');
        },
      },
      {
        id: 'theme-hc-light',
        title: '主题: 高对比度浅色',
        icon: '☀️',
        category: 'theme',
        run: () => {
          setTheme('hc-light');
          toast.success('已切换到高对比度浅色');
        },
      },
      {
        id: 'theme-hc-dark',
        title: '主题: 高对比度深色',
        icon: '🔆',
        category: 'theme',
        run: () => {
          setTheme('hc-dark');
          toast.success('已切换到高对比度深色');
        },
      },
      {
        id: 'action-export',
        title: '导出配置备份',
        icon: '📤',
        category: 'action',
        run: () => {
          const json = exportBackup();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `unraid-mobile-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('已下载备份');
        },
      },
      {
        id: 'action-reload',
        title: '重新加载页面',
        icon: '🔄',
        category: 'action',
        run: () => window.location.reload(),
      },
      {
        id: 'action-clear-cache',
        title: '清空 localStorage(慎用)',
        icon: '🗑',
        category: 'action',
        hint: '清除所有偏好/收藏/设置/密钥,需重配',
        run: async () => {
          const ok = await dialog.confirm({
            title: '清空所有本地数据?',
            message:
              // 【续 46.3 修正】旧文案谎称"API 密钥不在 localStorage" — 实际在(config.ts),
              // 用户照做后密钥丢失被迫重配,还可能触发冷启动唤盘
              '收藏/主题/Dashboard 顺序/服务器地址 + API 密钥全丢,需重新配置。\n\n清完后首次打开仪表盘不会自动拉磁盘(防唤盘),磁盘需手动点「刷新磁盘」加载。',
            confirmText: '清空',
            danger: true,
          });
          if (!ok) return;
          localStorage.clear();
          toast.success('已清空,3s 后自动刷新');
          setTimeout(() => window.location.reload(), 3000);
        },
      },
      {
        id: 'action-disk-cleanup',
        title: '磁盘清理建议',
        icon: '🧹',
        category: 'action',
        hint: '扫大文件/长期未动',
        run: () => navigate('/shares'),
      },
    ];
    // 动态:服务器切换
    const servers = getServers();
    const active = getActiveServer();
    for (const srv of servers) {
      if (srv.id === active?.id) continue;
      list.push({
        id: `server-${srv.id}`,
        title: `切换到服务器: ${srv.name}`,
        icon: '🖥️',
        category: 'server',
        hint: srv.serverUrl,
        run: () => {
          setActiveServer(srv.id);
          toast.success(`已切换到 ${srv.name}`);
        },
      });
    }
    return list;
  }, [navigate, setTheme, toast, dialog]);

  // 过滤 + 排序
  const filtered: Command[] = useMemo(() => {
    if (!q.trim()) return commands;
    return commands
      .map((c) => ({ c, s: Math.max(fuzzy(q, c.title), fuzzy(q, c.hint || '')) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((x) => x.c);
  }, [q, commands]);

  // 索引越界
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered, activeIdx]);

  function runCommand(c: Command) {
    onClose();
    // 下一帧执行,让 modal 关闭动画先跑
    requestAnimationFrame(() => c.run?.());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // 【续 50 D6b】0 结果时 (i±1)%0=NaN,activeIdx 变 NaN 后越界修正 effect(NaN>=0 为 false)
    // 救不回来 → 键盘导航卡死到重开;方向键直接忽略
    if (filtered.length === 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[activeIdx];
      if (c) runCommand(c);
    }
  }

  if (!open) return null;

  const CATEGORY_LABEL: Record<Command['category'], string> = {
    nav: '导航',
    theme: '主题',
    action: '操作',
    server: '服务器',
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15dvh] px-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div
        ref={trapRef}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400">⚡</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入命令 (Ctrl+Shift+P)"
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            aria-label="命令搜索"
          />
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
            ESC
          </kbd>
        </div>
        <ul className="max-h-[55dvh] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-400">无匹配命令</li>
          ) : (
            filtered.map((c, idx) => (
              <li
                key={c.id}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => runCommand(c)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                  idx === activeIdx
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className="text-lg shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  {c.hint && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                      {c.hint}
                    </div>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                  {CATEGORY_LABEL[c.category]}
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 flex justify-between">
          <span>↑↓ 选择 · Enter 执行</span>
          <span>{filtered.length} 条</span>
        </div>
      </div>
      <Dialog {...dialog} />
    </div>
  );
}
