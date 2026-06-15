// 【阶段 P2-1 - 2026-06-16 续 13】cache 单元测试
// 覆盖:getCacheKey 前缀 / getCache 命中/过期/损坏/无 timestamp / setCache / clearAllGraphqlCache
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCache, setCache, getCacheKey, clearAllGraphqlCache, CACHE_TTL } from './cache';

describe('cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCacheKey', () => {
    it('加前缀避免和其他模块冲突', () => {
      expect(getCacheKey('docker')).toBe('unraid-mobile-gql-docker');
      expect(getCacheKey('containers')).toBe('unraid-mobile-gql-containers');
    });
  });

  describe('getCache', () => {
    it('无数据返 null', () => {
      expect(getCache('missing')).toBeNull();
    });

    it('损坏 JSON 返 null(不抛)', () => {
      localStorage.setItem('unraid-mobile-gql-broken', '{not valid');
      expect(getCache('unraid-mobile-gql-broken')).toBeNull();
    });

    it('无 timestamp 字段返 null(防止时钟回拨/篡改)', () => {
      localStorage.setItem('unraid-mobile-gql-bad', JSON.stringify({ data: { x: 1 } }));
      expect(getCache('unraid-mobile-gql-bad')).toBeNull();
    });

    it('过期(>CACHE_TTL)返 null 并删除旧 key', () => {
      const old = { data: { x: 1 }, timestamp: Date.now() - CACHE_TTL - 1000 };
      localStorage.setItem('unraid-mobile-gql-old', JSON.stringify(old));
      expect(getCache('unraid-mobile-gql-old')).toBeNull();
      // 应被自动清理
      expect(localStorage.getItem('unraid-mobile-gql-old')).toBeNull();
    });

    it('命中:返 CacheEntry', () => {
      setCache('unraid-mobile-gql-fresh', { x: 1 });
      const entry = getCache<{ x: number }>('unraid-mobile-gql-fresh');
      expect(entry?.data).toEqual({ x: 1 });
      expect(entry?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('setCache', () => {
    it('写入 data + 当前时间戳', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
      setCache('unraid-mobile-gql-x', { v: 42 });
      const raw = JSON.parse(localStorage.getItem('unraid-mobile-gql-x')!);
      expect(raw.data).toEqual({ v: 42 });
      expect(typeof raw.timestamp).toBe('number');
      expect(raw.timestamp).toBe(new Date('2026-06-16T00:00:00Z').getTime());
      vi.useRealTimers();
    });

    it('localStorage 抛错(满/隐私模式)不崩,静默忽略', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => setCache('unraid-mobile-gql-x', { v: 1 })).not.toThrow();
      setItemSpy.mockRestore();
    });
  });

  describe('clearAllGraphqlCache', () => {
    it('只清带前缀的 key,不动其他数据', () => {
      localStorage.setItem(
        'unraid-mobile-gql-a',
        JSON.stringify({ data: {}, timestamp: Date.now() })
      );
      localStorage.setItem(
        'unraid-mobile-gql-b',
        JSON.stringify({ data: {}, timestamp: Date.now() })
      );
      localStorage.setItem('user-theme', 'dark'); // 不应被清
      localStorage.setItem('unraid-mobile-server-url', 'https://nas'); // 同名前缀但不是 gql 缓存,保留

      clearAllGraphqlCache();

      expect(localStorage.getItem('unraid-mobile-gql-a')).toBeNull();
      expect(localStorage.getItem('unraid-mobile-gql-b')).toBeNull();
      expect(localStorage.getItem('user-theme')).toBe('dark');
      expect(localStorage.getItem('unraid-mobile-server-url')).toBe('https://nas');
    });
  });
});
