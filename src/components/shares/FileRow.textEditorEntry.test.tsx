// 【续 44.1 2026-06-25】TextFileEditor 入口验证
// 背景:Hermes 端验不了(Shares 页 polling 卡 30s + delegated handler 抓不到,见 hermes-bot-constraints.md)
// 改用 vitest 单元测试,覆盖 FileRow 渲染 编辑 入口 + 点击 → onEdit 链路
// 【2026-07-19 更新】操作按钮收进 ActionMenu ⋮ 菜单:
//   先点 "更多操作" trigger 展开菜单,再断言/点击 "编辑" menuitem
// 验证点:
//   1. 文本文件(.txt/.md/.json/.conf)→ 菜单里有 编辑
//   2. 非文本文件(.png/.iso)        → 菜单里没 编辑
//   3. 目录                          → 菜单里没 编辑
//   4. 点击 编辑 → onEdit(item) 被调,item 含 name+path
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FileRow from './FileRow';
import type { FileItem } from './davAuth';
// 【续 55 商业化】FileRow 用了 useNavigate(🔒 菜单项跳设置);pro 态恢复"编辑"原入口
import { __setLicenseStateForTest, __resetLicenseForTest } from '../../services/license';

// FileRow 用到 3 个 hook,先 mock 掉(避免触发真 LS / 真 fetch)
vi.mock('../../hooks/useFavorites', () => ({
  useFavorites: () => ({
    toggle: vi.fn(),
    isFavorite: () => false,
  }),
}));
vi.mock('../../hooks/useShare', () => ({
  useShare: () => ({
    share: vi.fn(),
  }),
}));
vi.mock('../../hooks/useUnraidApi', () => ({
  useApiConfig: () => ({ config: null }),
}));

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  name: 'test.txt',
  path: '/share/test.txt',
  isDir: false,
  size: 1024,
  mtime: 0,
  date: '',
  permissions: '',
  ...overrides,
});

const noop = () => {};

const renderRow = (file: FileItem, onEdit: (item: FileItem) => void) =>
  render(
    <MemoryRouter>
      <FileRow
        item={file}
        showActions
        onNavigate={noop}
        onDownload={noop}
        onRename={noop}
        onCopy={noop}
        onMove={noop}
        onDelete={noop}
        onEdit={onEdit}
      />
    </MemoryRouter>
  );

// 展开 ⋮ 菜单(ActionMenu:点 trigger 后 menuitem 才渲染)
const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: '更多操作' }));
};

describe('FileRow — TextFileEditor 入口', () => {
  // 【续 55 商业化】编辑 → Pro;本组用例全部默认 pro 态(验入口链路),门控由 Shares.test 覆盖
  beforeEach(() => {
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
  });
  afterEach(() => {
    __resetLicenseForTest();
  });

  it('文本文件 .txt → 菜单有 编辑,点击触发 onEdit(item)', async () => {
    const onEdit = vi.fn();
    const file = makeFile({ name: 'notes.txt', path: '/share/notes.txt' });
    renderRow(file, onEdit);
    await openMenu();
    const editItem = screen.getByRole('menuitem', { name: '编辑' });
    expect(editItem).toBeInTheDocument();

    await userEvent.click(editItem);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(file);
  });

  it('文本文件 .md → 菜单有 编辑', async () => {
    renderRow(makeFile({ name: 'README.md' }), vi.fn());
    await openMenu();
    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeInTheDocument();
  });

  it('文本文件 .json → 菜单有 编辑', async () => {
    renderRow(makeFile({ name: 'config.json' }), vi.fn());
    await openMenu();
    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeInTheDocument();
  });

  it('文本文件 .conf → 菜单有 编辑(常见 nginx config 格式)', async () => {
    renderRow(makeFile({ name: 'nginx.conf' }), vi.fn());
    await openMenu();
    expect(screen.getByRole('menuitem', { name: '编辑' })).toBeInTheDocument();
  });

  it('非文本文件 .png → 菜单没 编辑', async () => {
    renderRow(makeFile({ name: 'photo.png', size: 500_000 }), vi.fn());
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('非文本文件 .iso → 菜单没 编辑', async () => {
    renderRow(makeFile({ name: 'install.iso', size: 4_000_000_000 }), vi.fn());
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('目录 → 菜单没 编辑(目录不编辑)', async () => {
    renderRow(makeFile({ name: 'photos', path: '/share/photos/', isDir: true, size: undefined }), vi.fn());
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: '编辑' })).not.toBeInTheDocument();
  });
});
