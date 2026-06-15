// 系统信息 API
import { UnraidSystemInfo } from '../types';
import { SystemInfoResponse } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import { SYSTEM_INFO_QUERY, ONLINE_QUERY } from './queries';
import { formatUptimeFromDate } from './normalizers';
import { getCpuTemp } from '../composeApi';

// 【续 39-1 候选 - 2026-06-18】轻量探活:启动期健康自检 + 周期心跳
// 比 getSystemInfo 小一个数量级(query { online }),3s 内能回
export interface CheckOnlineResult {
  online: boolean;
  latencyMs: number;
  /** 错误信息(鉴权失败/网络/超时) */
  error?: string;
}

export async function checkOnline(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<CheckOnlineResult> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const started = Date.now();
  const result = await graphqlRequest<{ online: boolean }>(
    endpoint,
    apiKey,
    ONLINE_QUERY,
    undefined,
    {
      timeoutMs: 5000, // 5s 自检超时(graphql 默认 10s 对探活太长)
    }
  );
  if (!result.success) {
    return {
      online: false,
      latencyMs: Date.now() - started,
      error: result.error || 'Unknown error',
    };
  }
  return {
    online: result.data?.online === true,
    latencyMs: Date.now() - started,
  };
}

export async function getSystemInfo(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidSystemInfo | null> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<SystemInfoResponse>(
    endpoint,
    apiKey,
    SYSTEM_INFO_QUERY,
    undefined,
    {
      namespace: 'systemInfo',
    }
  );

  if (result.success && result.data) {
    const data = result.data;
    // 【续 46.5 2026-07-19 红线】GraphQL metrics.temperature 永禁:全盘 standby 下该 query
    // 实锤触发 unraid-api 跑 smartctl --scan + smartctl -j -a(无 -n standby),4 盘全醒。
    // 【续 51 2026-07-19】温度改由 compose-api 提供(后端直读 /sys/class/hwmon CPU 传感器,
    // 纯 sysfs 不唤盘)。任何失败(未装 compose-api/无传感器/超时)静默回退 0,
    // CpuCard 显示"温度不可用"占位,绝不影响系统信息主流程。
    let cpuTemp = 0;
    try {
      const temp = await getCpuTemp();
      if (typeof temp.celsius === 'number' && temp.celsius > 0) {
        cpuTemp = temp.celsius;
      }
    } catch {
      // 回退 cpuTemp=0
    }
    const mem = data.metrics?.memory;

    return {
      name: data.info?.os?.hostname || 'unRAID Server',
      cpu: data.metrics?.cpu?.percentTotal || 0,
      cpuTemp,
      memory: mem?.percentTotal || 0,
      memoryUsage: mem?.percentTotal || 0,
      memoryTotal: mem?.total || 0,
      memoryUsed: mem?.used || 0,
      memoryFree: mem?.free || 0,
      uptime: formatUptimeFromDate(data.info?.os?.uptime || null),
      arrayStatus: data.array?.state || 'Unknown',
      cpuInfo: data.info?.cpu
        ? {
            cores: data.info.cpu.cores || 0,
            threads: data.info.cpu.threads || 0,
            manufacturer: data.info.cpu.manufacturer,
            brand: data.info.cpu.brand,
          }
        : undefined,
      cpus:
        data.metrics?.cpu?.cpus?.map(
          (c: {
            percentTotal: number;
            percentUser: number;
            percentSystem: number;
            percentIdle: number;
          }) => ({
            percentTotal: c.percentTotal || 0,
            percentUser: c.percentUser || 0,
            percentSystem: c.percentSystem || 0,
            percentIdle: c.percentIdle || 0,
          })
        ) || [],
      swap:
        mem && mem.swapTotal > 0
          ? {
              total: mem.swapTotal || 0,
              used: mem.swapUsed || 0,
              free: mem.swapFree || 0,
              percentTotal: mem.percentSwapTotal || 0,
            }
          : undefined,
    };
  }

  return null;
}
