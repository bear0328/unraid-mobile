// 网络信息 API
import { UnraidNetworkInfo } from '../types';
import { NetworkResponse, NetworkMetric, NetworkInterface } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint, isSchemaValidationError } from './graphql';
import { NETWORK_INFO_QUERY, NETWORK_INFO_QUERY_NO_METRICS } from './queries';

// 【续 66】速率差分采样:metrics.network 只给累积字节(bytesReceived/bytesSent),
// 两次采样求 delta/dt 得 rxSec/txSec;模块级记忆,与 Dashboard 磁盘读写差分同套路
// 【续 88 2026-08-08】采样按 serverUrl key 化:切服务器后旧 prev 不重置的话,
// 首轮会用两台机器的累积计数器差分,产生虚假速率尖峰
let prevNetSample: {
  serverUrl: string;
  ts: number;
  bytes: Map<string, { rx: number; tx: number }>;
} | null = null;

export async function getNetworkInfo(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidNetworkInfo[] | null> {
  // 【续 66】查回 metrics.network(仅 2 个累积字段):bytesReceived/bytesSent 供差分算速率,
  // 读 /proc/net/dev,不碰盘;首次采样速率为 0,第二轮起有值
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  // 【续 66】不传 namespace = 跳过 30min GraphQL 缓存:缓存会冻结累积字节,
  // 速率恒 0;dashboard 层 5min skip 已做节流,每次真实刷新必须拿新计数器
  const result0 = await graphqlRequest<NetworkResponse>(
    endpoint,
    apiKey,
    NETWORK_INFO_QUERY,
    undefined
  );

  // 【续 67】老版本 unraid-api 若无 metrics.network → 整查校验失败,
  // 降级重试只查 networkInterfaces;网卡列表照常,速率恒 0(「速率不可用」)
  const result =
    !result0.success && isSchemaValidationError(result0.error)
      ? await graphqlRequest<NetworkResponse>(
          endpoint,
          apiKey,
          NETWORK_INFO_QUERY_NO_METRICS,
          undefined
        )
      : result0;

  const networks: UnraidNetworkInfo[] = [];

  // 【续 91 A1】失败返 null(区别于真空 []):调用方保留旧网卡数据,
  // 原实现失败返 [] 会把网络卡清空;失败也不更新 prev 采样(下轮差分基准不脏)
  if (!result.success || !result.data) return null;

  {
    // 合并 info 和 metrics 的数据
    // 【续 50 C9】真实 schema 是 info.networkInterfaces(unraid/api generated-schema.graphql:
    // Info.networkInterfaces: [InfoNetworkInterface!]!,无 info.network)。原解析
    // info.network.interfaces 与 NETWORK_INFO_QUERY 自相矛盾,生产恒 []
    const infoInterfaces: NetworkInterface[] = result.data.info?.networkInterfaces ?? [];
    const metricsNetwork: NetworkMetric[] = result.data.metrics?.network ?? [];

    // 创建 metrics 网络数据的映射
    const metricsMap = new Map<string, NetworkMetric>();
    metricsNetwork.forEach((m) => {
      metricsMap.set(m.name, m);
    });

    // 本轮采样(用于下一轮差分);serverUrl 变了说明切了服务器,旧 prev 作废(防跨机差分)
    const now = Date.now();
    const curSample = new Map<string, { rx: number; tx: number }>();
    metricsNetwork.forEach((m) => {
      curSample.set(m.name, { rx: Number(m.bytesReceived) || 0, tx: Number(m.bytesSent) || 0 });
    });
    const prev = prevNetSample && prevNetSample.serverUrl === baseUrl ? prevNetSample : null;
    const dt = prev ? (now - prev.ts) / 1000 : 0;

    // 合并数据
    infoInterfaces.forEach((iface) => {
      const metrics = metricsMap.get(iface.name) || ({} as NetworkMetric);
      const cur = curSample.get(iface.name);
      const last = prev?.bytes.get(iface.name);
      let rxSec = 0;
      let txSec = 0;
      // 只算正增量(重启/计数器清零时负值归零)
      // 【续 91 M3】dt 下限 1s:交叠刷新(single-flight 前的并发/手动连点)dt≈0
      // 会把正常 delta 放大成速率尖峰,<1s 不算速率返 0
      if (cur && last && dt >= 1) {
        rxSec = Math.max(0, (cur.rx - last.rx) / dt);
        txSec = Math.max(0, (cur.tx - last.tx) / dt);
      }
      networks.push({
        name: iface.name || 'Unknown',
        status: iface.status || 'Unknown',
        bytesReceived: metrics.bytesReceived ? Number(metrics.bytesReceived) : 0,
        bytesSent: metrics.bytesSent ? Number(metrics.bytesSent) : 0,
        rxSec,
        txSec,
      });
    });

    prevNetSample = { serverUrl: baseUrl, ts: now, bytes: curSample };
  }

  return networks;
}
