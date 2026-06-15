// 【阶段 P1-搜索 - 2026-06-17 续 32-3】全局搜索 modal
// Ctrl/Cmd+K 唤起,搜索导航项 + 收藏项(预留扩展容器/分享)
// Esc 关闭,点击结果 navigate + 关闭
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useFavorites } from '../hooks/useFavorites';

interface SearchItem {
  /** 唯一 id */
  id: string;
  /** 显示标题 */
  title: string;
  /** 副标题(路径/类型) */
  subtitle: string;
  /** 图标 */
  icon: string;
  /** 类型标签 */
  kind: 'page' | 'favorite' | 'path';
  /** 点击跳的路径(react-router path 或 share 路径) */
  to: string;
  /** 是否是外部(unraid 路径用 ?share=/xxx 跳 /shares) */
  external?: boolean;
}

const NAV_ITEMS: SearchItem[] = [
  { id: 'p-dashboard', title: '仪表盘', subtitle: '/', icon: '📊', kind: 'page', to: '/' },
  {
    id: 'p-containers',
    title: '容器/VM',
    subtitle: '/containers',
    icon: '📦',
    kind: 'page',
    to: '/containers',
  },
  { id: 'p-shares', title: '共享', subtitle: '/shares', icon: '📁', kind: 'page', to: '/shares' },
  { id: 'p-logs', title: '日志', subtitle: '/logs', icon: '📋', kind: 'page', to: '/logs' },
  {
    id: 'p-settings',
    title: '设置',
    subtitle: '/settings',
    icon: '⚙️',
    kind: 'page',
    to: '/settings',
  },
  { id: 'p-debug', title: '诊断', subtitle: '/debug', icon: '🔧', kind: 'page', to: '/debug' },
];

function score(item: SearchItem, q: string): number {
  const t = item.title.toLowerCase();
  const s = item.subtitle.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  if (t.includes(q)) return 200;
  if (s.includes(q)) return 50;
  return 0;
}

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { favorites } = useFavorites();

  // 收藏项 → 搜索条目(容器/share/路径)
  const favItems: SearchItem[] = useMemo(() => {
    return favorites.map((f) => ({
      id: `fav-${f.kind}-${f.value}`,
      title: f.label,
      subtitle:
        f.kind === 'container'
          ? `容器 · ${f.value}`
          : f.kind === 'share'
            ? `分享 · ${f.value}`
            : f.value,
      icon: f.kind === 'container' ? '📦' : f.kind === 'share' ? '📁' : '📂',
      kind: 'favorite',
      to:
        f.kind === 'container'
          ? `/containers?focus=${encodeURIComponent(f.value)}`
          : // 【续 50 C8】share/path 改 pathname 风格深链(useShares 从 pathname 推导),
            // 原 ?path= 无人消费是死链;去前导斜杠防双斜杠
            `/shares/${encodeURI(f.value.replace(/^\/+/, ''))}`,
    }));
  }, [favorites]);

  // 合并 + 过滤 + 排序
  const results: SearchItem[] = useMemo(() => {
    const all = [...NAV_ITEMS, ...favItems];
    if (!q.trim()) return all.slice(0, 8);
    const lq = q.toLowerCase();
    return all
      .map((it) => ({ it, s: score(it, lq) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.it);
  }, [q, favItems]);

  // 打开时聚焦 + 重置
  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      // 下一帧聚焦,等 modal 渲染完
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // active 越界纠正
  useEffect(() => {
    if (activeIdx >= results.length) setActiveIdx(0);
  }, [results, activeIdx]);

  const trapRef = useFocusTrap(open, onClose);

  function selectItem(item: SearchItem) {
    onClose();
    // path 类型用 query string 跳到 /shares
    if (item.to.includes('?')) {
      const [path, qs] = item.to.split('?');
      navigate(`${path}?${qs}`);
    } else {
      navigate(item.to);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // 【续 50 C8】0 条结果时 (i+1)%0=NaN,activeIdx 卡死,加 length 守卫
      if (results.length === 0) return;
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) selectItem(item);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10dvh] px-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
    >
      <div
        ref={trapRef}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索页面、收藏、路径..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            aria-label="搜索关键词"
          />
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            ESC
          </kbd>
        </div>
        <ul className="max-h-[60dvh] overflow-y-auto py-1" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-400">无匹配结果</li>
          ) : (
            results.map((it, idx) => (
              <li
                key={it.id}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => selectItem(it)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                  idx === activeIdx
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className="text-lg shrink-0">{it.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                    {it.subtitle}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                  {it.kind === 'page' ? '页面' : it.kind === 'favorite' ? '收藏' : '路径'}
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 flex justify-between">
          <span>↑↓ 选择 · Enter 跳转</span>
          <span>{results.length} 条结果</span>
        </div>
      </div>
    </div>
  );
}
