// 【阶段 P2-WebDAV - 2026-06-17 续 34-8】文本文件在线编辑
// 用 nginx /dav/ GET 读 + PUT 写回
// 限制:文本类(扩展名白名单),< 1MB
import { useEffect, useState, useRef } from 'react';
import { useToast } from '../../hooks/useToast';
import { davFetch } from './davAuth';

const MAX_EDIT_BYTES = 1024 * 1024; // 1MB

interface TextFileEditorProps {
  open: boolean;
  /** WebDAV 完整 URL(从 paths.toDavPath 拿) */
  davUrl: string;
  /** 显示名(顶部) */
  displayName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function TextFileEditor({
  open,
  davUrl,
  displayName,
  onClose,
  onSaved,
}: TextFileEditorProps) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const dirty = content !== original;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // 【续 50】raw fetch → davFetch:/dav/ 有 auth_basic,raw fetch 不带手动 Authorization,
    // 之前只靠浏览器缓存的 Basic 凭证(fetch 401 不弹原生登录框,多数情况拿不到)→ 401。
    davFetch(davUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const len = Number(r.headers.get('content-length') || '0');
        if (len > MAX_EDIT_BYTES)
          throw new Error(`文件 ${(len / 1024).toFixed(0)}KB 超过 1MB,无法在线编辑`);
        const text = await r.text();
        if (cancelled) return;
        setContent(text);
        setOriginal(text);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, davUrl]);

  // Esc 关闭(带 dirty 确认)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, content, original, saving]);

  function handleClose() {
    if (dirty && !confirm('有未保存的修改,确定关闭?')) return;
    setContent('');
    setOriginal('');
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (saving || loading) return;
    if (!dirty) {
      toast.info('无修改');
      return;
    }
    setSaving(true);
    try {
      const r = await davFetch(davUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: content,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setOriginal(content);
      toast.success('已保存');
      onSaved?.();
    } catch (e) {
      toast.error('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="文本编辑"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-base shrink-0">✏️</span>
          <span
            className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate flex-1"
            title={displayName}
          >
            {displayName}
          </span>
          {dirty && (
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded">
              未保存
            </span>
          )}
          <button
            onClick={handleClose}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={saving}
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            加载中…
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-500 text-sm gap-2 p-4 text-center">
            <span className="text-2xl">⚠️</span>
            <span>{error}</span>
            <button onClick={handleClose} className="text-xs text-primary-600 hover:underline">
              关闭
            </button>
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-3 text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none resize-none"
            style={{ minHeight: '50dvh', tabSize: 2 }}
          />
        )}
        <div className="px-4 py-1.5 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 flex justify-between">
          <span>Ctrl/Cmd+S 保存 · Esc 关闭 · {content.length.toLocaleString()} 字符</span>
          <span>{dirty ? '已修改' : '未修改'}</span>
        </div>
      </div>
    </div>
  );
}
