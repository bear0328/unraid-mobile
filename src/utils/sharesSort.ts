// 【续 90 2026-08-09】Shares 排序纯函数 + LS 持久化
// 文件浏览器:名称/修改日期/大小 × 升/降序;根 share 列表:名称/已用/剩余
// 目录永远排文件前,排序只在同类内生效;mtime=0(日期解析失败)按日期排序时排末尾
import type { FileItem } from '../components/shares/davAuth';

export type SortDirection = 'asc' | 'desc';
export type FileSortKey = 'name' | 'mtime' | 'size';
export type ShareSortKey = 'name' | 'used' | 'free';

export interface FileSort {
  key: FileSortKey;
  dir: SortDirection;
}
export interface ShareSort {
  key: ShareSortKey;
  dir: SortDirection;
}
export interface SharesSortState {
  file: FileSort;
  share: ShareSort;
}

export const SHARES_SORT_LS_KEY = 'unraid-mobile-shares-sort';

/** 默认:名称升序(=历史现状) */
export const DEFAULT_SHARES_SORT: SharesSortState = {
  file: { key: 'name', dir: 'asc' },
  share: { key: 'name', dir: 'asc' },
};

export const FILE_SORT_OPTIONS: ReadonlyArray<{ value: FileSortKey; label: string }> = [
  { value: 'name', label: '名称' },
  { value: 'mtime', label: '修改日期' },
  { value: 'size', label: '大小' },
];

export const SHARE_SORT_OPTIONS: ReadonlyArray<{ value: ShareSortKey; label: string }> = [
  { value: 'name', label: '名称' },
  { value: 'used', label: '已用' },
  { value: 'free', label: '剩余' },
];

// 中英文混排:zh 按拼音、en 按字母;numeric 让 "file2" < "file10"
const nameCollator = new Intl.Collator(['zh-Hans-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
});

const compareName = (a: FileItem, b: FileItem): number => nameCollator.compare(a.name, b.name);

function makeFileComparator(sort: FileSort): (a: FileItem, b: FileItem) => number {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return (a, b) => {
    let c: number;
    switch (sort.key) {
      case 'mtime':
        // mtime=0(解析失败)永远排末尾,与升降序无关
        if (a.mtime === 0 || b.mtime === 0) {
          if (a.mtime !== 0) return -1;
          if (b.mtime !== 0) return 1;
          c = 0;
        } else {
          c = sign * (a.mtime - b.mtime);
        }
        break;
      case 'size':
        c = sign * ((a.size ?? 0) - (b.size ?? 0));
        break;
      default:
        c = sign * compareName(a, b);
    }
    // 并列按名称兜底,保证顺序确定
    return c !== 0 ? c : compareName(a, b);
  };
}

/** 文件浏览器排序:目录永远在前,目录/文件各自按 sort 排序(不改动原数组) */
export function sortFileItems(items: FileItem[], sort: FileSort): FileItem[] {
  const cmp = makeFileComparator(sort);
  const dirs = items.filter((i) => i.isDir).sort(cmp);
  const files = items.filter((i) => !i.isDir).sort(cmp);
  return [...dirs, ...files];
}

/** 根 share 列表排序(根行都是目录;根行的 size 即 used,free 来自 getShares) */
export function sortRootShares(items: FileItem[], sort: ShareSort): FileItem[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let c: number;
    switch (sort.key) {
      case 'used':
        c = sign * ((a.size ?? 0) - (b.size ?? 0));
        break;
      case 'free':
        c = sign * ((a.free ?? 0) - (b.free ?? 0));
        break;
      default:
        c = sign * compareName(a, b);
    }
    return c !== 0 ? c : compareName(a, b);
  });
}

const FILE_KEYS: readonly FileSortKey[] = FILE_SORT_OPTIONS.map((o) => o.value);
const SHARE_KEYS: readonly ShareSortKey[] = SHARE_SORT_OPTIONS.map((o) => o.value);

function sanitizeSort<K extends string>(
  value: { key?: unknown; dir?: unknown } | undefined,
  keys: readonly K[],
  fallback: { key: K; dir: SortDirection }
): { key: K; dir: SortDirection } {
  if (
    value &&
    typeof value.key === 'string' &&
    (keys as readonly string[]).includes(value.key) &&
    (value.dir === 'asc' || value.dir === 'desc')
  ) {
    return { key: value.key as K, dir: value.dir };
  }
  return fallback;
}

/** 读 LS,无数据/损坏/非法值都回退默认 */
export function loadSharesSort(): SharesSortState {
  if (typeof window === 'undefined') return DEFAULT_SHARES_SORT;
  try {
    const raw = localStorage.getItem(SHARES_SORT_LS_KEY);
    if (!raw) return DEFAULT_SHARES_SORT;
    const parsed = JSON.parse(raw) as Partial<SharesSortState>;
    return {
      file: sanitizeSort(parsed.file, FILE_KEYS, DEFAULT_SHARES_SORT.file),
      share: sanitizeSort(parsed.share, SHARE_KEYS, DEFAULT_SHARES_SORT.share),
    };
  } catch {
    return DEFAULT_SHARES_SORT;
  }
}

/** 写 LS(隐私模式等写失败静默忽略) */
export function saveSharesSort(state: SharesSortState): void {
  try {
    localStorage.setItem(SHARES_SORT_LS_KEY, JSON.stringify(state));
  } catch {
    // 忽略写失败
  }
}
