// 磁盘 API
import { UnraidDisk } from '../types';
import { DisksResponse, DiskInfo, SpinStatusResponse } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint, isSchemaValidationError } from './graphql';
import { DISKS_QUERY, DISKS_QUERY_NO_SPIN, SPIN_STATUS_QUERY } from './queries';
import { normalizeDiskType, normalizeDiskStatus } from './normalizers';

export async function getDisks(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidDisk[] | null> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  let result = await graphqlRequest<DisksResponse>(endpoint, apiKey, DISKS_QUERY, undefined, {
    namespace: 'disks',
  });

  // 【续 67】unraid-api < 4.20(unRAID 7.2-)无 isSpinning 字段 → 整查校验失败,
  // 降级重试不含该字段的查询;代价仅是 DiskCard 无休眠徽章,主数据不断
  if (!result.success && isSchemaValidationError(result.error)) {
    result = await graphqlRequest<DisksResponse>(endpoint, apiKey, DISKS_QUERY_NO_SPIN, undefined, {
      namespace: 'disks',
    });
  }

  // 【续 91 A1】统一"失败返 null"约定:真空(服务器真无盘)返 [] 合法,
  // 只有请求失败才返 null — 调用方据此区分,失败不再被当空列表清空卡片/缓存
  if (!result.success) return null;

  const allDisks: UnraidDisk[] = [];
  const addedNames = new Set<string>();
  // 【续 91 L13b】flash/boot 按 device 去重:两者同设备不同名时会双进列表
  const addedDevices = new Set<string>();

  const addDisk = (disk: DiskInfo, type: 'parity' | 'data' | 'cache' | 'ssd' | 'boot') => {
    if (!disk || !disk.name) return;

    const name = disk.name;
    // 避免重复添加同名磁盘
    if (addedNames.has(name)) return;
    addedNames.add(name);
    if (disk.device) addedDevices.add(disk.device);

    // 【续 89】unraid-api 单位分裂(实测 2026-08):
    //   size(设备容量) = KiB(1024) —— 与 df 1K-blocks 逐字节一致
    //   fsSize/fsUsed/fsFree(文件系统口径) = 十进制 kB(1000) —— 与 df Used 比值恰 1.024
    // 优先 fs 口径(与 webGui/df 用户所见一致,且占比同单位自洽):
    const fsSizeKB = Number(disk.fsSize) || 0;
    const fsUsedKB = Number(disk.fsUsed) || 0;
    const size = fsSizeKB > 0 ? fsSizeKB * 1000 : disk.size ? Number(disk.size) * 1024 : 0;
    // fsSize 缺失(parity/未挂载/专属启动池)时回退设备容量,used 0
    const used = fsUsedKB > 0 ? fsUsedKB * 1000 : 0;

    allDisks.push({
      name,
      device: disk.device || disk.name || '',
      status: normalizeDiskStatus(disk.status),
      size: size,
      used: used,
      // 【续 91 L13d】temp null 保留(休眠盘),显示层给 —;0 是合法温度不再混淆
      temperature: typeof disk.temp === 'number' ? disk.temp : null,
      type,
      reads:
        disk.numReads !== undefined && disk.numReads !== null ? Number(disk.numReads) : undefined,
      writes:
        disk.numWrites !== undefined && disk.numWrites !== null
          ? Number(disk.numWrites)
          : undefined,
      isSpinning: typeof disk.isSpinning === 'boolean' ? disk.isSpinning : undefined,
    });
  };

  // 数据盘
  if (result.success && result.data?.array?.disks) {
    const disks = result.data.array.disks;
    disks.forEach((disk) => {
      addDisk(disk, normalizeDiskType(disk.type));
    });
  }

  // Cache 盘（如果不存在）
  // 【续 89】unRAID 7.3 专属启动池(bootPool="dedicated"):array.caches 会多出一条
  //   与 flash 同设备的 'boot' 池(如 device 同为 nvme1n1,size=1004KiB/fsSize=0),
  //   与 array.boot 的真实 flash 数据重复且数值无意义 → 按设备去重跳过
  const bootDevice = result.success ? result.data?.array?.boot?.device : undefined;
  if (result.success && result.data?.array?.caches) {
    const caches = result.data.array.caches;
    caches.forEach((cache) => {
      if (bootDevice && cache.device === bootDevice) return;
      addDisk(cache, 'cache');
    });
  }

  // Flash 盘
  if (result.success && result.data?.array?.flash) {
    const flash = result.data.array.flash;
    addDisk(flash, 'boot');
  }

  // Boot 盘（如果 flash 不存在）
  // 【续 91 L13b】与 flash 同设备(device 相同 name 不同)时跳过,防双进列表
  if (result.success && result.data?.array?.boot) {
    const boot = result.data.array.boot;
    if (boot.device && addedDevices.has(boot.device)) return allDisks;
    addDisk(boot, 'boot');
  }

  return allDisks;
}

/**
 * 【续 66】磁盘休眠状态(name → isSpinning)。SPIN_STATUS_QUERY 只读 emhttp 内存状态,
 * 实测不唤盘,可随 dashboard 常规刷新常拉。
 * 【续 91 A1】请求失败返 null(调用方保留旧 spinMap);成功但无数据返空 Map。
 */
export async function getSpinStatus(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<Map<string, boolean> | null> {
  const spinMap = new Map<string, boolean>();
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  // 不传 namespace:休眠状态必须实时,30min 缓存会让徽章长期过期
  const result = await graphqlRequest<SpinStatusResponse>(
    endpoint,
    apiKey,
    SPIN_STATUS_QUERY,
    undefined
  );

  // 【续 91 A1】失败返 null(原返空 Map,调用方会把休眠徽章全清空)
  if (!result.success) return null;

  if (result.data?.array) {
    const { disks = [], caches = [] } = result.data.array;
    for (const d of [...disks, ...caches]) {
      if (d?.name && typeof d.isSpinning === 'boolean') {
        spinMap.set(d.name, d.isSpinning);
      }
    }
  }
  return spinMap;
}
