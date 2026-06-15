// 【阶段 P2-清理 - 2026-06-17 续 37-3】磁盘清理建议
// 复用 /files/user/ nginx autoindex(已带 size/mtime)
// 递归 BFS,深度/总量限制,取 Top N 大文件 + N 长期未动
// 不改 nginx(纯前端),慢但零部署
// 【续 39-5】formatBytes/formatMtime 改从 formatters 复用
import { parseAutoindexHtml } from '../components/shares/parseAutoindex';
import { getDavAuthHeader, type FileItem } from '../components/shares/davAuth';
import { formatBytesLong, formatMtime } from './formatters';

export const formatBytes = formatBytesLong;
export { formatMtime };

export interface ScanResult {
  largest: FileItem[];
  oldest: FileItem[];
  stats: {
    dirsScanned: number;
    filesScanned: number;
    totalBytes: number;
    durationMs: number;
    errors: number;
    truncated: boolean;
  };
}

export interface ScanOptions {
  /** 文件/目录扫描深度上限(根=0),默认 4 */
  maxDepth?: number;
  /** 最多扫多少条目,默认 3000(防止卡死) */
  maxItems?: number;
  /** 并发 fetch 上限,默认 4 */
  concurrency?: number;
  /** 进度回调 */
  onProgress?: (p: { dirsScanned: number; filesScanned: number }) => void;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 多久算"长期未动"(天),默认 365 */
  staleDays?: number;
  /** 至少多大才计入"大文件"(字节),默认 10MB */
  minLargeSize?: number;
}

const DEFAULTS = {
  maxDepth: 4,
  maxItems: 3000,
  concurrency: 4,
  staleDays: 365,
  minLargeSize: 10 * 1024 * 1024,
};

async function fetchDir(url: string, signal?: AbortSignal): Promise<FileItem[]> {
  // 【续 50】/files 已加 auth_basic,需带 DAV 凭证(未配置时 401,调用方计 error 后继续)
  const res = await fetch(url, { signal, headers: getDavAuthHeader() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // parseAutoindexHtml 第一个参数是 html,第二个是 basePath
  // basePath 在这里用空串即可(我们只要 name+size+mtime,不强求 path)
  // 但 parseAutoindexHtml 会调 normalizePath,需要传 basePath
  const html = await res.text();
  return parseAutoindexHtml(html, '');
}

/**
 * 并发限制的 for 队列
 */
async function runConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < limit; w++) {
    workers.push(
      (async () => {
        while (i < items.length) {
          const cur = i++;
          if (cur >= items.length) return;
          await fn(items[cur]);
        }
      })()
    );
  }
  await Promise.all(workers);
}

export async function scanDisk(baseUrl: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const cfg = { ...DEFAULTS, ...opts };
  const started = Date.now();
  const allFiles: FileItem[] = [];
  const seen = new Set<string>();
  let dirsScanned = 0;
  let filesScanned = 0;
  let errors = 0;
  let truncated = false;

  // BFS
  const queue: { path: string; depth: number }[] = [{ path: '', depth: 0 }];

  while (queue.length && filesScanned + dirsScanned < cfg.maxItems) {
    if (opts.signal?.aborted) break;
    const batch = queue.splice(0, Math.min(queue.length, cfg.concurrency));

    await runConcurrent(batch, cfg.concurrency, async ({ path, depth }) => {
      if (cfg.signal?.aborted) return;
      if (filesScanned + dirsScanned >= cfg.maxItems) {
        truncated = true;
        return;
      }
      const url = path ? `${baseUrl}/${path}` : `${baseUrl}/`;
      let items: FileItem[] = [];
      try {
        items = await fetchDir(url, cfg.signal);
        dirsScanned++;
      } catch (e) {
        errors++;
        console.warn('[diskScanner] fetch failed', url, e);
        return;
      }
      opts.onProgress?.({ dirsScanned, filesScanned });
      for (const item of items) {
        if (filesScanned + dirsScanned >= cfg.maxItems) {
          truncated = true;
          return;
        }
        if (seen.has(item.path)) continue;
        seen.add(item.path);
        if (item.isDir) {
          if (depth < cfg.maxDepth) {
            // parseAutoindexHtml 已经把 path 修正为完整相对路径
            queue.push({ path: item.path.replace(/\/$/, ''), depth: depth + 1 });
          }
          filesScanned++;
        } else {
          filesScanned++;
          if (item.size && item.size >= cfg.minLargeSize) {
            allFiles.push(item);
          }
        }
      }
    });
  }

  if (filesScanned + dirsScanned >= cfg.maxItems) truncated = true;

  // Top N largest
  const largest = [...allFiles]
    .filter((f) => typeof f.size === 'number')
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, 30);

  // Top N oldest(staleDays 内未动)
  const cutoffMs = Date.now() - cfg.staleDays * 86400_000;
  const oldest = allFiles
    .filter((f) => f.mtime > 0 && f.mtime * 1000 < cutoffMs)
    .sort((a, b) => a.mtime - b.mtime)
    .slice(0, 30);

  const totalBytes = allFiles.reduce((s, f) => s + (f.size ?? 0), 0);

  return {
    largest,
    oldest,
    stats: {
      dirsScanned,
      filesScanned,
      totalBytes,
      durationMs: Date.now() - started,
      errors,
      truncated,
    },
  };
}

export function formatBytesLocal(n: number): string {
  return formatBytesLong(n);
}
