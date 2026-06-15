// VM 虚拟机 API + 动作管理方法
import { UnraidVM } from '../types';
import { VmsResponse } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import {
  VMS_QUERY,
  VM_DETAILS_QUERY,
  START_VM_MUTATION,
  STOP_VM_MUTATION,
  PAUSE_VM_MUTATION,
  RESUME_VM_MUTATION,
  REBOOT_VM_MUTATION,
} from './queries';
import { invalidateNamespace } from './cache';

export async function getVMs(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidVM[]> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<VmsResponse>(endpoint, apiKey, VMS_QUERY, undefined, {
    namespace: 'vms',
  });

  if (result.success && result.data?.vms?.domains) {
    const domains = result.data.vms.domains;
    return domains.map((vm) => {
      // VM ID 格式是 serverId:vmUUID，提取 vmUUID 部分
      const parts = (vm.id || '').split(':');
      const vmUuid = parts[parts.length - 1];
      return {
        id: vm.id || '',
        vmUuid: vmUuid, // 只提取 VM UUID
        name: vm.name || 'Unknown',
        state: vm.state || 'unknown',
      };
    });
  }

  return [];
}

// ==================== VM 动作 ====================

export async function startVm(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmId: string
): Promise<{ success: boolean; error?: string }> {
  // 使用 vm:UUID 格式
  const prefixedId = `vm:${vmId}`;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, START_VM_MUTATION, { id: prefixedId });
  // 【续 50 B1】mutation 成功后失效 vms 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('vms');
    return { success: true };
  }
  return { success: false, error: result.error || '启动失败' };
}

export async function stopVm(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmId: string
): Promise<{ success: boolean; error?: string }> {
  const prefixedId = `vm:${vmId}`;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, STOP_VM_MUTATION, { id: prefixedId });
  // 【续 50 B1】mutation 成功后失效 vms 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('vms');
    return { success: true };
  }
  return { success: false, error: result.error || '停止失败' };
}

export async function pauseVm(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmId: string
): Promise<{ success: boolean; error?: string }> {
  const prefixedId = `vm:${vmId}`;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, PAUSE_VM_MUTATION, { id: prefixedId });
  // 【续 50 B1】mutation 成功后失效 vms 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('vms');
    return { success: true };
  }
  return { success: false, error: result.error || '暂停失败' };
}

export async function resumeVm(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmId: string
): Promise<{ success: boolean; error?: string }> {
  const prefixedId = `vm:${vmId}`;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, RESUME_VM_MUTATION, { id: prefixedId });
  // 【续 50 B1】mutation 成功后失效 vms 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('vms');
    return { success: true };
  }
  return { success: false, error: result.error || '恢复失败' };
}

export async function rebootVm(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmId: string
): Promise<{ success: boolean; error?: string }> {
  const prefixedId = `vm:${vmId}`;
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest(endpoint, apiKey, REBOOT_VM_MUTATION, { id: prefixedId });
  // 【续 50 B1】mutation 成功后失效 vms 的 30min cache,防操作后 UI 显示旧状态
  if (result.success) {
    invalidateNamespace('vms');
    return { success: true };
  }
  return { success: false, error: result.error || '重启失败' };
}

// ==================== VM 详情 / 日志 ====================

// 获取虚拟机日志
// 【续 50 P2】unRAID GraphQL 的 Vms 类型没有 logs 字段,旧实现返 success:true + 占位文案
// 属假数据;改为如实返 success:false。全项目唯一调用方是 unraidApi.getVmLogs 透传,
// 无 UI 依赖 success:true 的结构,不再发无用请求(参数保留下划线占位保持签名)
export async function getVmLogs(
  _baseUrl: string,
  _apiKey: string,
  _useProxy: boolean
): Promise<{ success: boolean; logs?: string; error?: string }> {
  return {
    success: false,
    error: 'unRAID API 不支持 VM 日志,请通过 unRAID WebGUI 查看',
  };
}

// 获取虚拟机详细信息
export async function getVmDetails(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean,
  vmUuid: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  try {
    const result = await graphqlRequest(endpoint, apiKey, VM_DETAILS_QUERY, undefined, {
      namespace: 'vms',
    });

    if (
      result.success &&
      result.data &&
      (result.data as { vms?: { domains?: Array<{ uuid?: string }> } }).vms?.domains
    ) {
      const vm = (result.data as { vms: { domains: Array<{ uuid?: string }> } }).vms.domains.find(
        (d) => d.uuid === vmUuid
      );
      if (vm) {
        return { success: true, data: vm };
      }
      return { success: false, error: '虚拟机不存在' };
    }

    return { success: false, error: '获取虚拟机详情失败' };
  } catch (err) {
    return { success: false, error: (err as Error).message || '获取详情失败' };
  }
}
