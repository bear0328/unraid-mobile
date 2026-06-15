// 【阶段 P2-收藏 - 2026-06-17 续 32-6】Dashboard 收藏卡片
// 显示 useFavorites() 列表,点击跳到目标
// 跳法:
//   container: /containers?focus={name}(Containers 消费:滚动定位+高亮)
//   share:     /shares/{name}
//   path:      /shares/{fullpath}
// 【续 50 C8】share/path 从 ?path= query 改 pathname 风格:useShares 从 pathname
// 推导路径并自动拉数据,?path= 无人消费是死链
// 【阶段 P2-导入导出 - 2026-06-17 续 33-3】导出 JSON 备份 + 导入(防换手机/清缓存)
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites, type Favorite, type FavoriteKind } from '../../hooks/useFavorites';
import { useToast } from '../../hooks/useToast';

function kindMeta(kind: FavoriteKind): { icon: string; label: string; color: string } {
  switch (kind) {
    case 'container':
      return {
        icon: '📦',
        label: '容器',
        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      };
    case 'share':
      return {
        icon: '📁',
        label: '分享',
        color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      };
    case 'path':
      return {
        icon: '📂',
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

  if (favorites.length === 0) {
    // 空时也显示导入入口,方便用户恢复备份
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <span>⭐</span> 快捷收藏
          </h3>
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-primary-600"
          >
            📥 导入
          </button>
        </div>
        <p className="text-xs text-gray-400">
          暂无收藏。在容器详情或文件目录点 ⭐ 添加。也可导入备份。
        </p>
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
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span>⭐</span> 快捷收藏
          <span className="text-xs text-gray-400 font-normal">({favorites.length})</span>
        </h3>
        <div className="flex items-center gap-1">
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
          <button
            onClick={handleExport}
            className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-primary-600"
            title="下载 JSON 备份"
          >
            📤 导出
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-primary-600"
            title="从 JSON 文件恢复"
          >
            📥 导入
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
                <span>{m.icon}</span>
                <span className="font-medium text-gray-700 dark:text-gray-200 truncate max-w-[120px]">
                  {fav.label}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.color} shrink-0`}>
                  {m.label}
                </span>
              </Link>
              <button
                onClick={() => remove(fav.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-base leading-none ml-1 transition-opacity"
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
