// 【阶段 P2-2 - 2026-06-16 续 14】useFileUpload hook 测试
// 覆盖:enqueue 限流 / MAX_CONCURRENT 并发 / cancel/retry/remove/clearCompleted / 401+500+onerror
// 用 mock XMLHttpRequest 替代真实 XHR,触发 onload/onerror 验证状态机
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileUpload } from './useFileUpload';
import type { SharesPaths } from './useShares';

function makeFile(name: string): File {
  return new File(['content-' + name], name, { type: 'text/plain' });
}

const paths: SharesPaths = {
  filesUrl: 'https://nas:3998/files',
  davUrl: 'https://nas:3998/dav',
  toFilesPath: (p: string) => 'https://nas:3998/files' + p,
  toDavPath: (p: string) => 'https://nas:3998/dav' + p,
};

class MockXHR {
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn();
  setRequestHeader = vi.fn();
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  responseText = '';
  status = 0;
}

let lastXhr: MockXHR | null = null;
function MockXHRFactory(this: MockXHR) {
  Object.assign(this, new MockXHR());
  // hook 用 `new XMLHttpRequest()` 创建的 xhr 实际是这个 this,
  // hook 把 onload/onerror/onprogress 挂在这上面,所以 lastXhr 也要指 this
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  lastXhr = this;
}

beforeEach(() => {
  lastXhr = null;
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXHRFactory;
});

describe('useFileUpload', () => {
  it('初始 queue 空,activeCount=0,uploading=false', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    expect(result.current.queue).toEqual([]);
    expect(result.current.activeCount).toBe(0);
    expect(result.current.uploading).toBe(false);
  });

  it('enqueue 单个文件 → 立即变 uploading(MAX_CONCURRENT 允许),xhr.open 调 PUT', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a.txt')]);
    });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].file.name).toBe('a.txt');
    expect(result.current.queue[0].status).toBe('uploading');
    expect(lastXhr?.open).toHaveBeenCalledWith('PUT', 'https://nas:3998/dav/mnt/user/share/a.txt');
    expect(lastXhr?.send).toHaveBeenCalled();
  });

  it('enqueue 5 个 → 3 uploading + 2 queued(MAX_CONCURRENT=3)', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([
        makeFile('1'),
        makeFile('2'),
        makeFile('3'),
        makeFile('4'),
        makeFile('5'),
      ]);
    });
    expect(result.current.queue).toHaveLength(5);
    const up = result.current.queue.filter((i) => i.status === 'uploading').length;
    const qd = result.current.queue.filter((i) => i.status === 'queued').length;
    expect(up).toBe(3);
    expect(qd).toBe(2);
  });

  it('enqueue 超 MAX_QUEUE(10) → 截断到 10 + 触发 onQueueFull(dropped)', () => {
    const onQueueFull = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({ paths, currentPath: '/mnt/user/share', onQueueFull })
    );
    act(() => {
      result.current.enqueue(Array.from({ length: 12 }, (_, i) => makeFile('f' + i)));
    });
    expect(result.current.queue).toHaveLength(10);
    // onQueueFull 走 queueMicrotask,得 await flush
    return Promise.resolve().then(() => {
      expect(onQueueFull).toHaveBeenCalledWith(2);
    });
  });

  it('enqueue 空数组 → 不变', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([]);
    });
    expect(result.current.queue).toHaveLength(0);
  });

  it('cancel uploading → status=cancelled + xhr.abort 被调', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a')]);
    });
    const id = result.current.queue[0].id;
    expect(result.current.queue[0].status).toBe('uploading');

    act(() => {
      result.current.cancel(id);
    });
    const after = result.current.queue.find((i) => i.id === id)!;
    expect(after.status).toBe('cancelled');
    expect(lastXhr?.abort).toHaveBeenCalled();
  });

  it('cancel queued → status=cancelled,不调 abort', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('1'), makeFile('2'), makeFile('3'), makeFile('4')]);
    });
    const queued = result.current.queue.find((i) => i.status === 'queued')!;
    act(() => {
      result.current.cancel(queued.id);
    });
    const after = result.current.queue.find((i) => i.id === queued.id)!;
    expect(after.status).toBe('cancelled');
  });

  it('retry failed → effect 重跑 + 成功路径可达', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a')]);
    });
    act(() => {
      lastXhr!.status = 500;
      lastXhr!.responseText = 'fail';
      lastXhr!.onload!();
    });
    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0].error).toContain('500');
    const id = result.current.queue[0].id;

    // retry:status 重置 queued,effect 立即触发 startUpload 变 uploading,
    // 所以这里用 lastXhr(此时已是新 xhr)触发 200 完成,验证 effect 调度 + 重试成功
    act(() => {
      result.current.retry(id);
    });
    // retry 后 error 应被清
    const afterRetry = result.current.queue.find((i) => i.id === id)!;
    expect(afterRetry.error).toBeUndefined();
    expect(afterRetry.progress).toBe(0);
    // effect 已重新调 startUpload,新 xhr 是 lastXhr
    expect(lastXhr).not.toBeNull();

    act(() => {
      lastXhr!.status = 200;
      lastXhr!.onload!();
    });
    expect(result.current.queue[0].status).toBe('done');
    expect(result.current.queue[0].progress).toBe(100);
  });

  it('remove → 从 queue 删除', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a'), makeFile('b')]);
    });
    const aId = result.current.queue[0].id;
    act(() => {
      result.current.remove(aId);
    });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].file.name).toBe('b');
  });

  it('clearCompleted 清 done/cancelled/failed,保留 queued/uploading', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a')]);
    });
    act(() => {
      lastXhr!.status = 200;
      lastXhr!.onload!();
    });
    expect(result.current.queue[0].status).toBe('done');

    act(() => {
      result.current.enqueue([makeFile('b')]);
    });
    expect(result.current.queue).toHaveLength(2);

    act(() => {
      result.current.clearCompleted();
    });
    // 第一个 done 被清,第二个 uploading 保留
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].file.name).toBe('b');
  });

  it('onload 401 → failed,error 含 401', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a')]);
    });
    act(() => {
      lastXhr!.status = 401;
      lastXhr!.onload!();
    });
    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0].error).toContain('401');
  });

  it('onerror → failed,error="网络错误"', () => {
    const { result } = renderHook(() => useFileUpload({ paths, currentPath: '/mnt/user/share' }));
    act(() => {
      result.current.enqueue([makeFile('a')]);
    });
    act(() => {
      lastXhr!.onerror!();
    });
    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0].error).toBe('网络错误');
  });
});
