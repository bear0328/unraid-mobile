// 共享文件 API
import { UnraidShare } from '../types';
import { SharesResponse } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import { SHARES_QUERY } from './queries';

export async function getShares(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidShare[]> {
  // 【性能优化 2026-06-14】删 _t 时间戳变量，启用 namespace cache
  // shares 数据 30s 内不变，cache 命中 0ms 返回
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<SharesResponse>(endpoint, apiKey, SHARES_QUERY, undefined, {
    namespace: 'shares',
  });
  if (result.success && result.data?.shares) {
    // 过滤掉 disk1/disk2/disk3（裸盘，不是 user share）
    return (result.data.shares as UnraidShare[]).filter(
      (s) => s.name && !/^disk\d+$/i.test(s.name)
    );
  }
  return [];
}
