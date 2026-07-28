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
): Promise<UnraidDisk[]> {
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

  const allDisks: UnraidDisk[] = [];
  const addedNames = new Set<string>();

  const addDisk = (disk: DiskInfo, type: 'parity' | 'data' | 'cache' | 'ssd' | 'boot') => {
    if (!disk || !disk.name) return;

    const name = disk.name;
    // 避免重复添加同名磁盘
    if (addedNames.has(name)) return;
    addedNames.add(name);

    // 【续 50 C9b】删 capacity 死分支:真实 schema 无 per-disk capacity(name/cache),
    // 原 find(c => c.name === name) 永落空;size/used 统一走 disk.size/fsUsed(KB→字节)
    // 磁盘大小：size 单位是 KB，转换为字节
    const size = disk.size ? Number(disk.size) * 1024 : 0;

    // 已用空间：fsUsed 单位是 KB，转换为字节
    const fsUsedKB = disk.fsUsed || 0;
    const fsUsed =
      typeof fsUsedKB === 'number' && fsUsedKB > 0
        ? fsUsedKB * 1024 // KB 转字节
        : 0;

    allDisks.push({
      name,
      device: disk.device || disk.name || '',
      status: normalizeDiskStatus(disk.status),
      size: size,
      used: fsUsed,
      temperature: disk.temp || 0,
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
  if (result.success && result.data?.array?.caches) {
    const caches = result.data.array.caches;
    caches.forEach((cache) => {
      addDisk(cache, 'cache');
    });
  }

  // Flash 盘
  if (result.success && result.data?.array?.flash) {
    const flash = result.data.array.flash;
    addDisk(flash, 'boot');
  }

  // Boot 盘（如果 flash 不存在）
  if (result.success && result.data?.array?.boot) {
    const boot = result.data.array.boot;
    addDisk(boot, 'boot');
  }

  return allDisks;
}

/**
 * 【续 66】磁盘休眠状态(name → isSpinning)。SPIN_STATUS_QUERY 只读 emhttp 内存状态,
 * 实测不唤盘,可随 dashboard 常规刷新常拉;失败返回空 Map,不阻塞主数据流。
 */
export async function getSpinStatus(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<Map<string, boolean>> {
  const spinMap = new Map<string, boolean>();
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  // 不传 namespace:休眠状态必须实时,30min 缓存会让徽章长期过期
  const result = await graphqlRequest<SpinStatusResponse>(
    endpoint,
    apiKey,
    SPIN_STATUS_QUERY,
    undefined
  );

  if (result.success && result.data?.array) {
    const { disks = [], caches = [] } = result.data.array;
    for (const d of [...disks, ...caches]) {
      if (d?.name && typeof d.isSpinning === 'boolean') {
        spinMap.set(d.name, d.isSpinning);
      }
    }
  }
  return spinMap;
}
