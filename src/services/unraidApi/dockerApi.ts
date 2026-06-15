// Docker 容器 API + 动作管理方法
import { UnraidDockerContainer, ContainerDetailInfo } from '../types';
import { DockerContainersResponse } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import {
  DOCKER_CONTAINERS_QUERY,
  DOCKER_CONTAINER_DETAILS_QUERY,
  DOCKER_LOGS_QUERY,
  START_CONTAINER_MUTATION,
  STOP_CONTAINER_MUTATION,
  PAUSE_CONTAINER_MUTATION,
  RESUME_CONTAINER_MUTATION,
} from './queries';
import {
  startContainerStatsStream,
  updateContainerIndex,
  getStatsByDockerId,
  getStatsByName,
  getAllStatsByName,
  type ContainerLiveStat,
} from './containerStatsStream';
import { normalizeDockerState } from './normalizers';
import { invalidateNamespace } from './cache';

export async function getDockerContainers(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidDockerContainer[]> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<DockerContainersResponse>(
    endpoint,
    apiKey,
    DOCKER_CONTAINERS_QUERY,
    undefined,
    {
      namespace: 'containers',
    }
  );

  if (result.success && result.data?.docker?.containers) {
    const containers = result.data.docker.containers;
    const mapped = containers.map((container) => {
      // 【续 50 P2】names 为空数组时 names[0] 是 undefined,旧代码直接 .replace 抛 TypeError
      // 导致整个列表 Promise reject;加 ?. + ?? 空守卫归为 'Unknown'
      const containerName = Array.isArray(container.names)
        ? (container.names[0]?.replace(/^\//, '') ?? 'Unknown') // 去掉开头的斜杠
        : container.names?.replace(/^\//, '') || 'Unknown';

      // 同时使用 state 和 status 字段来判断状态
      const normalizedState = normalizeDockerState(container.state || '', container.status || '');

      return {
        id: container.id || '',
        name: containerName,
        // 尝试使用冒号后面的部分作为容器 ID
        containerId: container.id
          ? `container:${container.id.split(':')[1] || container.id}`
          : `container:${containerName}`,
        image: container.image || '',
        state: normalizedState,
        status: container.status || container.state || 'Unknown',
        created: '',
        ports: [],
      };
    });
    // 【续 46.4】刷新 stats 订阅的 hash→name 索引(供 containerStatsStream 按名查找)
    updateContainerIndex(mapped.map((c) => ({ id: c.id, name: c.name })));
    return mapped;
  }

  return [];
}

// ==================== 容器动作 ====================

export async function startContainer(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, START_CONTAINER_MUTATION, {
    id: containerId,
  });
  // 【续 50 B1】mutation 成功后失效 containers 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('containers');
    return { success: true };
  }
  return { success: false, error: result.error || '启动失败' };
}

export async function stopContainer(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  // 使用 container: 格式
  const containerIdWithPrefix = containerId.startsWith('container:')
    ? containerId
    : `container:${containerId}`;

  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, STOP_CONTAINER_MUTATION, {
    id: containerIdWithPrefix,
  });
  // 【续 50 B1】mutation 成功后失效 containers 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('containers');
    return { success: true };
  }
  return { success: false, error: result.error || '停止失败' };
}

// 重启容器（通过 stop + start 实现）
export async function restartContainer(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  // 先停止
  const stopResult = await stopContainer(baseUrl, apiKey, useProxy, containerId);
  if (!stopResult.success) {
    return { success: false, error: stopResult.error || '停止失败' };
  }
  // 等待 1 秒
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // 再启动
  return await startContainer(baseUrl, apiKey, useProxy, containerId);
}

export async function pauseContainer(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, PAUSE_CONTAINER_MUTATION, {
    id: containerId,
  });
  // 【续 50 B1】mutation 成功后失效 containers 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('containers');
    return { success: true };
  }
  return { success: false, error: result.error || '暂停失败' };
}

export async function resumeContainer(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, RESUME_CONTAINER_MUTATION, {
    id: containerId,
  });
  // 【续 50 B1】mutation 成功后失效 containers 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('containers');
    return { success: true };
  }
  return { success: false, error: result.error || '恢复失败' };
}

// ==================== 容器详情 / 日志 / 统计 ====================

// 获取容器日志（独立 fetch，因为有自定义超时和响应结构）
// 【续 50 B8】since:服务端 cursor(上批最后一行时间戳,ISO 字符串),传入即增量拉取
export async function getContainerLogs(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string,
  lines: number = 100,
  since?: string
): Promise<{ success: boolean; logs?: string; cursor?: string | null; error?: string }> {
  try {
    const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: DOCKER_LOGS_QUERY,
        // 【续 50 B8】since 为可空参数,null 与缺省同义(首拉全量 tail)
        variables: { id: containerId, tail: lines, since: since ?? null },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.errors) {
      return { success: false, error: data.errors[0]?.message || '获取日志失败' };
    }

    if (data.data?.docker?.logs?.lines) {
      // 将日志行数组合并为字符串
      const logLines = data.data.docker.logs.lines
        .map((line: { timestamp?: string; message?: string }) => {
          const ts = line.timestamp ? `[${line.timestamp}] ` : '';
          return ts + (line.message || '');
        })
        .join('\n');
      // 【续 50 B8】透出 cursor,供调用方下次作 since 增量拉取
      return { success: true, logs: logLines, cursor: data.data.docker.logs.cursor ?? null };
    }

    return { success: false, error: '未找到日志' };
  } catch (err) {
    return { success: false, error: (err as Error).message || '获取日志失败' };
  }
}

// 获取容器资源使用统计
// 【续 46.4 2026-07-18】unraid-api 4.35 删除 containers.stats 查询字段(旧实现全部 400),
// 改读 containerStatsStream 的订阅实时值(首次调用自动启动订阅,幂等)
export async function getContainerStats(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerId: string
): Promise<{ success: boolean; data?: ContainerLiveStat; error?: string }> {
  try {
    startContainerStatsStream(baseUrl, apiKey, useProxy);
    // 从 containerId 中提取实际 ID（去掉 container: 前缀）
    const actualId = containerId.replace(/^container:/, '');
    // 优先按 docker hash 直查,其次按名字
    const byId = getStatsByDockerId(actualId);
    if (byId) return { success: true, data: byId };
    const byName = getStatsByName(actualId);
    if (byName) return { success: true, data: byName };
    return { success: false, error: 'stats 订阅尚未推送该容器(稍候自动出值)' };
  } catch (err) {
    return { success: false, error: (err as Error).message || '获取统计失败' };
  }
}

// 【续 36-3】批量拿所有容器 stats(Dashboard Top 5 sparkline 用)
// 【续 46.4】改读 containerStatsStream 订阅值(4.35 删除查询字段,不再发 HTTP)
export interface AllContainerStat {
  containerId: string;
  cpuPercent: number;
  memPercent: number;
}

export async function getAllContainerStats(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<{ success: boolean; data?: AllContainerStat[]; error?: string }> {
  try {
    startContainerStatsStream(baseUrl, apiKey, useProxy);
    const all = getAllStatsByName();
    const out: AllContainerStat[] = Object.entries(all).map(([name, s]) => ({
      containerId: name,
      cpuPercent: s.cpuPercent,
      memPercent: s.memPercent,
    }));
    return { success: true, data: out };
  } catch (err) {
    return { success: false, error: (err as Error).message || '获取统计失败' };
  }
}

// 获取容器详细信息(续 52:端口/挂载/网络/磁盘占用等重字段,详情弹窗按需拉)
// 【续 52】namespace 用独立的 'containerDetails':本查询与 DOCKER_CONTAINERS_QUERY
// 字段集不同,共用 'containers' 缓存有串形风险
export async function getContainerDetails(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  containerName: string
): Promise<{ success: boolean; data?: ContainerDetailInfo; error?: string }> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  try {
    const result = await graphqlRequest(
      endpoint,
      apiKey,
      DOCKER_CONTAINER_DETAILS_QUERY,
      undefined,
      {
        namespace: 'containerDetails',
      }
    );

    interface RawContainer {
      id?: string;
      names?: string | string[];
      image?: string;
      status?: string;
      created?: number | null;
      command?: string;
      ports?: Array<{
        ip?: string | null;
        privatePort?: number;
        publicPort?: number | null;
        type?: string;
      }> | null;
      lanIpPorts?: string[] | null;
      mounts?: Array<{
        Type?: string;
        Source?: string;
        Destination?: string;
        RW?: boolean;
      }> | null;
      networkSettings?: {
        Networks?: Record<
          string,
          { IPAddress?: string; Gateway?: string; MacAddress?: string }
        > | null;
      } | null;
      hostConfig?: { networkMode?: string } | null;
      sizeRootFs?: number | string | null;
      sizeRw?: number | string | null;
      sizeLog?: number | string | null;
      webUiUrl?: string | null;
      projectUrl?: string | null;
      supportUrl?: string | null;
      isUpdateAvailable?: boolean | null;
      autoStartOrder?: number | null;
      autoStartWait?: number | null;
    }

    if (result.success && result.data) {
      const containers =
        (result.data as { docker?: { containers?: RawContainer[] } }).docker?.containers ?? [];

      // 查找匹配的容器
      const container = containers.find((c) => {
        if (c.names) {
          const names = Array.isArray(c.names) ? c.names : [c.names];
          const normalizedName = containerName.replace(/^\//, '');
          return names.some((n: string) => {
            if (!n) return false;
            const normalized = String(n).replace(/^\//, '');
            return normalized === normalizedName || n === containerName;
          });
        }
        return false;
      });

      if (container) {
        // BigInt scalar 可能是 number 或 string,null 保持 null
        const toNum = (v: number | string | null | undefined): number | null =>
          v === null || v === undefined ? null : Number(v);
        const networksJson = container.networkSettings?.Networks ?? {};
        const data: ContainerDetailInfo = {
          image: container.image || '',
          status: container.status || '',
          created: toNum(container.created),
          command: container.command || '',
          ports: (container.ports ?? []).map((p) => ({
            ip: p.ip ?? null,
            privatePort: Number(p.privatePort ?? 0),
            publicPort: p.publicPort === null || p.publicPort === undefined ? null : Number(p.publicPort),
            type: p.type || 'TCP',
          })),
          lanIpPorts: container.lanIpPorts ?? [],
          mounts: (container.mounts ?? []).map((m) => ({
            type: m.Type || '',
            source: m.Source || '',
            destination: m.Destination || '',
            rw: m.RW === true,
          })),
          networks: Object.entries(networksJson).map(([name, n]) => ({
            name,
            ip: n?.IPAddress || '',
            gateway: n?.Gateway || '',
            mac: n?.MacAddress || '',
          })),
          networkMode: container.hostConfig?.networkMode ?? null,
          sizeRootFs: toNum(container.sizeRootFs),
          sizeRw: toNum(container.sizeRw),
          sizeLog: toNum(container.sizeLog),
          webUiUrl: container.webUiUrl ?? null,
          projectUrl: container.projectUrl ?? null,
          supportUrl: container.supportUrl ?? null,
          isUpdateAvailable: container.isUpdateAvailable ?? null,
          autoStartOrder: toNum(container.autoStartOrder),
          autoStartWait: toNum(container.autoStartWait),
        };
        return { success: true, data };
      }
    }

    return { success: false, error: '容器不存在' };
  } catch (err) {
    return { success: false, error: (err as Error).message || '获取详情失败' };
  }
}
