// 【阶段 P2-分享 - 2026-06-17 续 33-5】Web Share API hook
// navigator.share() 调起系统分享面板(微信/QQ/邮件/隔空投送等)
// 不支持时降级到 clipboard.writeText(剪贴板)
// 桌面浏览器(navigator.share undefined)直接降级
import { useCallback, useMemo } from 'react';
import { useToast } from './useToast';

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export function useShare() {
  const toast = useToast();

  const canShareFiles = useCallback((files?: File[]) => {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false;
    if (!files || files.length === 0) return true;
    return navigator.canShare({ files });
  }, []);

  const share = useCallback(
    async (data: ShareData): Promise<boolean> => {
      if (typeof navigator === 'undefined' || !navigator.share) {
        // 降级:复制 url 到剪贴板
        if (data.url) {
          try {
            await navigator.clipboard.writeText(data.url);
            toast.success('链接已复制到剪贴板');
            return true;
          } catch {
            toast.error('复制失败,请手动复制');
            return false;
          }
        }
        toast.warning('当前环境不支持分享');
        return false;
      }
      try {
        await navigator.share(data);
        return true;
      } catch (e) {
        // 用户取消不报错
        if (e instanceof Error && e.name === 'AbortError') return false;
        // 其他错误降级
        if (data.url) {
          try {
            await navigator.clipboard.writeText(data.url);
            toast.success('系统分享失败,已复制链接到剪贴板');
          } catch {
            toast.error('分享失败: ' + (e instanceof Error ? e.message : String(e)));
          }
        } else {
          toast.error('分享失败: ' + (e instanceof Error ? e.message : String(e)));
        }
        return false;
      }
    },
    [toast]
  );

  return useMemo(() => ({ share, canShareFiles }), [share, canShareFiles]);
}
