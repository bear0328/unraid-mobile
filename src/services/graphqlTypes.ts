/**
 * GraphQL 响应类型定义
 */

// ==================== System Info ====================

export interface CpuCoreMetric {
  percentTotal: number;
  percentUser: number;
  percentSystem: number;
  percentIdle: number;
}

export interface CpuInfo {
  cores: number;
  threads: number;
  brand: string;
  manufacturer?: string;
}

export interface CpuMetrics {
  percentTotal: number;
  cpus: CpuCoreMetric[];
}

export interface MemoryMetrics {
  used: number;
  total: number;
  free: number;
  percentTotal: number;
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
  percentSwapTotal: number;
}

export interface TemperatureSummary {
  average: number;
}

/** 【续 46 2026-07-12】单个温度传感器(lm-sensors/sysfs,不读磁盘 SMART,不唤盘) */
export interface TemperatureSensor {
  id?: string;
  name?: string;
  type?: string;
  location?: string | null;
  current?: { value?: number } | null;
  warning?: number | null;
  critical?: number | null;
}

export interface TemperatureInfo {
  /** 不请求 summary(那是 SMART 聚合,会唤醒机械盘) */
  summary?: TemperatureSummary | null;
  /** 按传感器拆分的温度列表(CPU/主板/NVMe/磁盘),来自 lm-sensors/sysfs,安全不唤盘 */
  sensors?: TemperatureSensor[] | null;
}

export interface SystemMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  temperature: TemperatureInfo;
}

export interface SystemInfoResponse {
  info: {
    cpu: CpuInfo;
    os?: {
      hostname?: string;
      uptime?: string | null;
    };
  };
  metrics: SystemMetrics;
  array: {
    state: string;
  };
}

// ==================== Disks ====================

export interface DiskInfo {
  name: string;
  device: string;
  type: string;
  status: string;
  size: number;
  temp: number;
  fsSize: number;
  fsUsed: number;
  fsFree: number;
  numReads: number;
  numWrites: number;
}

// 【续 50 C9b】删 DiskCapacity:真实 schema 的 array.capacity 是 ArrayCapacity
// { kilobytes: Capacity!, disks: Capacity! }(disks 是磁盘数量聚合,非 per-disk 数组,
// 无 name、无 cache),per-disk find 不可能命中,原 capacity 分支为死代码
export interface DisksResponse {
  array: {
    disks: DiskInfo[];
    caches: DiskInfo[];
    boot?: DiskInfo;
    flash?: DiskInfo;
  };
}

// ==================== Docker ====================

export interface DockerContainer {
  id: string;
  names: string | string[];
  image: string;
  state: string;
  status: string;
  autoStart: boolean;
}

export interface DockerLogLine {
  timestamp: string;
  message: string;
}

export interface DockerLogsResponse {
  docker: {
    logs: {
      lines: DockerLogLine[];
    };
  };
}

export interface DockerContainersResponse {
  docker: {
    containers: DockerContainer[];
  };
}

// ==================== VM ====================

export interface VmDomain {
  id: string;
  name: string;
  state: string;
  uuid: string;
}

export interface VmsResponse {
  vms: {
    id: string;
    domains: VmDomain[];
  };
}

// ==================== Network ====================

export interface NetworkMetric {
  name: string;
  received: number;
  sent: number;
}

export interface NetworkInterface {
  name: string;
  status: string;
  address?: string;
}

// 【续 50 C9】对齐真实 schema(unraid/api generated-schema.graphql):
// Info.networkInterfaces: [InfoNetworkInterface!]!,Info 下无 network 字段
export interface NetworkResponse {
  metrics?: {
    network?: NetworkMetric[];
  };
  info?: {
    networkInterfaces?: NetworkInterface[];
  };
}

// ==================== Shares ====================

export interface ShareInfo {
  name: string;
  comment: string;
  size: number;
  free: number;
  used: number;
  cache: boolean | null;
}

export interface SharesResponse {
  shares: ShareInfo[];
}
