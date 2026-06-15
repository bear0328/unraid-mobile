// 【续 46.4 2026-07-18】容器 stats 实时流(订阅制)
// 背景:unraid-api 4.35 删除了 containers.stats 查询字段(旧 DOCKER_STATS_QUERY 全部 400),
// stats 只剩 subscription 通道:subscription { dockerContainerStats { id cpuPercent memUsage memPercent } }
// 本模块:graphql-ws 单例 + docker id → stats Map + hash→name 索引。
// 鉴权:connectionParams 携带 x-api-key(已实测可行 — 浏览器 WebSocket 不能设 header 也能用)。
// 数据源是 unraid-api DockerStatsService 的 `docker stats` 流(读 cgroup,不碰 array 盘)。
// ws 默认走同源(3998 nginx 代理,default.conf 已配 Upgrade 头);useProxy=false 时直连 serverUrl。
import { createClient, type Client } from 'graphql-ws';

export interface ContainerLiveStat {
  cpuPercent: number;
  memPercent: number;
  /** 原始字符串(如 "726.1MiB / 31.1GiB"),直接展示用 */
  memUsageText: string;
}

const STATS_SUBSCRIPTION = `
  subscription {
    dockerContainerStats {
      id
      cpuPercent
      memUsage
      memPercent
    }
  }
`;

/** GraphQL id 可能是 "container:<hash>" 形式;stats 流的 id 是纯 hash。统一去前缀比较 */
// 【续 54 2026-07-19】stats 流的 id 可能混有 ANSI 转义(实锤:unraid-api 解析 docker stats
// 流时把 ESC[H 光标序列带进首行容器的 id,如 "node:\u001b[H544d..."),先洗再去前缀,
// 否则该容器(本案例恰是 unraid-mobile-dev 自身)永远查不到 stats
function stripPrefix(id: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = id.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
  return clean.includes(':') ? clean.split(':').slice(1).join(':') : clean;
}

/** ws 地址:useProxy=同源(经 3998 nginx upgrade 代理);否则 http→ws 直连 */
export function buildStatsWsUrl(serverUrl: string, useProxy: boolean): string {
  if (useProxy && typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/graphql`;
  }
  return serverUrl.replace(/\/?$/, '').replace(/^http/, 'ws') + '/graphql';
}

let client: Client | null = null;
let startedKey: string | null = null;
const byDockerId = new Map<string, ContainerLiveStat>();
let idToName = new Map<string, string>();

/** createClient 工厂(测试可注入假 client,避免 jsdom 真连 ws) */
let clientFactory: typeof createClient = createClient;

/** 用容器列表更新 hash→name 索引(getDockerContainers 返回即调,id 带 container: 前缀) */
export function updateContainerIndex(containers: Array<{ id: string; name: string }>): void {
  const m = new Map<string, string>();
  for (const c of containers) {
    if (c.id) m.set(stripPrefix(c.id), c.name);
  }
  idToName = m;
}

export function getStatsByDockerId(dockerId: string): ContainerLiveStat | undefined {
  return byDockerId.get(stripPrefix(dockerId));
}

export function getStatsByName(name: string): ContainerLiveStat | undefined {
  for (const [hash, n] of idToName) {
    if (n === name) return byDockerId.get(hash);
  }
  return undefined;
}

/** 全部 stats,以容器名为 key(匹配旧 getAllContainerStats 的消费形状) */
export function getAllStatsByName(): Record<string, ContainerLiveStat> {
  const out: Record<string, ContainerLiveStat> = {};
  for (const [hash, name] of idToName) {
    const s = byDockerId.get(hash);
    if (s) out[name] = s;
  }
  return out;
}

/** 启动 stats 订阅(幂等,配置变化时自动重连) */
export function startContainerStatsStream(serverUrl: string, apiKey: string, useProxy: boolean): void {
  if (!serverUrl && !useProxy) return;
  const key = `${serverUrl}|${apiKey}|${useProxy}`;
  if (startedKey === key) return;
  stopContainerStatsStream();
  startedKey = key;

  client = clientFactory({
    url: buildStatsWsUrl(serverUrl, useProxy),
    connectionParams: { 'x-api-key': apiKey },
    retryAttempts: Infinity,
    shouldRetry: () => true,
  });

  const sub = client.iterate({ query: STATS_SUBSCRIPTION });
  void (async () => {
    try {
      for await (const msg of sub) {
        const s = (
          msg.data as {
            dockerContainerStats?: {
              id?: string;
              cpuPercent?: number;
              memUsage?: string;
              memPercent?: number;
            };
          } | null
        )?.dockerContainerStats;
        if (s?.id) {
          byDockerId.set(stripPrefix(String(s.id)), {
            cpuPercent: s.cpuPercent ?? 0,
            memPercent: s.memPercent ?? 0,
            memUsageText: s.memUsage ?? '',
          });
        }
      }
    } catch {
      /* 断线重连由 graphql-ws retry 负责;iterate 异常静默退出 */
    } finally {
      // 【续 50 B5】仅当 startedKey 仍是本循环的 key 才清:start(新 key) 会先 dispose 旧 client
      // (其 iterate 循环异步退出)再同步置新 key,旧循环 finally 若无条件清空会抹掉新 key,
      // 之后每次 getStats 都 key 不匹配 → stop+新建 client → WS 每 10s 重连一次
      if (startedKey === key) startedKey = null; // 允许后续 start 重建
    }
  })();
}

export function stopContainerStatsStream(): void {
  client?.dispose();
  client = null;
  startedKey = null;
}

/** 测试专用:注入假 createClient */
export function __setClientFactoryForTest(factory: typeof createClient | null): void {
  clientFactory = factory ?? createClient;
}
/** 测试专用:直接塞一条 stats */
export function __setStatsForTest(dockerId: string, stat: ContainerLiveStat): void {
  byDockerId.set(stripPrefix(dockerId), stat);
}
/** 测试专用:全部重置 */
export function __resetStatsStreamForTest(): void {
  byDockerId.clear();
  idToName = new Map();
  stopContainerStatsStream();
  clientFactory = createClient;
}
