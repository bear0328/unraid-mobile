// 【阶段 P1-4b - 2026-06-15】图片预览 Lightbox
// 全屏 modal + 居中图片 + 关闭按钮
// 【阶段 P0-a - 2026-06-15 续 4】键盘导航：← / → 切换图片，ESC 关闭
// 【阶段 P1-a11y - 2026-06-17 续 29-3】role="dialog" + aria-modal + focus-trap
// 视频/音频暂不支持,只展示图片
import { useEffect, useId, useMemo, useRef, useState, type TouchEvent } from 'react';
import { FileItem, davFetch } from './davAuth';
import { isImageFile, getImageMime } from '../../utils/fileTypes';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ImageLightboxProps {
  item: FileItem | null;
  /** 当前目录文件列表（用于上下张切换，自动过滤图片） */
  items: FileItem[];
  /** 拼接完整 URL（DAV） */
  urlFor: (path: string) => string;
  onClose: () => void;
  /** 切换到指定图片 */
  onChange: (item: FileItem) => void;
}

export default function ImageLightbox({
  item,
  items,
  urlFor,
  onClose,
  onChange,
}: ImageLightboxProps) {
  const imageItems = useMemo(() => items.filter((i) => isImageFile(i.name)), [items]);
  const currentIndex = item ? imageItems.findIndex((i) => i.path === item.path) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < imageItems.length - 1;
  const titleId = useId();
  const containerRef = useFocusTrap(!!item, onClose);

  // 键盘导航：ESC 关闭，← / → 切换（focus-trap 也处理 Esc,这里额外加方向键）
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc 交给 useFocusTrap 处理
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        onChange(imageItems[currentIndex - 1]);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onChange(imageItems[currentIndex + 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onChange, hasPrev, hasNext, imageItems, currentIndex]);

  // 锁 body 滚动
  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [item]);

  // 【P0-2 2026-06-17】触屏左右滑动切换
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const SWIPE_THRESHOLD = 50; // 触发切换的最小横向位移
  const SWIPE_MAX = 120; // 位移上限,防止拉过头

  // 【续 50】图片经 davFetch 拉 blob → objectURL。
  // 原实现 <img src="/dav/..."> 带不了手动 Authorization,只能靠浏览器缓存的 Basic 凭证
  // (fetch 401 不弹原生登录框,多数环境没缓存)→ 图片 401 加载失败。
  const mime = item ? getImageMime(item.name) : null;
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  useEffect(() => {
    if (!item || !mime) {
      setImgUrl(null);
      setImgError(null);
      return;
    }
    let cancelled = false;
    let objUrl: string | null = null;
    setImgUrl(null);
    setImgError(null);
    davFetch(urlFor(item.path))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setImgUrl(objUrl);
      })
      .catch((e) => {
        if (!cancelled) setImgError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [item, mime, urlFor]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeOffset(0);
  }
  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // 横向主导才接管(避免上下滑被吞)
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
      setSwipeOffset(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)));
    }
  }
  function onTouchEnd() {
    if (touchStartX.current === null) return;
    if (swipeOffset <= -SWIPE_THRESHOLD && hasNext) {
      onChange(imageItems[currentIndex + 1]);
    } else if (swipeOffset >= SWIPE_THRESHOLD && hasPrev) {
      onChange(imageItems[currentIndex - 1]);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setSwipeOffset(0);
  }

  if (!item) return null;

  const totalImages = imageItems.length;
  const position = currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-2 sm:p-4"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 关闭按钮（避开 iOS 灵动岛/刘海） */}
      <button
        onClick={onClose}
        className="absolute right-2 sm:right-4 w-10 h-10 flex items-center justify-center text-white text-2xl bg-black/50 hover:bg-black/80 rounded-full z-10"
        style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
        aria-label="关闭"
      >
        ✕
      </button>

      {/* 上一张 */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange(imageItems[currentIndex - 1]);
          }}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-white text-2xl bg-black/50 hover:bg-black/80 rounded-full z-10"
          aria-label="上一张"
        >
          ‹
        </button>
      )}

      {/* 下一张 */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange(imageItems[currentIndex + 1]);
          }}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-white text-2xl bg-black/50 hover:bg-black/80 rounded-full z-10"
          aria-label="下一张"
        >
          ›
        </button>
      )}

      {/* 图片（点击图片不关闭,只有点击背景关闭） */}
      <div
        className="max-w-full max-h-full flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {mime ? (
          imgError ? (
            <div className="text-white text-sm">加载失败: {imgError}</div>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt={item.name}
              className="max-w-full max-h-[85dvh] object-contain rounded shadow-2xl select-none"
              draggable={false}
              style={{
                transform: `translateX(${swipeOffset}px)`,
                transition: touchStartX.current === null ? 'transform 0.2s ease-out' : 'none',
              }}
            />
          ) : (
            <div className="text-white text-sm">加载中…</div>
          )
        ) : (
          <div className="text-white text-sm">不支持的文件类型</div>
        )}
        <div className="text-white text-xs sm:text-sm text-center px-2 truncate max-w-[90vw]">
          <span id={titleId}>
            {item.name}
            {totalImages > 1 && (
              <span className="ml-2 text-white/60">
                {position} / {totalImages}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
