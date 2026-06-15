// 【阶段 P2-1 - 2026-06-16 续 13】config 单元测试
// 覆盖:saveApiConfig / getApiConfig(任一字段缺失返 null) / subscribeApiConfigChange / loadConfigFromFile / clearApiConfig
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import {
  saveApiConfig,
  getApiConfig,
  subscribeApiConfigChange,
  loadConfigFromFile,
  clearApiConfig,
  addServer,
  updateServer,
  setActiveServer,
  getServers,
} from './config';

const SERVER_KEY = 'unraid-mobile-server-url';
const API_KEY_KEY = 'unraid-mobile-api-key';
const SERVERS_KEY = 'unraid-mobile-servers';

describe('config', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('saveApiConfig + getApiConfig', () => {
    it('写两个 key + 触发 change 事件', () => {
      const spy = vi.fn();
      subscribeApiConfigChange(spy);
      saveApiConfig({ serverUrl: 'https://nas.local', apiKey: 'key-123' });
      expect(localStorage.getItem(SERVER_KEY)).toBe('https://nas.local');
      // apiKey 走 localStorage(续 49,推翻 D1 的 sessionStorage 拆分)
      expect(localStorage.getItem(API_KEY_KEY)).toBe('key-123');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('只传 serverUrl 不写 apiKey,getApiConfig 返 null(避免半残 config)', () => {
      localStorage.setItem(SERVER_KEY, 'https://nas.local');
      // apiKey key 啥也没
      expect(getApiConfig()).toBeNull();
    });

    it('只传 apiKey 不写 serverUrl,getApiConfig 返 null', () => {
      localStorage.setItem(API_KEY_KEY, 'key-123');
      expect(getApiConfig()).toBeNull();
    });

    it('两个都齐:getApiConfig 返完整 config', () => {
      saveApiConfig({ serverUrl: 'https://nas.local', apiKey: 'key-123' });
      expect(getApiConfig()).toEqual({ serverUrl: 'https://nas.local', apiKey: 'key-123' });
    });
  });

  describe('subscribeApiConfigChange', () => {
    it('退订后不再触发', () => {
      const spy = vi.fn();
      const unsub = subscribeApiConfigChange(spy);
      saveApiConfig({ serverUrl: 'a', apiKey: 'b' });
      expect(spy).toHaveBeenCalledTimes(1);
      unsub();
      saveApiConfig({ serverUrl: 'c', apiKey: 'd' });
      expect(spy).toHaveBeenCalledTimes(1); // 没增加
    });

    it('多个订阅者都会被通知', () => {
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      subscribeApiConfigChange(spy1);
      subscribeApiConfigChange(spy2);
      saveApiConfig({ serverUrl: 'a', apiKey: 'b' });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadConfigFromFile', () => {
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    function fileResponse(body: unknown, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('200 + 完整 config:返解析结果', async () => {
      fetchSpy.mockResolvedValueOnce(fileResponse({ serverUrl: 'https://nas.local', apiKey: 'k' }));
      const cfg = await loadConfigFromFile();
      expect(cfg).toEqual({ serverUrl: 'https://nas.local', apiKey: 'k' });
    });

    it('404:返 null(文件不存在是正常情况,init 静默降级)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
      const cfg = await loadConfigFromFile();
      expect(cfg).toBeNull();
    });

    it('200 但只有 serverUrl(续 49 新格式):返 config,apiKey 为空串', async () => {
      fetchSpy.mockResolvedValueOnce(fileResponse({ serverUrl: 'https://nas.local' }));
      const cfg = await loadConfigFromFile();
      expect(cfg).toEqual({ serverUrl: 'https://nas.local', apiKey: '' });
    });

    it('200 但连 serverUrl 都没有:返 null', async () => {
      fetchSpy.mockResolvedValueOnce(fileResponse({}));
      const cfg = await loadConfigFromFile();
      expect(cfg).toBeNull();
    });

    it('网络错误:catch 返 null 不抛', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('NetworkError'));
      const cfg = await loadConfigFromFile();
      expect(cfg).toBeNull();
    });
  });

  describe('clearApiConfig', () => {
    it('同时清 serverUrl + apiKey 两个 LS key', () => {
      saveApiConfig({ serverUrl: 'a', apiKey: 'b' });
      expect(localStorage.getItem(SERVER_KEY)).toBe('a');
      expect(localStorage.getItem(API_KEY_KEY)).toBe('b');
      clearApiConfig();
      expect(localStorage.getItem(SERVER_KEY)).toBeNull();
      expect(localStorage.getItem(API_KEY_KEY)).toBeNull();
    });
  });

  // 【续 50】多服务器:A4 apiKey 不落 servers 列表 / B3 切服务器清 cache / B4 legacy key 同步
  describe('多服务器(续 50)', () => {
    function seedServerCaches() {
      localStorage.setItem(
        'unraid-mobile-gql-containers',
        JSON.stringify({ data: [], timestamp: Date.now() })
      );
      localStorage.setItem('unraid-mobile-dashboard-cache', '{}');
      localStorage.setItem('unraid-mobile-health-cache', '{}');
    }
    function cachesExist() {
      return (
        localStorage.getItem('unraid-mobile-gql-containers') !== null ||
        localStorage.getItem('unraid-mobile-dashboard-cache') !== null ||
        localStorage.getItem('unraid-mobile-health-cache') !== null
      );
    }

    it('A4: addServer 的 apiKey 不进 servers 列表(存 per-server key + legacy key)', () => {
      const srv = addServer({ name: 'nas', serverUrl: 'http://nas', apiKey: 'secret-key' });
      const list = getServers();
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty('apiKey');
      expect(JSON.parse(localStorage.getItem(SERVERS_KEY)!)[0]).not.toHaveProperty('apiKey');
      expect(localStorage.getItem(`${API_KEY_KEY}-${srv.id}`)).toBe('secret-key');
      // 第一台自动激活 → legacy key 同步
      expect(localStorage.getItem(API_KEY_KEY)).toBe('secret-key');
      expect(getApiConfig()).toEqual({ serverUrl: 'http://nas', apiKey: 'secret-key' });
    });

    it('A4 迁移:LS 里历史遗留的 apiKey 字段,读 getServers 即剥离并写回', () => {
      localStorage.setItem(
        SERVERS_KEY,
        JSON.stringify([{ id: 's1', name: 'nas', serverUrl: 'http://nas', apiKey: 'leaked' }])
      );
      const list = getServers();
      expect(list[0]).not.toHaveProperty('apiKey');
      // 已写回 LS(后续读/备份导出都干净)
      expect(JSON.parse(localStorage.getItem(SERVERS_KEY)!)[0]).not.toHaveProperty('apiKey');
    });

    it('B4: updateServer 改 active 的 apiKey → 同步 legacy key,getApiConfig 立刻生效', () => {
      const srv = addServer({ name: 'nas', serverUrl: 'http://nas', apiKey: 'old-key' });
      updateServer(srv.id, { apiKey: 'new-key' });
      expect(localStorage.getItem(`${API_KEY_KEY}-${srv.id}`)).toBe('new-key');
      expect(localStorage.getItem(API_KEY_KEY)).toBe('new-key');
      expect(getApiConfig()?.apiKey).toBe('new-key');
      expect(getServers()[0]).not.toHaveProperty('apiKey');
    });

    it('B3: 切换到另一台服务器 → 清 graphql/dashboard/health cache', () => {
      const s1 = addServer({ name: 'a', serverUrl: 'http://a', apiKey: 'k1' });
      const s2 = addServer({ name: 'b', serverUrl: 'http://b', apiKey: 'k2' });
      expect(s1.id).not.toBe(s2.id);
      seedServerCaches();
      setActiveServer(s2.id);
      expect(cachesExist()).toBe(false);
      // legacy key 也跟着切过去
      expect(getApiConfig()).toEqual({ serverUrl: 'http://b', apiKey: 'k2' });
    });

    it('B3: 重复选中当前 active 服务器 → 不清 cache(避免无谓冷启动)', () => {
      const s1 = addServer({ name: 'a', serverUrl: 'http://a', apiKey: 'k1' });
      seedServerCaches();
      setActiveServer(s1.id); // 已是 active
      expect(cachesExist()).toBe(true);
    });

    it('B3: saveApiConfig 改 serverUrl → 清 cache', () => {
      saveApiConfig({ serverUrl: 'http://a', apiKey: 'k' });
      seedServerCaches();
      saveApiConfig({ serverUrl: 'http://b', apiKey: 'k' });
      expect(cachesExist()).toBe(false);
    });
  });
});
