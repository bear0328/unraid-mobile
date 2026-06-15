// 【阶段 P2-清理 - 2026-06-17 续 37-3】磁盘清理 modal
// 共享页 / 设置页唤起,展示 Top 大文件 / 长期未动,可跳路径
// 【续 39-1】改用通用 <Modal layout="flex">,删除 20+ 行 backdrop/focus-trap/body-scroll 样板
import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { formatBytes, formatMtime, scanDisk, type ScanResult } from '../utils/diskScanner';
import { Modal } from './Modal';

type Tab = 'largest' | 'oldest';

interface Props {
  open: boolean;
  onClose: () => void;
  /** /files/user 完整 origin URL */
  filesUrl: string;
  /** 点击文件时调用(打开 Shares 跳到该 path) */
  onPick?: (path: string) => void;
}

export default function DiskCleanupModal({ open, onClose, filesUrl, onPick }: Props) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ dirs: 0, files: 0 });
  const [tab, setTab] = useState<Tab>('largest');
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      setResult(null);
      setScanning(false);
      setProgress({ dirs: 0, files: 0 });
      return;
    }
    const ctrl = new AbortController();
    setScanning(true);
    scanDisk(filesUrl, {
      maxDepth: 4,
      maxItems: 3000,
      onProgress: (p) => setProgress({ dirs: p.dirsScanned, files: p.filesScanned }),
      signal: ctrl.signal,
    })
      .then((r) => setResult(r))
      .catch((e) => {
        if (e?.name !== 'AbortError') toast.error('扫描失败:' + (e?.message || e));
      })
      .finally(() => setScanning(false));
    return () => ctrl.abort();
  }, [open, filesUrl, toast]);

  const list = result ? (tab === 'largest' ? result.largest : result.oldest) : [];
  const parentPath = (p: string) => {
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/') + (parts.length ? '/' : '');
  };

  function copyPath(p: string) {
    void navigator.clipboard.writeText(p).then(() => toast.success('已复制路径'));
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-2xl" maxHeight="88dvh" layout="flex">
      <header className="shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            🧹 磁盘清理建议
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {scanning
              ? `扫描中… 已扫 ${progress.dirs} 目录 / ${progress.files} 文件`
              : result
                ? `共扫 ${result.stats.dirsScanned} 目录 / ${result.stats.filesScanned} 文件,耗时 ${(result.stats.durationMs / 1000).toFixed(1)}s`
                : '准备中…'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
          aria-label="关闭"
        >
          ×
        </button>
      </header>

      {!result ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-4xl mb-2 animate-pulse">{scanning ? '🔍' : '⏳'}</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {scanning ? '递归扫描 /files/user/ 树…' : '初始化…'}
            </p>
            {result === null && scanning && (
              <p className="text-xs text-gray-400 mt-2">深度 4 / 最多 3000 条 / 4 并发</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-2">
            <button
              onClick={() => setTab('largest')}
              className={`px-3 py-2 text-sm font-medium ${tab === 'largest' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}
            >
              大文件 ({result.largest.length})
            </button>
            <button
              onClick={() => setTab('oldest')}
              className={`px-3 py-2 text-sm font-medium ${tab === 'oldest' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}
            >
              长期未动 ({result.oldest.length})
            </button>
          </div>

          {result.stats.truncated && (
            <div className="px-4 py-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
              ⚠️ 扫描达到上限,只显示前 {result.stats.dirsScanned + result.stats.filesScanned} 条
            </div>
          )}

          {/* 【续 50 H13】min-h-0:flex 子元素默认 min-height:auto 会撑爆不滚动,加 min-h-0 才能在 88dvh 内滚动 */}
          <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {list.length === 0 ? (
              <li className="text-center py-8 text-sm text-gray-500">
                {tab === 'largest' ? '没有 >10MB 的文件 🎉' : '没有超过 365 天没动的文件 🎉'}
              </li>
            ) : (
              list.map((f, idx) => (
                <li
                  key={`${f.path}-${idx}`}
                  className="flex items-center gap-2 px-2.5 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                  <span className="text-base shrink-0">{tab === 'largest' ? '📦' : '📅'}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-mono truncate text-gray-900 dark:text-gray-100"
                      title={f.path}
                    >
                      {f.name}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      {f.path}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {f.size != null ? formatBytes(f.size) : '-'}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {f.mtime > 0 ? formatMtime(f.mtime) : '-'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    {onPick && (
                      <button
                        onClick={() => {
                          onPick(parentPath(f.path));
                          onClose();
                        }}
                        className="px-2 py-0.5 text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded"
                        title={`跳到 ${parentPath(f.path)}`}
                      >
                        打开
                      </button>
                    )}
                    <button
                      onClick={() => copyPath(f.path)}
                      className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                    >
                      复制
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
          <footer className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700">
            扫描:{result.stats.dirsScanned} 目录 · {result.stats.filesScanned} 文件 · 累计{' '}
            {formatBytes(result.stats.totalBytes)} · 错误 {result.stats.errors}
          </footer>
        </>
      )}
    </Modal>
  );
}
