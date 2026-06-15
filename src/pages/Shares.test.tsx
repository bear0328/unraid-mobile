// 【阶段 P2-12 - 2026-06-17 续 28-4】Shares 页面集成测试
// 覆盖:根目录显示 share 列表 / 子目录显示文件 + 工具栏 / 搜索 debounce / 批量选择 / 模态打开
// 关键:mock 3 个 hook(useShares/useFileUpload/useDialog) 完全控制输入
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

// mock hooks - 返回持久化数据 + 操作桩
const mockUseShares = vi.fn();
const mockUseFileUpload = vi.fn();
vi.mock('../hooks/useShares', () => ({ useShares: () => mockUseShares() }));
vi.mock('../hooks/useFileUpload', () => ({ useFileUpload: () => mockUseFileUpload() }));

// 静态 mock useDialog(返静态对象避免真实 setState 触发的 re-render)
vi.mock('../hooks/useDialog', () => ({
  useDialog: () => ({
    state: null,
    confirm: vi.fn().mockResolvedValue(true),
    alert: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

import type { FileItem } from '../components/shares/davAuth';
import { MemoryRouter } from 'react-router-dom';
import Shares from './Shares';
// 【续 55 商业化】Shares 用了 useNavigate(写操作 🔒 跳设置);测试置 pro 态恢复原断言
import { __setLicenseStateForTest, __resetLicenseForTest } from '../services/license';

const renderShares = () =>
  render(
    <MemoryRouter>
      <Shares />
    </MemoryRouter>
  );

const SHARES_LIST: FileItem[] = [
  {
    name: 'photos',
    path: 'photos/',
    isDir: true,
    size: undefined,
    mtime: 0,
    date: '',
    permissions: '',
  },
  {
    name: 'docs',
    path: 'docs/',
    isDir: true,
    size: undefined,
    mtime: 0,
    date: '',
    permissions: '',
  },
];

const PHOTOS_FILES: FileItem[] = [
  {
    name: 'bear.jpg',
    path: 'photos/bear.jpg',
    isDir: false,
    size: 1.2 * 1024 * 1024,
    mtime: 0,
    date: 'Jun 15',
    permissions: '',
  },
  {
    name: 'cat.png',
    path: 'photos/cat.png',
    isDir: false,
    size: 500 * 1024,
    mtime: 0,
    date: 'Jun 16',
    permissions: '',
  },
  {
    name: 'subdir',
    path: 'photos/subdir/',
    isDir: true,
    size: undefined,
    mtime: 0,
    date: '',
    permissions: '',
  },
];

const PATHS = {
  filesUrl: 'http://localhost/files/user',
  davUrl: 'http://localhost/dav',
  toFilesPath: (p: string) => `http://localhost/files/user${p ? '/' + p : ''}`,
  toDavPath: (p: string) => `http://localhost/dav${p ? '/' + p : ''}`,
};

describe('Shares 页面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 【续 55 商业化】默认 pro 态(上传/新建/清理/写操作菜单均已解锁),门控用例内再置回 none
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
    // 持久化默认:根目录 + share 列表
    mockUseShares.mockReturnValue({
      path: '',
      items: SHARES_LIST,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    mockUseFileUpload.mockReturnValue({
      queue: [],
      enqueue: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      remove: vi.fn(),
      clearCompleted: vi.fn(),
    });
  });

  afterEach(() => {
    __resetLicenseForTest();
  });

  it('根目录 + 有 share → 显示 share 列表 + 工具栏只有 "刷新 / 清理"(无上传/新建/选择)', () => {
    renderShares();
    expect(screen.getByText('文件管理')).toBeInTheDocument();
    expect(screen.getByText('photos')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();
    // 根目录不能上传/新建/选择(FileToolbar 的 inRoot=path!=='' 选择按钮只在子目录)
    expect(screen.queryByRole('button', { name: /上传/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新建文件夹/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /选择/ })).not.toBeInTheDocument();
    // 根目录有刷新 + 清理
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /清理/ })).toBeInTheDocument();
  });

  it('根目录 + 空 → 提示"操作只能在共享内部进行"', () => {
    mockUseShares.mockReturnValue({
      path: '',
      items: [],
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    expect(screen.getByText(/操作只能在共享内部进行/)).toBeInTheDocument();
  });

  it('子目录 + 有文件 → 显示文件列表 + "上传/新建文件夹/选择" 按钮', () => {
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    expect(screen.getByText('bear.jpg')).toBeInTheDocument();
    expect(screen.getByText('cat.png')).toBeInTheDocument();
    // 子目录才有 "上传" / "新建文件夹"
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建文件夹/ })).toBeInTheDocument();
    // 上一级按钮
    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('点击"新建文件夹" → 打开 NewFolderModal', async () => {
    const user: UserEvent = userEvent.setup();
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    await user.click(screen.getByRole('button', { name: /新建文件夹/ }));
    // 模态打开:input 出现
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/文件夹名/)).toBeInTheDocument();
    });
  });

  it('点击"选择" → 进入批量模式 + 显示"已选 0 / N"和"批量删除"按钮', async () => {
    const user: UserEvent = userEvent.setup();
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    await user.click(screen.getByRole('button', { name: /选择/ }));
    expect(screen.getByText(/已选 0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /批量删除/ })).toBeInTheDocument();
  });

  it('输入搜索关键字 → debounce 300ms 后匹配数显示', async () => {
    const user: UserEvent = userEvent.setup();
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    const searchInput = screen.getByPlaceholderText('🔍 搜索文件名...');
    await user.type(searchInput, 'bear');
    // debounce 300ms 后才显示
    await waitFor(
      () => {
        expect(screen.getByText(/匹配 \d+ \/ \d+ 项/)).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it('搜索无结果 → 显示 "无匹配" 和 "清空" 按钮', async () => {
    const user: UserEvent = userEvent.setup();
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    const searchInput = screen.getByPlaceholderText('🔍 搜索文件名...');
    await user.type(searchInput, 'nonexistent-zzz');
    await waitFor(
      () => {
        expect(screen.getByText(/无匹配/)).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it('loading=true → 显示骨架屏 (不渲染文件列表)', () => {
    mockUseShares.mockReturnValue({
      path: '',
      items: [],
      loading: true,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    const { container } = renderShares();
    // 骨架屏用 animate-pulse 标识
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('error → 显示 FileListError 错误提示 + 重试按钮', () => {
    mockUseShares.mockReturnValue({
      path: '',
      items: [],
      loading: false,
      error: '无法连接服务器',
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    expect(screen.getByText(/无法连接服务器/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });

  it('子目录空 → 显示 "空目录" 提示 (EmptyFolder)', () => {
    // items=[]:真 autoindex 不含 `..`(parseAutoindexHtml 跳过),Shares.tsx 自己渲染上级按钮
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: [],
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    // EmptyFolder 渲染 `📂` + `空目录` 两 p,用 /空目录/ 匹配叶子 p
    expect(
      screen.getByText((_, node) => node?.children?.length === 0 && !!node?.textContent?.includes('空目录'))
    ).toBeInTheDocument();
  });

  // ==== 续 55 商业化:Shares 写操作 → Pro ====
  it('未解锁 → 上传/新建文件夹/清理换 🔒 占位按钮,文件行菜单写操作带 🔒(下载保持免费)', async () => {
    __setLicenseStateForTest({ status: 'none' });
    const user: UserEvent = userEvent.setup();
    mockUseShares.mockReturnValue({
      path: 'photos/',
      items: PHOTOS_FILES,
      loading: false,
      error: null,
      paths: PATHS,
      fetchDir: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
      navigateUp: vi.fn(),
    });
    renderShares();
    // 工具条:🔒 占位(ProGateButton 渲染 "🔒 <label>"),点击不打开上传队列/新建模态
    expect(screen.getByRole('button', { name: /🔒 上传/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🔒 新建文件夹/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🔒 清理/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /🔒 新建文件夹/ }));
    expect(screen.queryByPlaceholderText(/文件夹名/)).not.toBeInTheDocument();
    // 文件行 ⋮ 菜单:下载免费,删除带 🔒
    const menuTriggers = screen.getAllByRole('button', { name: '更多操作' });
    await user.click(menuTriggers[0]);
    expect(screen.getByRole('menuitem', { name: '下载' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /🔒 删除/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /🔒 重命名/ })).toBeInTheDocument();
  });
});
