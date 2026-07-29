// 【阶段 5.1.b 2026-06-14】/var/log nginx basic auth：localStorage 存密码(续 49 起,推翻 D4)，fetch /var/log/ 自动带 Authorization
// 【2026-06-15】拆分 - 解析/着色逻辑抽取到 utils/logParser.tsx
// 【2026-06-15 阶段 P0-3】虚拟滚动（react-window）+ LogLine memo + 关键字匹配计数
// 【阶段 P2-告警 - 2026-06-17 续 33-2】关键字告警(error/fatal/panic 等)命中时弹 toast
// 【续 45.8b+ 2026-07-09】matchCount 改 useMemo 避免每行 new RegExp
// 【续 45.8b+ 2026-07-09】删 loadOptions 死代码:LOG_FILES 只剩 syslog 一项,无 loadOptions
//   - 删 options state(setOptions 从未被读,只被设 [])
//   - 删 useEffect 里 active.loadOptions 调用分支(死代码)
//   - 删 render 里 Stack: 下拉 UI(active.loadOptions 永假)
//   - 保留 LogFile.loadOptions? 字段定义(配置 schema,未来扩展用) + 保留 !active.loadOptions 分支
// 【续 78】关键字告警拆到 hooks/useLogAlerts.ts,导出过滤结果拆到 utils/logExport.ts(纯结构移动)
import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { Bell, Hourglass, Inbox, Monitor, RefreshCw, Save, Search, XCircle, type LucideIcon } from 'lucide-react';
import { parseSyslogLine, colorizeLine, renderHighlightedWithAnsi } from '../utils/logParser';
import { useToast } from '../hooks/useToast';
import { useLogAlerts } from '../hooks/useLogAlerts';
import { exportLogLines } from '../utils/logExport';
import Icon from '../components/ui/Icon';
import LastRefreshText from '../components/ui/LastRefreshText';
import { markRefreshed } from '../utils/lastRefresh';

const LOG_USER = 'loguser';
const LOG_PASSWORD_KEY = 'unraid-mobile-log-password';

// 工具：从 localStorage 读日志密码，返 Basic header
function getLogAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const password = localStorage.getItem(LOG_PASSWORD_KEY);
  if (!password) return {};
  return { Authorization: 'Basic ' + btoa(`${LOG_USER}:${password}`) };
}

interface LogFile {
  key: string;
  label: string;
  labelFull?: string;
  icon: LucideIcon;
  description: string;
  /** URL 路径 模板，如 /var/log/{file} */
  buildUrl: (selection: string) => string;
  /** 默认选择 */
  defaultSelection: string;
  /** 选择列表（动态拉取时为空，由 dynamicLoader 决定） */
  selectionLabel?: (selection: string) => string;
  /** 动态加载选择列表的函数（返回 {value, label}[]） */
  loadOptions?: () => Promise<{ value: string; label: string }[]>;
}

const MAX_LINES_DEFAULT = 500;
const MAX_LINES_OPTIONS = [100, 500, 2000, 10000];
const MAX_BYTES = 1024 * 1024 * 2; // 2MB
const ROW_HEIGHT = 18; // 单行像素高度（与 text-[11px] sm:text-xs + leading-snug 匹配）

// 三个固定 tab（短标签用于手机）
const LOG_FILES: LogFile[] = [
  {
    key: 'syslog',
    label: '系统',
    labelFull: '系统日志',
    icon: Monitor,
    description: 'rsyslog / emhttp / 内核',
    buildUrl: () => '/var/log/syslog',
    defaultSelection: 'syslog',
  },
];

/**
 * 单行日志渲染（memo 化，react-window 滚动时不会重渲未变化的行）
 */
const LogLine = memo(function LogLine({
  line,
  isSyslogTab,
  filter,
}: {
  line: string;
  isSyslogTab: boolean;
  filter: string;
}) {
  if (!line.trim()) {
    return (
      <div className="whitespace-pre-wrap break-all text-gray-500" style={{ height: ROW_HEIGHT }}>
        {' '}
      </div>
    );
  }

  if (isSyslogTab) {
    const p = parseSyslogLine(line);
    if (p.isSyslog) {
      const className = colorizeLine(line);
      return (
        <div
          className={`flex gap-2 overflow-hidden hover:bg-gray-800/50 ${className}`}
          style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
        >
          {/* 【续 45.8 2026-07-04】手机端隐藏 time/host/proc 三段,只显示 msg。
              之前用 sm:flex 在 <640px 屏 4 段 stack 超出 ROW_HEIGHT=18,行间重叠 */}
          {/* 【2026-07-19 续 50.9】手机端恢复短格式时间(只 HH:MM:SS),
              单行 18px 不重叠;host/proc 手机端仍隐藏(当初重叠主因) */}
          {/* 【续 79】所有日志去日期:桌面端也只显示 HH:MM:SS(原 "Jul 29 08:01:07"),
              与容器日志弹窗一致;w-[140px] 收窄到 w-[60px] 腾出行宽 */}
          <span className="shrink-0 w-[60px] tabular-nums text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            {p.time.split(/\s+/).pop()}
          </span>
          <span className="hidden sm:inline text-purple-600 dark:text-purple-400 shrink-0 w-[60px] truncate text-[10px] sm:text-xs">
            {p.host}
          </span>
          <span className="hidden sm:inline text-cyan-600 dark:text-cyan-400 shrink-0 w-[140px] truncate text-[10px] sm:text-xs">
            {p.proc}
          </span>
          <span className="flex-1 min-w-0 truncate sm:whitespace-pre-wrap sm:break-all">
            {renderHighlightedWithAnsi(p.msg, filter)}
          </span>
        </div>
      );
    }
  }

  const className = colorizeLine(line);
  return (
    <div
      className={`whitespace-pre-wrap break-all hover:bg-gray-800/50 ${className}`}
      style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}
    >
      {renderHighlightedWithAnsi(line, filter)}
    </div>
  );
});

/** react-window 行渲染器 */
function Row({
  index,
  style,
  data,
}: ListChildComponentProps<{
  lines: string[];
  isSyslogTab: boolean;
  filter: string;
}>) {
  const { lines, isSyslogTab, filter } = data;
  return (
    <div style={style} className="px-0.5">
      <LogLine line={lines[index]} isSyslogTab={isSyslogTab} filter={filter} />
    </div>
  );
}

export default function Logs() {
  const [active, setActive] = useState<LogFile | null>(null);
  const [selection, setSelection] = useState<string>('');
  // 【续 45.8b+ 2026-07-09】options 状态删除:LOG_FILES 无 loadOptions 项,setOptions 只被设 [],
  //                从未被读。selection 仍保留(供 active.buildUrl(selection) 用)
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  // 【续 74】本地 lastUpdated 删除,「更新于」统一走全局 LastRefreshText(lastRefresh.ts)
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(false); // 默认关闭（最新在最上面）
  const [sizeInfo, setSizeInfo] = useState<{ lines: number; bytes: number }>({
    lines: 0,
    bytes: 0,
  });
  // 【阶段 P2-Logs - 2026-06-17 续 31-4】显示行数切换(100/500/2k/10k,默认 500)
  const [maxLines, setMaxLines] = useState(MAX_LINES_DEFAULT);
  // 【续 78】关键字告警(开关 + ref + 扫描)拆到 useLogAlerts,setFilter 传入供 toast「查看」回调
  const { alertEnabled, setAlertEnabled, alertEnabledRef, scanAlerts } = useLogAlerts(setFilter);
  const listRef = useRef<FixedSizeList>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  // 【阶段 P1-4 - 2026-06-16 续 10】日志区高度自适应
  // 用 ResizeObserver 监听 flex-1 容器的实际高度,替代硬编码 calc(100vh - 260px)
  // 解决:旋转屏幕 / 键盘弹起 / 字号变化 / iOS 地址栏收起时高度错乱
  const [logHeight, setLogHeight] = useState(300);

  // 初始化 active 为第一个
  useEffect(() => {
    setActive(LOG_FILES[0]);
    setSelection(LOG_FILES[0].defaultSelection);
  }, []);

  // 切换 tab：重置 selection + 清内容
  // 【续 45.8b+ 2026-07-09】loadOptions 分支删除(LOG_FILES 无 loadOptions 项,死代码),
  //   保留默认 selection 同步 + content/error 重置
  useEffect(() => {
    if (!active) return;
    setSelection(active.defaultSelection);
    setContent('');
    setError(null);
  }, [active]);

  const loadLog = useCallback(
    async (showLoading = true) => {
      if (!active) return;
      if (!selection) {
        setContent('');
        setError(null);
        return;
      }
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const url = active.buildUrl(selection);
        // 【5.1.b】自动加 Basic auth header（nginx /var/log/ 鉴权）
        const resp = await fetch(`${url}?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: getLogAuthHeader(),
        });
        if (!resp.ok) {
          if (resp.status === 404) {
            throw new Error(`文件不存在（404）`);
          }
          // 【续 50.2】nginx 鉴权失败改返 403(防浏览器原生弹窗),401/403 同判;
          // 403 原先按"父目录权限过严"提示,鉴权失败远更常见,统一按鉴权提示
          if (resp.status === 401 || resp.status === 403) {
            throw new Error(
              `日志鉴权失败 (${resp.status})。请在「设置」页面配置日志密码（与 nginx .logpasswd 一致）。`
            );
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        const text = await resp.text();
        const truncated = text.length > MAX_BYTES;
        const slice = truncated ? text.slice(-MAX_BYTES) : text;
        // 全部行（用于过滤模式）
        const allLines = slice.split('\n');
        // 最新在最上面：倒序 + 限制行数
        const reversed = [...allLines].reverse();
        const limited = reversed.length > maxLines ? reversed.slice(0, maxLines) : reversed;
        setSizeInfo({ lines: allLines.length, bytes: text.length });
        setContent(limited.join('\n'));
        // 【续 74】真实刷新成功 → 更新全局「上次刷新」时间
        markRefreshed();
        // 【续 33-2】扫描告警(只在启用时)
        // 【续 50 C5】读 ref 拿最新开关值(闭包里的 alertEnabled 是 loadLog 创建时的旧值)
        if (alertEnabledRef.current) {
          scanAlerts(allLines);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || '加载失败');
        // 清空上次成功加载的日志，避免选不可读容器后下方残留旧内容
        setContent('');
        setSizeInfo({ lines: 0, bytes: 0 });
        // 自动刷新时 fetch 失败也要更新「更新于」时间戳，否则 UI 不动但后端一直在打
        markRefreshed();
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, selection, maxLines]
  );

  // 切换文件/选择时重新加载
  useEffect(() => {
    loadLog();
  }, [loadLog]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => loadLog(false), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, loadLog]);

  // 自动滚到顶（最新在最上面）
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollToItem(0, 'start');
    }
  }, [content, autoScroll]);

  // 【续 82】根容器高度实测:视口底(visualViewport,自动跟随 iOS 工具栏/键盘)
  //   - 容器顶(getBoundingClientRect,相对可视视口) - 导航条实测高 - 8px 间隙
  // 【续 82b】deps 必须含 active:首渲染 active=null → return null 无 DOM,ref 拿不到元素
  //   直接 return;空 deps 永不重试 → 监听永远挂不上(logHeight 卡初始 300,列表只填上半截)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      const navH = document.querySelector('nav')?.getBoundingClientRect().height ?? 0;
      const viewH = vv ? vv.height : window.innerHeight;
      el.style.height = `${Math.max(200, Math.floor(viewH - top - navH - 8))}px`;
    };
    update();
    vv?.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      vv?.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [active]);

  // ResizeObserver:日志容器尺寸变化(旋转屏幕/键盘弹起/字号变化)实时更新
  // 【续 82b】同上 deps 含 active(否则永远挂不上);ResizeObserver 不存在时兜底(jsdom/老浏览器)
  useEffect(() => {
    const el = logContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (entry: ResizeObserverEntry) => {
      // contentRect.height 不含 padding/border,直接用作 FixedSizeList 的 height
      const h = entry.contentRect.height;
      if (h > 0) setLogHeight(Math.floor(h));
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) update(e);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  // 过滤行（仅在有 filter 时启用过滤）
  const allLines = content.split('\n');
  const filteredLines = filter
    ? allLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : allLines;
  // 【续 45.8b+ 2026-07-09】matchCount 用 useMemo 包 — 之前每行 new RegExp,
  // 1 万行 × 打字每字符 = 几千次 RegExp 构造。filter 变 → 重建一次 RegExp
  const matchCount = useMemo(() => {
    if (!filter) return 0;
    const re = new RegExp(
      filter.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'g'
    );
    return filteredLines.reduce(
      (sum, l) => sum + (l.toLowerCase().match(re)?.length || 0),
      0
    );
  }, [filter, filteredLines]);

  if (!active) return null;

  return (
    // 【续 82】高度铺满:不用魔法数字 calc(100dvh-顶栏-pb-20)(iPhone 安全区/浏览器
    //   工具栏下对不上),改为运行时实测:容器顶(相对可视视口)→ 视口底 - 导航条实测高。
    //   visualViewport resize(iOS 工具栏显隐/键盘)+ 页面滚动时重算;class 仅作首帧兜底
    <div
      ref={rootRef}
      className="h-[calc(100dvh-132px)] sm:h-[calc(100dvh-140px)] flex flex-col p-3 sm:p-4"
    >
      {/* Tabs -  sticky 顶部避免被压上：手机只剩图标，桌面看完整文字 */}
      <div className="sticky top-[52px] sm:top-[60px] z-40 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto">
          {LOG_FILES.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(f)}
              className={`flex-1 min-w-fit px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                active.key === f.key
                  ? 'bg-primary-600 text-white shadow'
                  : 'bg-white dark:bg-[#273244] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="mr-0.5 sm:mr-1 inline-flex align-middle">
                <Icon icon={f.icon} size={14} />
              </span>
              <span className="sm:hidden">{f.label}</span>
              <span className="hidden sm:inline">{f.labelFull}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 【续 45.8b+ 2026-07-09】Selection dropdown 块删除(LOG_FILES 无 loadOptions 项,死代码)
          保留 Active file info(syslog description + size info 一行) */}
      {!active.loadOptions && (
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">{active.description}</span>
          <span className="whitespace-nowrap">
            {sizeInfo.lines.toLocaleString()} 行 / {Math.round(sizeInfo.bytes / 1024)} KB
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="mb-3 flex flex-wrap gap-1.5 sm:gap-2 items-center">
        <button
          onClick={() => loadLog()}
          disabled={loading}
          className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1"
        >
          {loading ? <Icon icon={Hourglass} size={14} /> : <Icon icon={RefreshCw} size={14} />}{' '}
          <span className="hidden sm:inline">刷新</span>
        </button>

        <label className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded-lg text-xs sm:text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-gray-700 dark:text-gray-300">自动 (5s)</span>
        </label>

        <label className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded-lg text-xs sm:text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-gray-700 dark:text-gray-300">跳到顶</span>
        </label>

        {/* 【续 33-2】告警开关 */}
        <label
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-sm cursor-pointer ${
            alertEnabled
              ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300'
              : 'bg-white dark:bg-[#273244] border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
          }`}
          title="命中 error/fatal/panic 等关键字时弹 toast 通知"
        >
          <input
            type="checkbox"
            checked={alertEnabled}
            onChange={(e) => setAlertEnabled(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="inline-flex items-center gap-1">
            <Icon icon={Bell} size={14} />
            告警
          </span>
        </label>

        <div className="relative flex-1 min-w-24 sm:min-w-32">
          <span className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Icon icon={Search} size={14} />
          </span>
          <input
            type="text"
            placeholder="过滤"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-2.5 sm:pr-3 py-1.5 sm:py-2 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded-lg text-xs sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            style={{ WebkitTextFillColor: 'currentColor' }}
          />
        </div>

        {filter && (
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {filteredLines.length} 行 /{' '}
            <span className="text-primary-600 dark:text-primary-400 font-medium">
              {matchCount} 处匹配
            </span>
          </span>
        )}

        {/* 【续 74】全局统一刷新时间(与其他页签同一个值) */}
        <LastRefreshText className="w-full sm:w-auto" />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center gap-1.5">
          <Icon icon={XCircle} size={16} className="shrink-0" />
          <span>加载失败: {error}</span>
        </div>
      )}

      {/* Log content - 虚拟滚动(高度由 ResizeObserver 实时同步) */}
      <div
        ref={logContainerRef}
        className="flex-1 min-h-0 bg-gray-900 dark:bg-black rounded-lg p-1 sm:p-2 font-mono text-[11px] sm:text-xs leading-snug"
      >
        {loading && !content ? (
          <div className="text-gray-400 text-center py-8 inline-flex items-center gap-1.5 w-full justify-center">
            <Icon icon={Hourglass} size={15} />
            加载中...
          </div>
        ) : !filteredLines.some((l) => l.trim()) ? (
          <div className="text-gray-400 text-center py-8 inline-flex items-center gap-1.5 w-full justify-center">
            <Icon icon={Inbox} size={15} />
            <span>{filter ? '无匹配行' : '日志为空或未选择'}</span>
          </div>
        ) : (
          <FixedSizeList
            ref={listRef}
            height={logHeight}
            itemCount={filteredLines.length}
            itemSize={ROW_HEIGHT}
            width="100%"
            itemData={{
              lines: filteredLines,
              isSyslogTab: active.key === 'syslog',
              filter,
            }}
            overscanCount={10}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>

      {/* Stats footer */}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center flex flex-wrap items-center justify-center gap-2">
        <span>
          显示 {filteredLines.length} / {maxLines} 行(最大) · 最新在顶部 · 虚拟滚动已启用
        </span>
        <label className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">显示:</span>
          <select
            value={maxLines}
            onChange={(e) => setMaxLines(Number(e.target.value))}
            className="bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs"
            aria-label="最大显示行数"
          >
            {MAX_LINES_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n >= 1000 ? `${n / 1000}k` : n} 行
              </option>
            ))}
          </select>
        </label>
        {/* 【P0-3 2026-06-17】导出当前过滤结果(常见:截屏后给开发者/同事看) */}
        {filteredLines.length > 0 && (
          <button
            onClick={() => {
              exportLogLines(filteredLines, active.key, filter);
              toast.success(`已导出 ${filteredLines.length} 行`);
            }}
            className="px-2 py-0.5 bg-white dark:bg-[#273244] border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="导出当前显示/过滤的行(纯文本)"
          >
            <span className="inline-flex items-center gap-1">
              <Icon icon={Save} size={13} />
              导出
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
