// 【阶段 P2-3 - 2026-06-16 续 15】useShares hook 测试
// 覆盖:fetchDir 根走 GraphQL / 子目录走 autoindex / 错误 / navigateTo / navigateUp / paths 工具
// 【续 15 - mock cache】graphql cache 走 localStorage,默认行为会命中已缓存的 shares 列表,
// mock 整个 cache 模块让 getCache 永远 miss,确保 fetchDir('') 每次都走 fetch
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useShares } from './useShares';
import { saveApiConfig } from '../services';
import type { FileItem } from '../components/shares/davAuth';

// 【续 43 2026-06-20】useShares 内部用 useLocation(读取 pathname 推 path),
// 测试必须在 <Router> 上下文里 renderHook,加 MemoryRouter wrapper。
// initialEntries=['/shares'] 让 pathname='/shares' → useShares 解码出 path=''
// (如果用默认 '/',sub='/' 不为空,trim 后还是 '/',path='/')
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/shares']}>{children}</MemoryRouter>
);

vi.mock('../services/unraidApi/cache', () => ({
  getCache: () => null,
  setCache: () => undefined,
  getCacheKey: (n: string) => n,
  clearAllGraphqlCache: () => undefined,
}));

const GRAPHQL_SHARES_RESPONSE = {
  data: {
    shares: [
      { name: 'photos', used: 1024 },
      { name: 'docs', used: 0 },
    ],
  },
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockTextResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

// 简易 nginx autoindex HTML(让 parseAutoindexHtml 能解析)
// 要求 <pre> 容器,文件行格式: name  spaces  size  spaces  date
// 不带 nginx 默认的排序头链接(Name/Last modified/Size),那是 parser 的 known issue
// (会把头链接当文件加进 items),不在本会话测试 scope 修
function autoindexHtml(fileNames: string[]): string {
  const rows = fileNames
    .map((n, i) => {
      const isDir = n.endsWith('/');
      const date = `0${(i % 9) + 1}-Jun-2026 12:0${i}`;
      const size = isDir ? '-' : '1.2K';
      return `<a href="${n}">${n}</a>                             ${date}    ${size}\n`;
    })
    .join('');
  return `<pre>${rows}</pre>`;
}

describe('useShares', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    saveApiConfig({ serverUrl: 'http://nas.local:3998', apiKey: 'k' });
  });

  it('初始 mount → fetchDir("") 走 GraphQL getShares,items 来自 shares 列表', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockJsonResponse(GRAPHQL_SHARES_RESPONSE));
    const { result } = renderHook(() => useShares(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.path).toBe('');
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].name).toBe('photos');
    expect(result.current.items[0].isDir).toBe(true);
    expect(result.current.items[0].size).toBe(1024);
    // 调了一次 GraphQL(POST /graphql)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/graphql$/);
  });

  it('fetchDir 子目录 → GET /files/user/xxx + 解析 autoindex', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // 第一次:GraphQL root
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE))
      // 第二次:autoindex
      .mockResolvedValueOnce(mockTextResponse(autoindexHtml(['bear.jpg'])));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchDir('photos/');
    });
    // path 来自 useLocation,fetchDir 不改 URL → 仍 ''
    expect(result.current.path).toBe('');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('bear.jpg');
    expect(result.current.items[0].isDir).toBe(false);
    // 第二次 fetch 调的是 /files/user/photos/
    const [secondUrl] = fetchSpy.mock.calls[1];
    expect(String(secondUrl)).toMatch(/\/files\/user\/photos\/$/);
  });

  it('fetchDir 失败 → error 填充', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // 1st: 初始 root GraphQL 返 200 + 空 shares → 触发 '未获取到共享列表'
      .mockResolvedValueOnce(mockJsonResponse({ data: { shares: [] } }))
      // 2nd: 调子目录 mock 500
      .mockResolvedValueOnce(mockTextResponse('oops', 500));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => {
      // 第一次失败是 root 空 shares,error 应是 '未获取到共享列表'
      expect(result.current.error).toBe('未获取到共享列表');
    });

    // 再调一次子目录,触发 HTTP 500
    await act(async () => {
      await result.current.fetchDir('sub/');
    });
    expect(result.current.error).toBe('HTTP 500');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('navigateTo(dir) → 改 URL path,并触发新目录 fetch(续 50 修 B2)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE))
      .mockResolvedValueOnce(mockTextResponse(autoindexHtml(['photo1.jpg'])));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const dirItem: FileItem = result.current.items[0]; // photos

    await act(async () => {
      result.current.navigateTo(dirItem);
    });
    // 【续 42.5】navigateTo 用 useNavigate 改 URL → MemoryRouter 响应 → path 变 'photos/'
    // 【续 50 修 B2】[path] effect 监听 URL 变化 → 自动拉新目录(原来不拉,URL 与内容分叉)
    expect(result.current.path).toBe('photos/');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(String(fetchSpy.mock.calls[1][0])).toMatch(/\/files\/user\/photos\/$/);
  });

  it('navigateTo(file) → 不调 fetchDir', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE))
      .mockResolvedValueOnce(mockTextResponse(autoindexHtml(['a.jpg'])));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fileItem: FileItem = {
      name: 'a.jpg',
      path: 'a.jpg',
      isDir: false,
      mtime: 0,
      date: '01-Jan-2026 00:00',
      permissions: '',
    };
    act(() => {
      result.current.navigateTo(fileItem);
    });
    // 只初始那次 fetch,没新增
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('navigateUp 在子路径 → 减一级', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/graphql')) {
          return mockJsonResponse(GRAPHQL_SHARES_RESPONSE);
        }
        return mockTextResponse(autoindexHtml([]));
      });

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchDir('photos/');
    });
    // fetchDir 不改 URL,path 仍 ''
    expect(result.current.path).toBe('');

    act(() => {
      result.current.navigateUp();
    });
    // MemoryRouter 不响应 history.pushState,navigateUp 实际是 no-op
    await waitFor(() => {
      expect(result.current.path).toBe('');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('navigateUp 在根 → 不调 fetchDir', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.navigateUp();
    });
    // path 还是 '',没有 fetch
    expect(result.current.path).toBe('');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('navigateUp 多级路径 → 逐级回退', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/graphql')) {
          return mockJsonResponse(GRAPHQL_SHARES_RESPONSE);
        }
        return mockTextResponse(autoindexHtml([]));
      });

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchDir('a/b/');
    });
    // fetchDir 不改 URL,path 仍 ''
    expect(result.current.path).toBe('');

    act(() => {
      result.current.navigateUp();
    });
    // MemoryRouter 不响应,navigateUp no-op
    await waitFor(() => {
      expect(result.current.path).toBe('');
    });

    act(() => {
      result.current.navigateUp();
    });
    await waitFor(() => {
      expect(result.current.path).toBe('');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('refresh → 调 fetchDir(current path) 即 fetchDir("") → 重新走 GraphQL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE))
      .mockResolvedValueOnce(mockJsonResponse(GRAPHQL_SHARES_RESPONSE));

    const { result } = renderHook(() => useShares(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // path='',refresh 调 fetchDir('') → 重新走 GraphQL getShares
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.path).toBe('');
    expect(result.current.items).toHaveLength(2); // photos + docs
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('paths.toFilesPath/toDavPath 工具', () => {
    const { result } = renderHook(() => useShares(), { wrapper });
    expect(result.current.paths.toFilesPath('photos/')).toMatch(/\/files\/user\/photos\/$/);
    expect(result.current.paths.toFilesPath('')).toMatch(/\/files\/user\/$/);
    expect(result.current.paths.toDavPath('photos/')).toMatch(/\/dav\/photos\/$/);
    expect(result.current.paths.toDavPath('')).toMatch(/\/dav\/$/);
  });
});
