// 【续 88 2026-08-08】FileRow 收藏星标测试
// 背景:收藏订阅从行内 useFavorites() 上提到父列表(Shares.tsx),FileRow 只收
// faved 布尔 + onToggleFavorite 回调。这里验证:
//   1. 目录行渲染星标,faved=true/false 切换 aria-label 与填充
//   2. 点击星标 → onToggleFavorite(item) 被调
//   3. 文件行不渲染星标(目录才可收藏)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FileRow from './FileRow';
import type { FileItem } from './davAuth';
import { __setLicenseStateForTest, __resetLicenseForTest } from '../../services/license';

// 与 textEditorEntry 测试相同:mock 掉与收藏无关的 hook
vi.mock('../../hooks/useShare', () => ({
  useShare: () => ({
    share: vi.fn(),
  }),
}));
vi.mock('../../hooks/useUnraidApi', () => ({
  useApiConfig: () => ({ config: null }),
}));

const noop = () => {};

const makeDir = (overrides: Partial<FileItem> = {}): FileItem => ({
  name: 'photos',
  path: 'photos/',
  isDir: true,
  size: undefined,
  mtime: 0,
  date: '',
  permissions: '',
  ...overrides,
});

const renderRow = (item: FileItem, faved: boolean, onToggleFavorite: (i: FileItem) => void) =>
  render(
    <MemoryRouter>
      <FileRow
        item={item}
        showActions
        onNavigate={noop}
        onDownload={noop}
        onRename={noop}
        onCopy={noop}
        onMove={noop}
        onDelete={noop}
        faved={faved}
        onToggleFavorite={onToggleFavorite}
      />
    </MemoryRouter>
  );

describe('FileRow — 收藏星标(props 下发)', () => {
  beforeEach(() => {
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
  });
  afterEach(() => {
    __resetLicenseForTest();
  });

  it('目录 + faved=false → 星标 aria-label "添加到收藏"', () => {
    renderRow(makeDir(), false, noop);
    expect(screen.getByRole('button', { name: '添加到收藏' })).toBeInTheDocument();
  });

  it('目录 + faved=true → 星标 aria-label "取消收藏"', () => {
    renderRow(makeDir(), true, noop);
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument();
  });

  it('点击星标 → onToggleFavorite(item) 被调,item 含 name+path', async () => {
    const onToggleFavorite = vi.fn();
    const dir = makeDir({ name: 'photos', path: 'photos/' });
    renderRow(dir, false, onToggleFavorite);
    await userEvent.click(screen.getByRole('button', { name: '添加到收藏' }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).toHaveBeenCalledWith(dir);
  });

  it('文件行 → 不渲染星标(目录才可收藏)', () => {
    renderRow(makeDir({ name: 'a.jpg', path: 'photos/a.jpg', isDir: false, size: 100 }), false, noop);
    expect(screen.queryByRole('button', { name: /收藏/ })).not.toBeInTheDocument();
  });
});
