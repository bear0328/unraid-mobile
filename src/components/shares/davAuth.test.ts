// 【续 103 P1-4】davFetch timeoutMs 参数测试
// 默认 15s 不变;大文件场景传 120s;AbortError/TimeoutError 映射为友好超时文案
import { describe, it, expect, vi, afterEach } from 'vitest';
import { davFetch } from './davAuth';

describe('davFetch / timeoutMs(续 103)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认 15s 超时', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await davFetch('http://x/dav/a.txt');
    expect(timeoutSpy).toHaveBeenCalledWith(15_000);
  });

  it('自定义 120s(大文件下载/预览场景)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await davFetch('http://x/dav/big.bin', {}, 120_000);
    expect(timeoutSpy).toHaveBeenCalledWith(120_000);
  });

  it('timeoutMs=0 → 不加超时信号', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    await davFetch('http://x/dav/a.txt', {}, 0);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it('TimeoutError → 友好超时文案(含实际秒数)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('t'), { name: 'TimeoutError' })
    );
    await expect(davFetch('http://x/dav/a.txt', {}, 120_000)).rejects.toThrow(
      'WebDAV 请求超时 (120s)'
    );
  });
});
