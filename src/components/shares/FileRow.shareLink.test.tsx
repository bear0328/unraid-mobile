// 【续 103 P1-5】FileRow 分享链接编码测试
// 背景:item.path 是原始态(续 103 统一),分享链接经 encodeDavPath 编码一次;
// 原实现对 autoindex 预编码路径再 map(encodeURIComponent) → 双重编码,中文名链接 404
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FileRow from './FileRow';
import type { FileItem } from './davAuth';
import { __setLicenseStateForTest, __resetLicenseForTest } from '../../services/license';

const shareSpy = vi.fn();
vi.mock('../../hooks/useShare', () => ({
  useShare: () => ({
    share: shareSpy,
  }),
}));
vi.mock('../../hooks/useUnraidApi', () => ({
  useApiConfig: () => ({ config: { baseUrl: 'https://nas.example.com:16666' } }),
}));

const noop = () => {};

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  name: '中文 报告#2.pdf',
  path: 'photos/中文 报告#2.pdf',
  isDir: false,
  size: 100,
  mtime: 0,
  date: '',
  permissions: '',
  ...overrides,
});

const renderRow = (item: FileItem) =>
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
        faved={false}
        onToggleFavorite={noop}
      />
    </MemoryRouter>
  );

describe('FileRow — 分享链接(续 103 P1-5)', () => {
  beforeEach(() => {
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
    shareSpy.mockClear();
  });
  afterEach(() => {
    __resetLicenseForTest();
  });

  it('中文/特殊字符文件名 → 链接编码一次(无双重编码)', async () => {
    renderRow(makeFile());
    await userEvent.click(screen.getByRole('button', { name: '更多操作' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /分享链接/ }));
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const url = shareSpy.mock.calls[0][0].url as string;
    expect(url).toBe(
      'https://nas.example.com:16666/dav/photos/%E4%B8%AD%E6%96%87%20%E6%8A%A5%E5%91%8A%232.pdf'
    );
    // 双重编码会出现 %25,不允许
    expect(url).not.toContain('%25');
  });

  it('纯 ASCII 文件名 → 链接原样拼接', async () => {
    renderRow(makeFile({ name: 'a.jpg', path: 'photos/a.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: '更多操作' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /分享链接/ }));
    expect(shareSpy.mock.calls[0][0].url).toBe('https://nas.example.com:16666/dav/photos/a.jpg');
  });
});
