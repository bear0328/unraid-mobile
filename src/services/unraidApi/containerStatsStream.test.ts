// 【续 88 2026-08-08】containerStatsStream 生命周期/重连测试
// 覆盖:①retryWait 退避封顶 30s(原来用 graphql-ws 默认 2^n s 无上限,
// 服务端宕机约 1 小时后重连间隔膨胀到小时级,stats 静默死亡)
// ②切服务器(clearServerScopedCaches 路径)自动 stop 旧订阅流(原来无人调 stop,旧流常驻)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startContainerStatsStream,
  stopContainerStatsStream,
  __setClientFactoryForTest,
  __resetStatsStreamForTest,
} from './containerStatsStream';
import { setActiveServer } from './config';
import type { createClient } from 'graphql-ws';

type ClientOptions = Parameters<typeof createClient>[0];

// graphql-ws 假 client:iterate 返回永不产出的 async iterable(避免 jsdom 真连 ws)
function makeFakeFactory() {
  const clients: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  const factory = vi.fn((_opts: ClientOptions) => {
    const c = {
      iterate: () => ({
        [Symbol.asyncIterator]() {
          return { next: () => new Promise(() => {}) };
        },
      }),
      dispose: vi.fn(),
    };
    clients.push(c);
    return c;
  });
  return { factory, clients };
}

describe('containerStatsStream(续 88)', () => {
  beforeEach(() => {
    __resetStatsStreamForTest();
  });

  afterEach(() => {
    __resetStatsStreamForTest();
    vi.useRealTimers();
  });

  describe('retryWait 退避封顶 30s', () => {
    it('retries 很大时退避被封顶到 30s(默认实现会膨胀到 2^n 秒)', async () => {
      vi.useFakeTimers();
      const { factory } = makeFakeFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      startContainerStatsStream('http://nas', 'k', false);
      const opts = factory.mock.calls[0]?.[0];
      expect(opts?.retryAttempts).toBe(Infinity);
      expect(typeof opts?.retryWait).toBe('function');

      // 2^10 = 1024s,封顶后应 30s 就 resolve
      let resolved = false;
      void opts!.retryWait!(10).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    });

    it('retries 小时仍按指数退避(2^1 = 2s)', async () => {
      vi.useFakeTimers();
      const { factory } = makeFakeFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      startContainerStatsStream('http://nas', 'k', false);
      const opts = factory.mock.calls[0]?.[0];

      let resolved = false;
      void opts!.retryWait!(1).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    });
  });

  describe('切服务器自动停止旧订阅流', () => {
    it('setActiveServer 切服务器 → 旧 client dispose,同配置再 start 会重建', () => {
      const { factory, clients } = makeFakeFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      startContainerStatsStream('http://a', 'k', false);
      expect(factory).toHaveBeenCalledTimes(1);

      // 构造两台服务器并切到第二台(内部走 clearServerScopedCaches)
      localStorage.setItem(
        'unraid-mobile-servers',
        JSON.stringify([
          { id: 'srv-a', name: 'A', serverUrl: 'http://a' },
          { id: 'srv-b', name: 'B', serverUrl: 'http://b' },
        ])
      );
      localStorage.setItem('unraid-mobile-active-server', 'srv-a');
      setActiveServer('srv-b');

      // 旧流被停:dispose 调了,startedKey 清空 → 同 key 再 start 会新建 client
      expect(clients[0].dispose).toHaveBeenCalledTimes(1);
      startContainerStatsStream('http://a', 'k', false);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('未切服务器(重复激活同一台)不停流', () => {
      const { factory, clients } = makeFakeFactory();
      __setClientFactoryForTest(factory as unknown as typeof createClient);

      localStorage.setItem(
        'unraid-mobile-servers',
        JSON.stringify([{ id: 'srv-a', name: 'A', serverUrl: 'http://a' }])
      );
      localStorage.setItem('unraid-mobile-active-server', 'srv-a');

      startContainerStatsStream('http://a', 'k', false);
      setActiveServer('srv-a'); // 同一台,不清 cache 不停流
      expect(clients[0].dispose).not.toHaveBeenCalled();

      stopContainerStatsStream();
    });
  });
});
