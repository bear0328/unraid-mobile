export interface UnraidCpuInfo {
  cores: number;
  threads: number;
  name?: string;
  manufacturer?: string;
  brand?: string;
}

export interface UnraidCpuCore {
  percentTotal: number;
  percentUser: number;
  percentSystem: number;
  percentIdle: number;
}

export interface UnraidSwapInfo {
  total: number;
  used: number;
  free: number;
  percentTotal: number;
}

export interface UnraidSystemInfo {
  name: string;
  cpu: number;
  cpuTemp: number;
  memory: number;
  memoryUsage: number;
  memoryTotal?: number;
  memoryUsed?: number;
  memoryFree?: number;
  uptime: string;
  arrayStatus: string;
  cpuInfo?: UnraidCpuInfo;
  cpus?: UnraidCpuCore[];
  swap?: UnraidSwapInfo;
}

export interface UnraidDisk {
  name: string;
  device: string;
  status: string;
  size: number;
  used: number;
  temperature: number;
  type: 'parity' | 'data' | 'cache' | 'ssd' | 'boot';
  reads?: number; // 累计读取字节数
  writes?: number; // 累计写入字节数
  readSpeed?: number; // 实时读取速度 (bytes/sec)
  writeSpeed?: number; // 实时写入速度 (bytes/sec)
}

export interface UnraidDockerContainer {
  id: string;
  name: string;
  containerId: string; // GraphQL API 需要的格式: "container:name"
  image: string;
  state: 'running' | 'stopped' | 'paused' | 'restarting' | 'exited';
  status: string;
  created: string;
  ports: string[];
  // 资源使用（可选）
  cpuPercent?: number;
  memoryPercent?: number;
  memoryUsage?: number;
  networkMode?: string;
  ipAddress?: string;
  macAddress?: string;
  /** 开机自启(unRAID WebGUI 字段,GraphQL 不返回) */
  autoStart?: boolean;
}

// ==================== 【续 52】容器详情(按需拉取的重字段) ====================

export interface ContainerDetailPort {
  ip: string | null;
  privatePort: number;
  /** null = 仅容器内部端口,未映射到宿主 */
  publicPort: number | null;
  type: string; // "TCP" | "UDP"
}

export interface ContainerDetailMount {
  type: string; // "bind" | "volume"
  source: string;
  destination: string;
  rw: boolean;
}

export interface ContainerDetailNetwork {
  name: string;
  ip: string;
  gateway: string;
  mac: string;
}

export interface ContainerDetailInfo {
  image: string;
  status: string;
  created: number | null;
  command: string;
  ports: ContainerDetailPort[];
  /** 现成的访问地址(如 "192.168.6.140:3998"),可直接拼 http:// 链接 */
  lanIpPorts: string[];
  mounts: ContainerDetailMount[];
  networks: ContainerDetailNetwork[];
  networkMode: string | null;
  /** 镜像磁盘占用(字节);null = 未统计 */
  sizeRootFs: number | null;
  /** 可写层占用(字节) */
  sizeRw: number | null;
  /** 日志占用(字节) */
  sizeLog: number | null;
  webUiUrl: string | null;
  projectUrl: string | null;
  supportUrl: string | null;
  isUpdateAvailable: boolean | null;
  autoStartOrder: number | null;
  autoStartWait: number | null;
}

export interface ContainerLogs {
  success: boolean;
  logs?: string;
  error?: string;
}

export interface ContainerPort {
  privatePort: number;
  publicPort?: number;
  type: string;
  ip?: string;
}

export interface ContainerVolume {
  hostPath: string;
  containerPath: string;
  mode: string;
}

export interface ContainerNetwork {
  name: string;
  ipAddress?: string;
  macAddress?: string;
  gateway?: string;
  driver?: string;
}

export interface ContainerDetails {
  success: boolean;
  data?: {
    id: string;
    names: string[];
    image: string;
    state: string;
    status: string;
    autoStart: boolean;
    cpuPercent?: number;
    memoryPercent?: number;
    memoryUsage?: number;
    memoryLimit?: string;
    networkMode?: string;
    ipAddress?: string;
    macAddress?: string;
    created: string;
    ports: ContainerPort[];
    networks?: ContainerNetwork[];
    volumes?: ContainerVolume[];
    labels?: Record<string, string>;
    environment?: Record<string, string>;
    command?: string;
    workingDir?: string;
  };
  error?: string;
}

export interface UnraidVM {
  id: string; // 完整的 serverId:vmUuid
  vmUuid: string; // 只提取 vmUuid
  name: string;
  state: string;
}

export interface UnraidNetworkInfo {
  name: string;
  status: string;
  bytesReceived: number;
  bytesSent: number;
  rxSec: number;
  txSec: number;
}

export interface UnraidShare {
  name: string;
  free: number;
  used: number;
  size: number;
  cache: boolean | null;
  comment?: string;
}

export interface UnraidApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ApiConfig {
  serverUrl: string;
  apiKey: string;
  /** 派生:去掉协议 + 端口的 host,用于 WebGUI 跳链。可选。 */
  baseUrl?: string;
}
