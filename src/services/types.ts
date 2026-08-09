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

/** 【续 91 A15】unRAID 通知中心的告警条目(webGui 铃铛同源,importance=ALERT/WARNING) */
export interface UnraidAlert {
  title: string;
  subject: string;
  /** 原始级别:"ALERT" | "WARNING" */
  importance: string;
  link?: string;
  timestamp?: string;
}

/** 【续 89b】头卡元信息:版本/license 类型/OS 更新提醒(getServerMeta,独立查询) */
export interface UnraidServerMeta {
  /** unRAID 版本号,如 "7.3.0" */
  version?: string;
  /** license 类型原始值,如 "LIFETIME"/"TRIAL"/"PLUS"/"PRO"/"STARTER" */
  regTy?: string;
  /** 注册人名 */
  regTo?: string;
  /** 匹配到的 OS 更新通知(webGui 铃铛同源),无则 null */
  osUpdate?: { subject: string; link?: string } | null;
  /** 【续 91 A15】未读告警(importance=ALERT/WARNING,最多 5 条,给顶栏铃铛徽章用) */
  alerts?: UnraidAlert[];
}

export interface UnraidDisk {
  name: string;
  device: string;
  status: string;
  size: number;
  used: number;
  /** 【续 91 L13d】休眠盘 GraphQL temp 为 null → 保留 null 显示 —(不再误导 0°C) */
  temperature: number | null;
  type: 'parity' | 'data' | 'cache' | 'ssd' | 'boot';
  reads?: number; // 累计读取字节数
  writes?: number; // 累计写入字节数
  readSpeed?: number; // 实时读取速度 (bytes/sec)
  writeSpeed?: number; // 实时写入速度 (bytes/sec)
  /** 【续 66】转动状态(false=休眠),来自 isSpinning;未拉取时 undefined */
  isSpinning?: boolean;
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
  /** 【续 68】有可用更新(列表查询返回;null=未知/未计算) */
  isUpdateAvailable?: boolean | null;
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

/** 【续 101】VM 详情增强(compose-api vminfo 端点,libvirt XML 只读解析;字段均可空,缺失不抛错) */
export interface VmInfo {
  name: string;
  uuid: string | null;
  vcpus: number | null;
  memory: { current: number; max: number; unit: string } | null;
  autostart: boolean | null;
  disks: Array<{
    type: string | null;
    path: string | null;
    bus: string | null;
    dev: string | null;
    format: string | null;
    /** virtual-size 字节(qemu-img info);null = 未取到 */
    size: number | null;
  }>;
  interfaces: Array<{
    type: string | null;
    bridge: string | null;
    mac: string | null;
    model: string | null;
  }>;
  graphics: {
    type: string | null;
    port: string | null;
    autoport: boolean;
    listen: string | null;
  } | null;
  hostDevices: Array<{
    type: 'pci' | 'usb';
    domain?: string | null;
    bus?: string | null;
    slot?: string | null;
    function?: string | null;
    vendorId?: string | null;
    productId?: string | null;
  }>;
  snapshots: string[];
}

/** 【续 91 D】parity 校验状态(归一化后,ParityCard 用;查询失败/老 schema → 整卡不渲染) */
export interface UnraidParityStatus {
  /** 阵列状态原始值,如 "STARTED" */
  arrayState: string;
  /** ParityCheckStatus 枚举:NEVER_RUN/RUNNING/PAUSED/COMPLETED/CANCELLED/FAILED */
  status: string;
  running: boolean;
  paused: boolean;
  /** 纠错模式(写入修正) */
  correcting: boolean;
  /** 进度 0-100 */
  progress: number;
  /** 速度原始字符串,如 "120 MB/s" */
  speed: string;
  /** 错误数(null=未知) */
  errors: number | null;
  /** 上次校验时间 ISO(null=从未) */
  date: string | null;
  /** 上次校验耗时(秒,null=未知) */
  duration: number | null;
}

/** 【续 91 G】UPS 设备(归一化后,UpsCard 用;无 UPS/查询失败 → null 不渲染) */
export interface UnraidUpsDevice {
  id: string;
  name: string;
  model: string;
  /** apcaccess 状态码原始值,如 "OL"(市电)/"OB"(电池供电) */
  status: string;
  battery: {
    /** 电量 0-100 */
    chargeLevel: number;
    /** 预计续航(分钟) */
    estimatedRuntime: number;
    health: string;
  };
  power: {
    inputVoltage: number;
    outputVoltage: number;
    /** 负载 0-100 */
    loadPercentage: number;
    /** 额定功率 W(可空) */
    nominalPower: number | null;
    /** 当前功率 W(可空) */
    currentPower: number | null;
  };
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
