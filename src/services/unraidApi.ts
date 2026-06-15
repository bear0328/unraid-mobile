// unraidApi.ts — 薄层入口
// 【2026-06-15 阶段 1.1 拆分】原 1036 行单文件 → 拆为 11 个子模块
// 路径：src/services/unraidApi/ (cache / config / queries / graphql / normalizers / *Api)
// 本文件只做：(1) UnraidApiService class 组合各子模块 (2) 公共函数 re-export
// 外部 import 路径不变(向后兼容)

// 公共函数 re-export
export {
  saveApiConfig,
  getApiConfig,
  loadConfigFromFile,
  subscribeApiConfigChange,
  clearApiConfig,
} from './unraidApi/config';

export { clearAllGraphqlCache } from './unraidApi/cache';

import * as systemApi from './unraidApi/systemApi';
import type { CheckOnlineResult } from './unraidApi/systemApi';
import * as diskApi from './unraidApi/diskApi';
import * as dockerApi from './unraidApi/dockerApi';
import * as vmApi from './unraidApi/vmApi';
import * as networkApi from './unraidApi/networkApi';
import * as shareApi from './unraidApi/shareApi';

/**
 * Unraid API 服务（向后兼容的 class 包装，内部委托给子模块）
 */
export class UnraidApiService {
  private baseUrl: string;
  private apiKey: string;
  private useProxy: boolean;

  constructor(baseUrl: string, apiKey: string, useProxy: boolean = true) {
    this.baseUrl = baseUrl.replace(/\/?$/, '');
    this.apiKey = apiKey;
    this.useProxy = useProxy;
  }

  // ==================== 系统 / 磁盘 / 网络 / 共享 ====================

  getSystemInfo() {
    return systemApi.getSystemInfo(this.baseUrl, this.apiKey, this.useProxy);
  }

  // 【续 39-1 候选 - 2026-06-18】启动期轻量探活
  checkOnline(): Promise<CheckOnlineResult> {
    return systemApi.checkOnline(this.baseUrl, this.apiKey, this.useProxy);
  }

  getDisks() {
    return diskApi.getDisks(this.baseUrl, this.apiKey, this.useProxy);
  }

  getNetworkInfo() {
    return networkApi.getNetworkInfo(this.baseUrl, this.apiKey, this.useProxy);
  }

  getShares() {
    return shareApi.getShares(this.baseUrl, this.apiKey, this.useProxy);
  }

  // ==================== Docker ====================

  getDockerContainers() {
    return dockerApi.getDockerContainers(this.baseUrl, this.apiKey, this.useProxy);
  }

  startContainer(containerId: string) {
    return dockerApi.startContainer(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  stopContainer(containerId: string) {
    return dockerApi.stopContainer(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  restartContainer(containerId: string) {
    return dockerApi.restartContainer(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  pauseContainer(containerId: string) {
    return dockerApi.pauseContainer(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  resumeContainer(containerId: string) {
    return dockerApi.resumeContainer(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  getContainerLogs(containerId: string, lines: number = 100, since?: string) {
    return dockerApi.getContainerLogs(
      this.baseUrl,
      this.apiKey,
      this.useProxy,
      containerId,
      lines,
      since
    );
  }

  getContainerStats(containerId: string) {
    return dockerApi.getContainerStats(this.baseUrl, this.apiKey, this.useProxy, containerId);
  }

  // 【续 36-3】批量 stats
  getAllContainerStats() {
    return dockerApi.getAllContainerStats(this.baseUrl, this.apiKey, this.useProxy);
  }

  getContainerDetails(containerName: string) {
    return dockerApi.getContainerDetails(this.baseUrl, this.apiKey, this.useProxy, containerName);
  }

  // ==================== VM ====================

  getVMs() {
    return vmApi.getVMs(this.baseUrl, this.apiKey, this.useProxy);
  }

  startVm(vmId: string) {
    return vmApi.startVm(this.baseUrl, this.apiKey, this.useProxy, vmId);
  }

  stopVm(vmId: string) {
    return vmApi.stopVm(this.baseUrl, this.apiKey, this.useProxy, vmId);
  }

  pauseVm(vmId: string) {
    return vmApi.pauseVm(this.baseUrl, this.apiKey, this.useProxy, vmId);
  }

  resumeVm(vmId: string) {
    return vmApi.resumeVm(this.baseUrl, this.apiKey, this.useProxy, vmId);
  }

  rebootVm(vmId: string) {
    return vmApi.rebootVm(this.baseUrl, this.apiKey, this.useProxy, vmId);
  }

  getVmLogs() {
    return vmApi.getVmLogs(this.baseUrl, this.apiKey, this.useProxy);
  }

  getVmDetails(vmUuid: string) {
    return vmApi.getVmDetails(this.baseUrl, this.apiKey, this.useProxy, vmUuid);
  }
}
