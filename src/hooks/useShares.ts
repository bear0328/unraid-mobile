// 【阶段 1 P0 - 2026-06-15】Shares 数据获取 Hook
// 从 Shares.tsx 拆出：URL/路径工具 + fetchDir + 导航
// 【阶段 P1-1a - 2026-06-15 续 4】稳定 callback 引用（用 useMemo 包裹 filesUrl / paths / api）
//   这样 fetchDir / navigateTo / navigateUp / refresh 都是稳定引用，
//   配合 React.memo 包装的 FileRow 可避免不必要的 re-render
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiConfig, UnraidApiService } from '../services';
import { FileItem, davFetch } from '../components/shares/davAuth';
import { parseAutoindexHtml } from '../components/shares/parseAutoindex';

export interface SharesPaths {
  /** /files/user/... 列 user 共享（取自 /mnt/user/） */
  filesUrl: string;
  /** /dav/... 对应 /mnt/cache/（DAV 操作走 cache，绕开 user 视图 symlink） */
  davUrl: string;
  toFilesPath: (p: string) => string;
  toDavPath: (p: string) => string;
}

export interface UseSharesResult {
  path: string;
  items: FileItem[];
  loading: boolean;
  error: string | null;
  paths: SharesPaths;
  /** 重新拉取指定路径 */
  fetchDir: (dirPath: string) => Promise<void>;
  /** 刷新当前路径 */
  refresh: () => Promise<void>;
  /** 点击目录项导航 */
  navigateTo: (item: FileItem) => void;
  /** 面包屑导航:改 URL,[path] effect 联动拉数据 */
  navigateToPath: (p: string) => void;
  /** 上一级 */
  navigateUp: () => void;
}

const FILES_PATH_SUFFIX = '/files/user';
const DAV_PATH_SUFFIX = '/dav';

export function useShares(): UseSharesResult {
  // 路径是相对于 /user/ 的。例如 'photos/bear/'。空串表示 user 共享根
  // 【续 42.5 2026-06-19】path 完全由 URL pathname 推导(去掉 /shares/ 前缀)
  // router 已配 path="shares/*",子路径在 URL 上,如 /shares/appdata → path='appdata/'
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 【续 42.5 2026-06-19】从 useLocation 解码 path:/shares/appdata → 'appdata/'
  // 之前 path 是内部 useState,跟 URL 不同步导致 /shares/appdata 渲染空白
  const location = useLocation();
  const navigate = useNavigate();
  const path = useMemo(() => {
    const sub = location.pathname.replace(/^\/shares\/?/, '').trim();
    return sub ? decodeURIComponent(sub) + (sub.endsWith('/') ? '' : '/') : '';
  }, [location.pathname]);

  // 使用当前访问的 host:port（避免 iPhone 跨域/端口问题）
  // origin 是字符串 primitive，Object.is 比较相同值返回 true，所以 useMemo 不会重复计算
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const config = getApiConfig();
  const baseUrl =
    config?.serverUrl?.replace(/:\d+$/, '').replace('http://', '').replace('https://', '') || '';

  const filesUrl = useMemo(() => `${origin}${FILES_PATH_SUFFIX}`, [origin]);
  const davUrl = useMemo(() => `${origin}${DAV_PATH_SUFFIX}`, [origin]);
  const api = useMemo(
    () => new UnraidApiService(baseUrl, config?.apiKey || ''),
    [baseUrl, config?.apiKey]
  );

  const paths: SharesPaths = useMemo(
    () => ({
      filesUrl,
      davUrl,
      toFilesPath: (p: string) => (p ? `${filesUrl}/${p}` : `${filesUrl}/`),
      toDavPath: (p: string) => (p ? `${davUrl}/${p}` : `${davUrl}/`),
    }),
    [filesUrl, davUrl]
  );

  const fetchDir = useCallback(
    async (dirPath: string) => {
      setLoading(true);
      setError(null);
      try {
        // 根目录 = unRAID 全部 share（从 GraphQL 获取）
        if (dirPath === '') {
          const result = await api.getShares();
          if (!result || result.length === 0) {
            throw new Error('未获取到共享列表');
          }
          setItems(
            result.map((s) => ({
              name: s.name,
              path: s.name + '/',
              size: s.used || undefined,
              mtime: 0,
              date: '',
              isDir: true,
              permissions: '',
            }))
          );
          return;
        }

        // 子目录 = nginx autoindex（解析逻辑在 parseAutoindexHtml）
        // 【续 50】/files 已加 auth_basic,走 davFetch 自动带 Authorization(401 有友好提示)
        const response = await davFetch(paths.toFilesPath(dirPath));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        setItems(parseAutoindexHtml(text, dirPath));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [api, paths]
  );

  // 【续 16 - 2026-06-16】用 ref 持有 latest fetchDir,避免 effect 依赖 fetchDir 引用
  // (fetchDir 被 useCallback 重建会导致重复拉取)
  // 【续 50 修 B2】effect 依赖 path:点目录/面包屑/深链接使 URL 变化 → 重新拉对应目录。
  // 原实现只在 mount 拉一次根目录,点目录后 URL 变了内容不变;
  // 深链接 /shares/photos 也错拉根目录,却在 photos 路径下执行新建/上传(写错位置)。
  const fetchDirRef = useRef(fetchDir);
  fetchDirRef.current = fetchDir;
  useEffect(() => {
    fetchDirRef.current(path);
  }, [path]);

  const refresh = useCallback(() => fetchDir(path), [fetchDir, path]);

  const navigateTo = useCallback(
    (item: FileItem) => {
      if (item.isDir) {
        // 【续 42.5 2026-06-19】改 URL → 触发 router re-render → useShares 重读 pathname
        navigate('/shares/' + encodeURI(item.path.replace(/\/+$/, '')));
      }
    },
    [navigate]
  );

  const navigateUp = useCallback(() => {
    if (path === '') return;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    const parent = parts.length > 0 ? parts.join('/') + '/' : '';
    // 【续 42.5】改 URL
    const newPath = parent ? '/shares/' + encodeURI(parent.replace(/\/+$/, '')) : '/shares';
    navigate(newPath);
  }, [path, navigate]);

  // 【续 50 修 B2】面包屑导航:统一走 URL(原来只 fetchDir 不改 URL,URL/path 停在旧值,
  // 之后 refresh() 会拉错目录)
  const navigateToPath = useCallback(
    (p: string) => {
      const clean = p.replace(/\/+$/, '');
      navigate(clean ? '/shares/' + encodeURI(clean) : '/shares');
    },
    [navigate]
  );

  return useMemo(
    () => ({ path, items, loading, error, paths, fetchDir, refresh, navigateTo, navigateToPath, navigateUp }),
    [path, items, loading, error, paths, fetchDir, refresh, navigateTo, navigateToPath, navigateUp]
  );
}
