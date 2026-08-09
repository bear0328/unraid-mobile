// 【续 91 D】parity 校验状态 API
// array.parityCheckStatus 是 emhttp 内存态(2026-08-09 目标机实测字段全通),
// 只读不唤盘,随 dashboard polling tick 同节拍失效(namespace 'parity')
import { UnraidParityStatus } from '../types';
import { ParityStatusResponse, ParityCheckInfo } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import { ARRAY_PARITY_QUERY } from './queries';

/**
 * 取 parity 校验状态(归一化)。
 * 失败/老版本 schema 无 parityCheckStatus → 返 null(ParityCard 整卡不渲染),
 * 绝不影响 Dashboard 主流程。namespace 'parity' 缓存,Dashboard tick 失效后重拉。
 */
export async function getParityCheckStatus(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidParityStatus | null> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<ParityStatusResponse>(
    endpoint,
    apiKey,
    ARRAY_PARITY_QUERY,
    undefined,
    { namespace: 'parity' }
  );
  // schema 校验失败(老版本无该字段)/网络失败/无数据 → null,不降级重试
  // (字段是 unraid-api 既有只读字段,查不到=版本太老,重试无意义)
  if (!result.success || !result.data?.array?.parityCheckStatus) return null;

  const p: ParityCheckInfo = result.data.array.parityCheckStatus;
  return {
    arrayState: result.data.array.state || 'Unknown',
    status: p.status || 'NEVER_RUN',
    running: p.running === true,
    paused: p.paused === true,
    correcting: p.correcting === true,
    progress: typeof p.progress === 'number' ? p.progress : 0,
    speed: p.speed || '',
    errors: typeof p.errors === 'number' ? p.errors : null,
    date: p.date || null,
    duration: typeof p.duration === 'number' ? p.duration : null,
  };
}
