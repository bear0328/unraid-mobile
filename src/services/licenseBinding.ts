// 【续 59 2026-07-22】License 绑定模块:1 key 锁 1 台 unRAID + 最多 N 台设备
//
// 与 license.ts 分离的原因:依赖方向 systemApi → license(续 57),license.ts 必须保持
// 不依赖 unraidApi 业务模块,否则循环依赖。绑定检查需要 GraphQL + DAV,故独立成模块。
//
// 绑机锚点:unRAID vars.flashGuid(U 盘 GUID,Lime Tech 自己的硬件锚,重装不变换盘才变)。
// 设备计数:容器侧 /config/license-devices.json(davFetch PUT,与 settings.json 同机制),
//   所有设备不论内网/外网域名都访问同一容器,天然汇聚。文件可被用户自删绕过 ——
//   与项目"防君子不防高手"共识一致,不做对抗性加固。
import { getApiConfig } from './unraidApi/config';
import { graphqlRequest, buildGraphqlEndpoint } from './unraidApi/graphql';
import { davFetch } from '../components/shares/davAuth';
import {
  getLicenseState,
  setServerMismatch,
  type LicenseInfo,
} from './license';

const DEVICE_ID_KEY = 'unraid-mobile-device-id';
const DEVICES_FILE = '/config/license-devices.json';
const FLASH_GUID_QUERY = '{ vars { flashGuid } }';
/** 绑定检查/设备注册的读写超时(DAV 15s 默认太长,激活流程等不起) */
const IO_TIMEOUT_MS = 10_000;

interface DeviceRecord {
  id: string;
  firstSeen: number;
  lastSeen: number;
}

/** 读当前服务器的 flashGuid;读不到(未配置/离线/查询失败)返回 null */
export async function getServerFlashGuid(): Promise<string | null> {
  const config = getApiConfig();
  if (!config) return null;
  const endpoint = buildGraphqlEndpoint(config.serverUrl, true);
  const result = await graphqlRequest<{ vars?: { flashGuid?: string } }>(
    endpoint,
    config.apiKey,
    FLASH_GUID_QUERY,
    undefined,
    { timeoutMs: IO_TIMEOUT_MS }
  );
  if (!result.success) return null;
  return result.data?.vars?.flashGuid || null;
}

/**
 * 检查当前 license 与本机 flashGuid 的绑定关系并写状态。
 * 返回 true=通过(不绑机/匹配/查不到 guid 放行),false=不匹配(状态置 mismatch)。
 */
export async function checkServerBinding(): Promise<boolean> {
  const state = getLicenseState();
  if (state.status !== 'active' && state.status !== 'mismatch') return true;
  const boundGuid = state.info.guid;
  if (!boundGuid) return true; // 不绑机 key
  const serverGuid = await getServerFlashGuid();
  if (!serverGuid) {
    // 查不到(离线/未配 API):放行,不翻转状态 —— 宁可暂可用也不误锁
    return true;
  }
  const ok = serverGuid === boundGuid;
  setServerMismatch(!ok);
  return ok;
}

function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    /* LS 不可用 */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      /* 无碍,内存态本次可用 */
    }
  }
  return id;
}

async function readDeviceFile(): Promise<DeviceRecord[] | null> {
  try {
    const res = await davFetch(DEVICES_FILE, { signal: AbortSignal.timeout(IO_TIMEOUT_MS) });
    if (res.status === 404) return [];
    if (!res.ok) return null; // 401/403(未配 DAV 密码)等 → 不可读
    const data = await res.json();
    if (!Array.isArray(data?.devices)) return [];
    return data.devices as DeviceRecord[];
  } catch {
    return null;
  }
}

async function writeDeviceFile(devices: DeviceRecord[]): Promise<boolean> {
  try {
    const res = await davFetch(DEVICES_FILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices }),
      signal: AbortSignal.timeout(IO_TIMEOUT_MS),
    });
    return res.ok || res.status === 201 || res.status === 204;
  } catch {
    return false;
  }
}

export interface RegisterResult {
  ok: boolean;
  /** 当前设备数(注册成功后) */
  count?: number;
  maxDev?: number;
  error?: string;
}

/**
 * 激活时注册本设备。文件不可读/不可写(未配 DAV 密码、config 未挂载)→ 放行跳过计数。
 * 设备已满(≥maxDev)→ 拒绝,返回错误文案。
 */
export async function registerDevice(info: LicenseInfo): Promise<RegisterResult> {
  const maxDev = info.maxDev ?? 3;
  const devices = await readDeviceFile();
  if (devices === null) return { ok: true }; // 不可读写 → 防君子放行
  const id = getDeviceId();
  const now = Math.floor(Date.now() / 1000);
  const existing = devices.find((d) => d.id === id);
  if (existing) {
    existing.lastSeen = now;
  } else {
    if (devices.length >= maxDev) {
      return {
        ok: false,
        count: devices.length,
        maxDev,
        error: `已达 ${maxDev} 台设备上限。请先在旧设备上「解除绑定」释放名额,或联系客服。`,
      };
    }
    devices.push({ id, firstSeen: now, lastSeen: now });
  }
  await writeDeviceFile(devices);
  // 写失败(中途 DAV 不可用)也放行 —— 宁可漏计数不误伤激活
  return { ok: true, count: devices.length, maxDev };
}

/** 解绑时把自己从设备文件删掉(释放名额);失败静默(下次谁满了再说) */
export async function unregisterDevice(): Promise<void> {
  const devices = await readDeviceFile();
  if (devices === null) return;
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    /* ignore */
  }
  if (!id) return;
  const next = devices.filter((d) => d.id !== id);
  if (next.length !== devices.length) await writeDeviceFile(next);
}
