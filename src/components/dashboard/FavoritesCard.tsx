// 【阶段 P2-收藏 - 2026-06-17 续 32-6】Dashboard 收藏卡片
// 显示 useFavorites() 列表,点击跳到目标
// 跳法:
//   container: /containers?focus={name}(Containers 消费:滚动定位+高亮)
//   share:     /shares/{name}
//   path:      /shares/{fullpath}
// 【续 50 C8】share/path 从 ?path= query 改 pathname 风格:useShares 从 pathname
// 推导路径并自动拉数据,?path= 无人消费是死链
// 【阶段 P2-导入导出 - 2026-06-17 续 33-3】导出 JSON 备份 + 导入(防换手机/清缓存)
// 【续 90】标题回到 text-base font-semibold(index.css 约定);圆角统一 cardClass;
//   空态改单行紧凑条(⭐+提示+导入),不再占首屏一大块
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Package, Folder, FolderOpen, Star, Download, Upload, type LucideIcon } from 'lucide-react';
import { useFavorites, type Favorite, type FavoriteKind } from '../../hooks/useFavorites';
import { useToast } from '../../hooks/useToast';
import Icon from '../ui/Icon';
import { cardClass } from '../ui/Card';

function kindMeta(kind: FavoriteKind): { icon: LucideIcon; label: string; color: string } {
  switch (kind) {
    case 'container':
      return {
        icon: Package,
        label: '容器',
        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      };
    case 'share':
      return {
        icon: Folder,
        label: '分享',
        color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      };
    case 'path':
      return {
        icon: FolderOpen,
        label: '路径',
        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      };
  }
}

function buildHref(fav: Favorite): string {
  switch (fav.kind) {
    case 'container':
      return `/containers?focus=${encodeURIComponent(fav.value)}`;
    case 'share':
    case 'path':
      // 【续 50 C8】pathname 风格(/shares/appdata),与 useShares navigateTo 一致;
      // 去前导斜杠防 // 双斜杠,encodeURI 保留路径分隔符(同 navigateTo)
      return `/shares/${encodeURI(fav.value.replace(/^\/+/, ''))}`;
  }
}

export default function FavoritesCard() {
  const { favorites, remove, exportJson, importJson } = useFavorites();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // 隐藏 file input + 导入逻辑(空态/非空态共用)
  const importInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const r = importJson(text);
          toast.success(`导入完成: 新增 ${r.added} 条,跳过 ${r.skipped} 条已存在`);
        } catch (err) {
          toast.error('导入失败: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
          e.target.value = '';
        }
      }}
    />
  );

  if (favorites.length === 0) {
    // 【续 90】空态改单行紧凑条(⭐+提示+导入),不再占首屏一大块;
    // 空时也保留导入入口,方便用户恢复备份
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Icon icon={Star} size={14} fill="currentColor" className="text-yellow-500 shrink-0" />
          <p className="flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400 truncate">
            暂无收藏,在容器详情或文件目录点 ⭐ 添加,也可导入备份
          </p>
          {importInput}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 shrink-0 text-xs px-2 py-1 text-gray-700 dark:text-gray-300 font-medium hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2 transition-colors"
          >
            <Icon icon={Download} size={12} />
            导入
          </button>
        </div>
      </div>
    );
  }

  function handleExport() {
    try {
      const json = exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unraid-favorites-${new Date().toISOString().slice(0, 10)}.json`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      // iOS Safari:必须 setTimeout 延迟 revoke,否则下载未触发就清掉 URL
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      toast.success(`已导出 ${favorites.length} 条收藏`);
    } catch (err) {
      toast.error('导出失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <Icon icon={Star} size={14} fill="currentColor" className="text-yellow-500" /> 快捷收藏
          <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">({favorites.length})</span>
        </h3>
        <div className="flex items-center gap-1">
          {importInput}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 text-gray-700 dark:text-gray-300 font-medium hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2 transition-colors"
            title="下载 JSON 备份"
          >
            <Icon icon={Upload} size={12} />
            导出
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 text-gray-700 dark:text-gray-300 font-medium hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2 transition-colors"
            title="从 JSON 文件恢复"
          >
            <Icon icon={Download} size={12} />
            导入
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {favorites.map((fav) => {
          const m = kindMeta(fav.kind);
          return (
            <div
              key={fav.id}
              className="group flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg pl-2.5 pr-1 py-1 text-xs transition-colors"
            >
              <Link
                to={buildHref(fav)}
                className="flex items-center gap-1.5 min-w-0"
                title={fav.value}
              >
                <Icon icon={m.icon} size={12} />
                <span className="font-medium text-gray-700 dark:text-gray-200 truncate max-w-[120px]">
                  {fav.label}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.color} shrink-0`}>
                  {m.label}
                </span>
              </Link>
              <button
                onClick={() => remove(fav.id)}
                // 【续 95 P1-2】原 opacity-0 + group-hover:触屏无 hover,× 永远不可见;
                // 改常态半透明(opacity-40),hover/键盘聚焦加深
                className="opacity-40 hover:opacity-100 focus-visible:opacity-100 text-gray-400 hover:text-red-500 text-base leading-none ml-1 transition-opacity"
                aria-label={`移除收藏 ${fav.label}`}
                title="移除"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
