// 系统信息 API
import { UnraidSystemInfo, UnraidServerMeta } from '../types';
import { SystemInfoResponse, ServerMetaResponse, ServerMetaNotification } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint, isSchemaValidationError } from './graphql';
import {
  SYSTEM_INFO_QUERY,
  ONLINE_QUERY,
  SERVER_META_QUERY,
  SERVER_META_QUERY_VARS_ONLY,
} from './queries';
import { formatUptimeFromDate } from './normalizers';
import { getCpuTemp } from '../composeApi';
import { isPro } from '../license';

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
  useProxy: boolean,
  options?: { namespace?: string | null; skipCpuTemp?: boolean }
): Promise<UnraidSystemInfo | null> {
  // 【续 78】options(多服务器聚合卡用):
  // - namespace:null → 不带缓存直连(非 active 服务器数据不能污染共享 'systemInfo' 缓存)
  // - skipCpuTemp → 跳过 compose-api(agent 只代理 active 服务器,跨服务器调会串数据)
  const namespace = options?.namespace === undefined ? 'systemInfo' : options.namespace;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<SystemInfoResponse>(
    endpoint,
    apiKey,
    SYSTEM_INFO_QUERY,
    undefined,
    namespace ? { namespace } : undefined
  );

  if (result.success && result.data) {
    const data = result.data;
    // 【续 46.5 2026-07-19 红线】GraphQL metrics.temperature 永禁:全盘 standby 下该 query
    // 实锤触发 unraid-api 跑 smartctl --scan + smartctl -j -a(无 -n standby),4 盘全醒。
    // 【续 51 2026-07-19】温度改由 compose-api 提供(后端直读 /sys/class/hwmon CPU 传感器,
    // 纯 sysfs 不唤盘)。任何失败(未装 compose-api/无传感器/超时)静默回退 0,
    // CpuCard 显示"温度不可用"占位,绝不影响系统信息主流程。
    // 【续 57 2026-07-22】CPU 温度归 Pro:非 Pro 直接回退 0,不调 compose-api
    // (免费版零宿主改动,也避免自装 agent 绕过门控),CpuCard 显示 🔒 占位。
    let cpuTemp = 0;
    if (isPro() && !options?.skipCpuTemp) {
      try {
        const temp = await getCpuTemp();
        if (typeof temp.celsius === 'number' && temp.celsius > 0) {
          cpuTemp = temp.celsius;
        }
      } catch {
        // 回退 cpuTemp=0
      }
    }
    const mem = data.metrics?.memory;
    // 【续 89】GraphQL memory 三字段口径实测(2026-08,对照宿主 free -k):
    //   used  = total-free,含 buff/cache(如 30.7G/31.1G=98.8%) —— 展示误导
    //   free  = 裸 free(几百 M),无参考意义
    //   percentTotal = (total-available)/total —— 与 free 的 used 列吻合的真实占用
    // 卡片百分比本就取 percentTotal,这里把 used/free 也归一到同一 available 口径,
    // 消除收起态 63.6% vs 展开态 98.8% 的自相矛盾
    const memTotal = mem?.total || 0;
    const memPercent = mem?.percentTotal || 0;
    const memUsed = Math.round((memTotal * memPercent) / 100);

    return {
      name: data.info?.os?.hostname || 'unRAID Server',
      cpu: data.metrics?.cpu?.percentTotal || 0,
      cpuTemp,
      memory: memPercent,
      memoryUsage: memPercent,
      memoryTotal: memTotal,
      memoryUsed: memUsed,
      memoryFree: memTotal - memUsed,
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

/**
 * 【续 89b】头卡元信息:unRAID 版本/license 类型/OS 更新提醒。
 * 独立于 SYSTEM_INFO_QUERY + 独立 namespace 缓存('serverMeta'):
 * 老版本 unraid-api 可能无 registration/notifications 字段,schema 校验失败
 * 降级 vars-only 查询(沿用 DISKS_QUERY_NO_SPIN 同款模式);仍失败静默 null,
 * 绝不影响 Dashboard 主流程。零宿主改动,全是 unraid-api 既有只读字段。
 */
export async function getServerMeta(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidServerMeta | null> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  let result = await graphqlRequest<ServerMetaResponse>(
    endpoint,
    apiKey,
    SERVER_META_QUERY,
    undefined,
    { namespace: 'serverMeta' }
  );
  if (!result.success && isSchemaValidationError(result.error)) {
    result = await graphqlRequest<ServerMetaResponse>(
      endpoint,
      apiKey,
      SERVER_META_QUERY_VARS_ONLY,
      undefined,
      { namespace: 'serverMeta' }
    );
  }
  if (!result.success || !result.data) return null;

  const d = result.data;
  return {
    version: d.vars?.version || undefined,
    regTy: d.registration?.type || d.vars?.regTy || undefined,
    regTo: d.vars?.regTo || undefined,
    osUpdate: findOsUpdateNotification(d.notifications?.list),
  };
}

/**
 * OS 更新通知匹配:unRAID 发新版时会推通知(webGui 铃铛同源)。
 * 规则:link 指向 /Tools/Update*,或 标题/正文 含 unraid/os 且含
 * update/upgrade/new version/release(大小写不敏感)。误报代价低(只是个徽章)。
 */
function findOsUpdateNotification(
  list: ServerMetaNotification[] | undefined
): { subject: string; link?: string } | null {
  if (!Array.isArray(list)) return null;
  const hit = list.find((n) => {
    const text = `${n?.title || ''} ${n?.subject || ''}`.toLowerCase();
    const link = (n?.link || '').toLowerCase();
    if (link.includes('/tools/update')) return true;
    return (
      (text.includes('unraid') || text.includes('os')) &&
      /(update|upgrade|new version|release)/.test(text)
    );
  });
  if (!hit) return null;
  return {
    subject: hit.subject || hit.title || '系统有更新',
    link: hit.link || undefined,
  };
}
