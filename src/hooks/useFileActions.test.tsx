// 【阶段 1 P0 - 2026-06-17 续 29-1】useFileActions 单测
// 覆盖原 27.89% 的核心业务路径(WebDAV + toast + dialog 撤销):
//
//   handleCreateFolder:空名 return / MKCOL 成功 / MKCOL 405(已存在) / 失败 toast
//   handleRename:showRename null return / 同名 return / MOVE 成功 / 失败 toast
//                / 目录 MOVE 404 兜底(HEAD 检查 + DELETE)
//   handleMoveCopy:MOVE/COPY 成功 / 失败 toast / 目录 MOVE 404 兜底
//   handleDelete:dialog 取消 return / 成功弹"已删除 + 撤销" / 撤销触发 MOVE 回原路径
//                / 失败 toast / MOVE 失败兜底 DELETE
//   handleDownload:成功(创建 <a> + click)/ 失败 toast
//   handleBatchDelete:空 paths return / dialog 取消 / 全成功 toast + 撤销
//                     / 全失败 toast / 部分失败 warning / 撤销触发逐个 MOVE 回
//
// 关键 mock:
//   - useToast:spy 返回 mockToast,验证 toast.success / toast.error 调用
//   - dialog:通过 args 传入 mock(2026-07-19 起 dialog 由页面实例注入,不再 mock useDialog 模块)
//   - davFetch:spy 返回 { ok, status, text(), blob() },模拟 WebDAV response
//   - URL.createObjectURL / revokeObjectURL:jsdom 没原生,globalThis 补 mock
//   - fetchDir:传参里的 fn,验证被调用
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as useToastModule from './useToast';
import * as davAuth from '../components/shares/davAuth';
import { useFileActions, type UseFileActionsArgs } from './useFileActions';
import type { FileItem } from '../components/shares/davAuth';

type ToastApi = {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
};

let mockToast: ToastApi;
let mockDialog: { confirm: ReturnType<typeof vi.fn> };
let davFetchSpy: ReturnType<typeof vi.spyOn>;
let fetchDir: ReturnType<typeof vi.fn>;

const baseArgs = (): UseFileActionsArgs => ({
  path: '/share',
  paths: { toDavPath: (p: string) => (p.startsWith('/') ? p : '/' + p) },
  fetchDir,
  dialog: mockDialog as unknown as UseFileActionsArgs['dialog'],
});

const makeItem = (overrides: Partial<FileItem> = {}): FileItem => ({
  name: 'test.txt',
  path: '/share/test.txt',
  isDir: false,
  size: 100,
  mtime: 1000,
  date: '',
  permissions: '',
  ...overrides,
});

// 默认 davFetch response
const okResp = () => ({
  ok: true,
  status: 200,
  text: async () => '',
  blob: async () => new Blob(),
});
const failResp = (status = 500, body = 'server error') => ({
  ok: false,
  status,
  text: async () => body,
  blob: async () => new Blob(),
});

beforeEach(() => {
  mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  vi.spyOn(useToastModule, 'useToast').mockReturnValue(mockToast as unknown as ReturnType<typeof useToastModule.useToast>);
  mockDialog = { confirm: vi.fn() };
  davFetchSpy = vi.spyOn(davAuth, 'davFetch') as unknown as ReturnType<typeof vi.fn>;
  fetchDir = vi.fn().mockResolvedValue(undefined);
  // jsdom 没原生 URL.createObjectURL,补 mock
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake') as unknown as typeof URL.createObjectURL;
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFileActions / handleCreateFolder', () => {
  it('newFolderName 为空 → 直接 return,不发请求', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
    expect(fetchDir).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('MKCOL 200 成功 → 清空 newFolderName + fetchDir', async () => {
    davFetchSpy.mockResolvedValueOnce(okResp());
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openNewFolder();
    });
    act(() => {
      result.current.setNewFolderName('newdir');
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(davFetchSpy).toHaveBeenCalledWith('/share/newdir/', { method: 'MKCOL' });
    // 成功后清空表单 + 关闭弹窗
    expect(result.current.showNewFolder).toBe(false);
    expect(result.current.newFolderName).toBe('');
    expect(fetchDir).toHaveBeenCalledWith('/share');
  });

  it('MKCOL 405(Method Not Allowed = 已存在)→ 视作成功', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(405, ''));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.setNewFolderName('exists');
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    // 405 路径走的是 !response.ok && response.status !== 405 → 不抛
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(fetchDir).toHaveBeenCalled();
  });

  it('MKCOL 500 失败 → toast.error', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(500, 'server error'));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.setNewFolderName('broken');
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(mockToast.error).toHaveBeenCalledWith('创建失败: server error');
    expect(fetchDir).not.toHaveBeenCalled();
  });
});

describe('useFileActions / handleRename', () => {
  it('showRename 为 null → 直接 return', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleRename();
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
  });

  it('新名字跟原名相同 → setShowRename(null) return', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openRename(makeItem({ name: 'same.txt' }));
    });
    await act(async () => {
      await result.current.handleRename();
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
    expect(result.current.showRename).toBeNull();
  });

  it('MOVE 204 成功 → setShowRename(null) + fetchDir', async () => {
    davFetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => '',
      blob: async () => new Blob(),
    });
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openRename(makeItem());
    });
    act(() => {
      result.current.setRenameName('renamed.txt');
    });
    await act(async () => {
      await result.current.handleRename();
    });
    expect(davFetchSpy).toHaveBeenCalledWith(
      '/share/test.txt',
      expect.objectContaining({ method: 'MOVE' })
    );
    expect(result.current.showRename).toBeNull();
    expect(fetchDir).toHaveBeenCalled();
  });

  it('MOVE 失败 → toast.error', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(403, 'forbidden'));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openRename(makeItem());
    });
    act(() => {
      result.current.setRenameName('renamed.txt');
    });
    await act(async () => {
      await result.current.handleRename();
    });
    expect(mockToast.error).toHaveBeenCalledWith('重命名失败: forbidden');
  });

  it('目录 MOVE 404 兜底:HEAD 检查成功 + DELETE 清理', async () => {
    // 第一次 MOVE 返 404,HEAD 返 200,DELETE 返 204
    davFetchSpy
      .mockResolvedValueOnce(failResp(404))
      .mockResolvedValueOnce(okResp()) // HEAD
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
        blob: async () => new Blob(),
      }); // DELETE
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openRename(makeItem({ name: 'mydir', isDir: true }));
    });
    act(() => {
      result.current.setRenameName('mydir2');
    });
    await act(async () => {
      await result.current.handleRename();
    });
    // 三次 davFetch 调用:MOVE → HEAD → DELETE
    expect(davFetchSpy).toHaveBeenCalledTimes(3);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(result.current.showRename).toBeNull();
  });
});

describe('useFileActions / handleMoveCopy', () => {
  it('showMoveCopy 为 null → return', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleMoveCopy();
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
  });

  it('dest 为空 → return', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openMove(makeItem());
    });
    await act(async () => {
      await result.current.handleMoveCopy();
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
  });

  it('COPY 成功 → setShowMoveCopy(null) + fetchDir', async () => {
    davFetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () => '',
      blob: async () => new Blob(),
    });
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openCopy(makeItem());
    });
    act(() => {
      result.current.setMoveCopyDest('sub');
    });
    await act(async () => {
      await result.current.handleMoveCopy();
    });
    expect(davFetchSpy).toHaveBeenCalledWith(
      '/share/test.txt',
      expect.objectContaining({ method: 'COPY' })
    );
    expect(fetchDir).toHaveBeenCalled();
    expect(result.current.showMoveCopy).toBeNull();
  });

  it('MOVE 失败 → toast.error 用 移动 文案', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(500, 'disk full'));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openMove(makeItem());
    });
    act(() => {
      result.current.setMoveCopyDest('elsewhere');
    });
    await act(async () => {
      await result.current.handleMoveCopy();
    });
    expect(mockToast.error).toHaveBeenCalledWith('移动失败: disk full');
  });

  it('COPY 失败 → toast.error 用 拷贝 文案', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(500, 'perm denied'));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openCopy(makeItem());
    });
    act(() => {
      result.current.setMoveCopyDest('elsewhere');
    });
    await act(async () => {
      await result.current.handleMoveCopy();
    });
    expect(mockToast.error).toHaveBeenCalledWith('拷贝失败: perm denied');
  });
});

describe('useFileActions / handleDelete', () => {
  it('dialog 取消 → return,不发请求', async () => {
    mockDialog.confirm.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDelete(makeItem());
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('确认 → MKCOL(.trash) + MOVE 到 trash + toast.success 带撤销', async () => {
    // MKCOL .trash(忽略) → MOVE(成功)
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }); // MOVE
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDelete(makeItem());
    });

    expect(mockDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: '删除', danger: true })
    );
    expect(davFetchSpy).toHaveBeenCalledTimes(2);
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    // 第二个参数是 5000,第三个是 { label, onClick }
    const [msg, duration, action] = mockToast.success.mock.calls[0];
    expect(msg).toMatch(/^已删除 test\.txt$/);
    expect(duration).toBe(5000);
    expect(action?.label).toBe('撤销');
    // 撤销 onClick 触发 → MOVE 回原路径
    davFetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () => '',
      blob: async () => new Blob(),
    });
    await act(async () => {
      await action!.onClick();
    });
    expect(mockToast.success).toHaveBeenCalledWith('已恢复 test.txt');
  });

  it('MOVE 失败兜底真 DELETE', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce(failResp(500)) // MOVE fail
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
        blob: async () => new Blob(),
      }); // fallback DELETE ok
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDelete(makeItem());
    });

    expect(davFetchSpy).toHaveBeenCalledTimes(3);
    // 最后一次调用是 DELETE
    const lastCall = davFetchSpy.mock.calls[davFetchSpy.mock.calls.length - 1];
    expect(lastCall[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    // 兜底成功后仍弹 已删除 toast
    expect(mockToast.success).toHaveBeenCalledTimes(1);
  });

  it('兜底 DELETE 也失败 → toast.error', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce(failResp(500)) // MOVE fail
      .mockResolvedValueOnce(failResp(403, 'readonly')); // fallback DELETE fail
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDelete(makeItem());
    });

    expect(mockToast.error).toHaveBeenCalledWith('删除失败: readonly');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('撤销失败 → toast.error 恢复失败', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }); // MOVE
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDelete(makeItem());
    });

    const action = mockToast.success.mock.calls[0][2];
    davFetchSpy.mockResolvedValueOnce(failResp(500, 'restore fail'));
    await act(async () => {
      await action!.onClick();
    });
    expect(mockToast.error).toHaveBeenCalledWith('恢复失败: restore fail');
  });
});

describe('useFileActions / handleDownload', () => {
  it('下载成功 → 创建 <a> 并 click', async () => {
    // 用真 anchor + spyOn click,避免直接 mock 创建逻辑
    const fakeAnchor = document.createElement('a');
    const clickSpy = vi.spyOn(fakeAnchor, 'click');
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    davFetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '',
      blob: async () => new Blob(['data']),
    });
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDownload(makeItem());
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('response.ok=false → throw Download failed', async () => {
    davFetchSpy.mockResolvedValueOnce(failResp(404));
    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleDownload(makeItem());
    });
    expect(mockToast.error).toHaveBeenCalledWith('下载失败: Download failed');
  });
});

describe('useFileActions / handleBatchDelete', () => {
  it('selectedPaths 空 → return', async () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    const onDone = vi.fn();
    await act(async () => {
      await result.current.handleBatchDelete(new Set(), onDone);
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('dialog 取消 → return,onDone 也不调', async () => {
    mockDialog.confirm.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useFileActions(baseArgs()));
    const onDone = vi.fn();
    await act(async () => {
      await result.current.handleBatchDelete(new Set(['/share/a.txt']), onDone);
    });
    expect(davFetchSpy).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('全成功 → toast.success + 带撤销', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL .trash
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MOVE a.txt
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }); // MOVE b.txt
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    const onDone = vi.fn();
    const paths = new Set(['/share/a.txt', '/share/b.txt']);
    await act(async () => {
      await result.current.handleBatchDelete(paths, onDone);
    });

    // 1 次 MKCOL + 2 次 MOVE = 3 次
    expect(davFetchSpy).toHaveBeenCalledTimes(3);
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    const [msg, duration, action] = mockToast.success.mock.calls[0];
    expect(msg).toMatch(/^批量删除 2 项\(在 \.trash\/\)$/);
    expect(duration).toBe(5000);
    expect(action?.label).toBe('撤销');
    expect(onDone).toHaveBeenCalled();
    expect(fetchDir).toHaveBeenCalled();

    // 撤销:逐个 MOVE 回原路径
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      });
    await act(async () => {
      await action!.onClick();
    });
    expect(mockToast.success).toHaveBeenCalledWith('已恢复 2 项');
  });

  it('全部失败 → toast.error 全部失败 (N 项)', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce(failResp(500)) // MOVE fail
      .mockResolvedValueOnce(failResp(500)) // fallback DELETE fail
      .mockResolvedValueOnce(failResp(500))
      .mockResolvedValueOnce(failResp(500));
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    const paths = new Set(['/share/a.txt', '/share/b.txt']);
    await act(async () => {
      await result.current.handleBatchDelete(paths, vi.fn());
    });

    expect(mockToast.error).toHaveBeenCalledWith('批量删除全部失败 (2 项)');
  });

  it('部分成功部分失败 → toast.warning 成功 N, 失败 N', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // a.txt MOVE ok
      .mockResolvedValueOnce(failResp(500)) // b.txt MOVE fail
      .mockResolvedValueOnce(failResp(500)); // b.txt fallback DELETE fail
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    const paths = new Set(['/share/a.txt', '/share/b.txt']);
    await act(async () => {
      await result.current.handleBatchDelete(paths, vi.fn());
    });

    expect(mockToast.warning).toHaveBeenCalledWith('批量删除完成: 成功 1, 失败 1');
  });

  it('撤销全部失败 → toast.error 恢复失败', async () => {
    davFetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }) // MKCOL
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => '',
        blob: async () => new Blob(),
      }); // MOVE
    mockDialog.confirm.mockResolvedValueOnce(true);

    const { result } = renderHook(() => useFileActions(baseArgs()));
    await act(async () => {
      await result.current.handleBatchDelete(new Set(['/share/a.txt']), vi.fn());
    });

    const action = mockToast.success.mock.calls[0][2];
    // 撤销时 MOVE 失败
    davFetchSpy.mockResolvedValueOnce(failResp(500));
    await act(async () => {
      await action!.onClick();
    });
    expect(mockToast.error).toHaveBeenCalledWith('恢复失败');
  });
});

describe('useFileActions / openers', () => {
  it('openNewFolder / closeNewFolder / setNewFolderName', () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openNewFolder();
    });
    expect(result.current.showNewFolder).toBe(true);
    act(() => {
      result.current.setNewFolderName('foo');
    });
    expect(result.current.newFolderName).toBe('foo');
    act(() => {
      result.current.closeNewFolder();
    });
    expect(result.current.showNewFolder).toBe(false);
  });

  it('openRename 预填 newName', () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openRename(makeItem({ name: 'orig.txt' }));
    });
    expect(result.current.showRename).toEqual({
      item: expect.objectContaining({ name: 'orig.txt' }),
      newName: 'orig.txt',
    });
  });

  it('openCopy / openMove 区分 mode', () => {
    const { result } = renderHook(() => useFileActions(baseArgs()));
    act(() => {
      result.current.openCopy(makeItem());
    });
    expect(result.current.showMoveCopy?.mode).toBe('copy');
    act(() => {
      result.current.closeMoveCopy();
    });
    act(() => {
      result.current.openMove(makeItem());
    });
    expect(result.current.showMoveCopy?.mode).toBe('move');
  });
});
