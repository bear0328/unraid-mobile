// 网络信息 API
import { UnraidNetworkInfo } from '../types';
import { NetworkResponse, NetworkMetric, NetworkInterface } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import { NETWORK_INFO_QUERY } from './queries';

export async function getNetworkInfo(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidNetworkInfo[]> {
  // 【性能优化 2026-06-14】裁剪 metrics.network 全部字段
  // Dashboard 只用 networks.length + networks.find(name)
  // 实测：getNetworkInfo 稳态 4.0s → 2.4s（-40%）
  // 保留 metrics 数据供未来的 Network 详情页使用（待拍板）
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<NetworkResponse>(
    endpoint,
    apiKey,
    NETWORK_INFO_QUERY,
    undefined,
    {
      namespace: 'networks',
    }
  );

  const networks: UnraidNetworkInfo[] = [];

  if (result.success && result.data) {
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

    // 合并数据
    infoInterfaces.forEach((iface) => {
      const metrics = metricsMap.get(iface.name) || ({} as NetworkMetric);
      networks.push({
        name: iface.name || 'Unknown',
        status: iface.status || 'Unknown',
        bytesReceived: metrics.received ? Number(metrics.received) : 0,
        bytesSent: metrics.sent ? Number(metrics.sent) : 0,
        rxSec: 0,
        txSec: 0,
      });
    });
  }

  return networks;
}
