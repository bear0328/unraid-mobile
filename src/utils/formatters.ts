/**
 * 通用格式化工具函数
 */

// 【续 53 2026-07-19】容器日志行首 ISO 时间戳(从 LogsModal 挪来:组件文件只能导出组件)
const LOG_LINE_TS_RE =
  /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]/;

// 【续 79 2026-07-29】nginx/apache 风格内嵌时间戳 [29/Jul/2026:08:01:07 +0800]:
// docker 行自带 ISO 前缀 + 应用日志又内嵌一个,一行三个时间戳,手机端太挤。
// 规则:行首时间戳已转换的行 → 内嵌的整条删除(去重);无行首时间戳的行 → 转 [HH:MM:SS](去日期留时间)
const NGINX_TS_RE = /\[\d{2}\/[A-Za-z]{3}\/\d{4}:(\d{2}:\d{2}:\d{2}) [+-]\d{4}\] ?/g;

// 【续 79c】应用内嵌日期时间(Python logging `2026-07-29 06:55:19,811` / Go `2026-07-29 08:17:58`,
// moviepilot/msgo 实测):同上语义 —— 有前缀删整条,无前缀去日期留时间(毫秒保留)。
// 防误伤:只在行首锚区内处理(应用时间戳都在消息头),正文里的日期时间不动;
// 纯日期 YYYY-MM-DD 不匹配(误伤风险高)。顺带兼容裸 ISO 前缀(无方括号,转 [HH:MM:SS])
// 【续 83】锚区 60 → 96:autosignin 实测格式(裸 ISO 32 字符前缀 + " INFO:     " 10 +
//   "[autosignin] " 13 + 内嵌日期时间 24 = 79)超出 60,内嵌匹配被截断漏网
const EMBEDDED_DT_RE =
  /\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
const EMBEDDED_ANCHOR_LEN = 96;

/** 仅显示层:行首 [ISO8601] 转本地 [HH:MM:SS];内嵌 nginx 时间戳去重/去日期;
 *  应用内嵌日期时间(行首 60 字符内)去重/去日期;解析失败的行原样保留 */
export function formatLogTimesForDisplay(logs: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return logs
    .split('\n')
    .map((line) => {
      const m = line.match(LOG_LINE_TS_RE);
      let out = line;
      let hadPrefix = false;
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) {
          out = `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]${line.slice(m[0].length)}`;
          hadPrefix = true;
        }
      }
      return out.replace(NGINX_TS_RE, hadPrefix ? '' : '[$1] ');
    })
    .map((line) => {
      // 【续 79c】应用内嵌日期时间:只在行首 EMBEDDED_ANCHOR_LEN 字符内处理
      // 【续 83】改循环处理(moviepilot 实测漏网):行首是裸 ISO 前缀(无方括号)时,
      //   原逻辑只转第一个匹配就停,`[autosignin] 2026-07-29 09:00:00,046` 这类
      //   第二个内嵌日期时间漏网;且裸前缀补括号时纳秒没砍、时区没换算
      let hadPrefix = /^\[\d{2}:\d{2}:\d{2}\]/.test(line);
      let head = line.slice(0, EMBEDDED_ANCHOR_LEN);
      const tail = line.slice(EMBEDDED_ANCHOR_LEN);
      for (;;) {
        const hm = head.match(EMBEDDED_DT_RE);
        if (!hm || hm.index === undefined) break;
        const idx = hm.index;
        if (idx === 0 && !hadPrefix) {
          // 行首裸日期时间 → 补方括号转 [HH:MM:SS](毫秒/纳秒砍掉;
          // 带 Z/±时区的(docker --timestamps)按本地时区换算,与第一步方括号路径一致)
          let t: string;
          if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(hm[0])) {
            const d = new Date(hm[0]);
            t = isNaN(d.getTime())
              ? hm[0].slice(11, 19)
              : `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
          } else {
            const tm = hm[0].match(/\d{2}:\d{2}:\d{2}/);
            t = tm ? tm[0] : hm[0];
          }
          head = `[${t}]` + head.slice(hm[0].length);
          hadPrefix = true;
          continue;
        }
        if (hadPrefix) {
          // 有行首时间 → 内嵌整条删除(连同后随空格/制表符)
          const after = head.slice(idx + hm[0].length).replace(/^[ \t]+/, '');
          head = head.slice(0, idx) + after;
          continue;
        }
        // 无行首时间 → 去日期留时间(毫秒保留)
        const tm = hm[0].match(/\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/);
        const t = tm ? tm[0] : hm[0];
        head = head.slice(0, idx) + t + head.slice(idx + hm[0].length);
      }
      return head + tail;
    })
    .join('\n');
}

/**
 * 字节数格式化（B/K/M/G/T）— 紧凑,无空格,Dashboard 等用
 * 1.5G / 234K / 0
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '-';
  const b = Number(bytes);
  if (b >= 1e12) return (b / 1e12).toFixed(1) + 'T';
  if (b >= 1e9) return (b / 1e9).toFixed(1) + 'G';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + 'M';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + 'K';
  return b.toFixed(0) + 'B';
}

/**
 * 字节数格式化(详细,带空格) — 文件管理 / 磁盘清理等用
 * 1.5 GB / 234 KB / 0 B
 */
export function formatBytesLong(bytes: number | null | undefined): string {
  if (bytes == null) return '0 B';
  const b = Number(bytes);
  if (!isFinite(b) || b < 0) return '-';
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/**
 * 传输速度格式化（B/s, K/s, M/s, G/s）
 */
export function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec && bytesPerSec !== 0) return '-';
  const v = Number(bytesPerSec);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' G/s';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' M/s';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + ' K/s';
  return v.toFixed(0) + ' B/s';
}

/**
 * 获取使用率对应的颜色
 */
export function getUsageColor(usage: number, high = 90, mid = 70): 'red' | 'yellow' | 'green' {
  if (usage > high) return 'red';
  if (usage > mid) return 'yellow';
  return 'green';
}

/**
 * 获取 CPU 颜色（默认高 90%，中 70%）
 */
export function getCpuColor(cpu: number): 'red' | 'yellow' | 'blue' {
  if (cpu > 90) return 'red';
  if (cpu > 70) return 'yellow';
  return 'blue';
}

/**
 * 获取内存颜色
 */
export function getMemoryColor(memory: number): 'red' | 'yellow' | 'green' {
  if (memory > 90) return 'red';
  if (memory > 70) return 'yellow';
  return 'green';
}

/**
 * 磁盘使用率计算
 */
export function getDiskUsage(disk: { size: number | string; used: number | string }): number {
  const size = Number(disk.size) || 0;
  const used = Number(disk.used) || 0;
  return size > 0 ? (used / size) * 100 : 0;
}

/**
 * 文件 mtime(秒级时间戳)转 zh-CN 短日期 yyyy/mm/dd
 */
export function formatMtime(ts: number | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 通用时间戳(秒或毫秒) → zh-CN 短日期时间 yyyy/mm/dd HH:mm
 * 自动判断:大于 1e12 视为毫秒
 */
export function formatDate(input: string | number | null | undefined): string {
  if (input == null || input === '') return '—';
  let ts = Number(input);
  if (isNaN(ts)) {
    // 尝试 ISO 字符串
    const d = new Date(String(input));
    ts = d.getTime();
    if (isNaN(ts)) return String(input);
  }
  // 秒级时间戳(< 1e12)→ 毫秒
  if (ts < 1e12) ts *= 1000;
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Docker 容器状态 → { text, color } 标签
 */
export function containerStateLabel(state: string): { text: string; color: string } {
  switch (state) {
    case 'running':
      return { text: '运行中', color: 'text-green-600 dark:text-green-400' };
    case 'paused':
      return { text: '已暂停', color: 'text-yellow-600 dark:text-yellow-400' };
    case 'restarting':
      return { text: '重启中', color: 'text-blue-600 dark:text-blue-400' };
    case 'exited':
    case 'stopped':
      return { text: '已停止', color: 'text-gray-500 dark:text-gray-400' };
    case 'dead':
      return { text: '已失败', color: 'text-red-600 dark:text-red-400' };
    default:
      return { text: state, color: 'text-gray-500' };
  }
}

/**
 * VM 状态 → { text, color } 标签
 * VM 状态大小写不固定(RUNNING / running / Started)且多种值
 */
export function vmStateLabel(state: string): { text: string; color: string } {
  const normalized = state.toLowerCase();
  if (normalized.includes('running') || normalized.includes('started')) {
    return { text: '运行中', color: 'text-green-600 dark:text-green-400' };
  }
  if (normalized.includes('paused')) {
    return { text: '已暂停', color: 'text-yellow-600 dark:text-yellow-400' };
  }
  if (normalized.includes('shut') || normalized.includes('stopped')) {
    return { text: '已停止', color: 'text-gray-600 dark:text-gray-400' };
  }
  return { text: state, color: 'text-blue-600 dark:text-blue-400' };
}

/**
 * 数字千分位(1234567 → 1,234,567)
 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString('en-US');
}

/**
 * 时长(毫秒) → 友好字符串 "2h 35m 12s" / "45s" / "12m 30s"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms)) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

/**
 * 相对时间(毫秒) → "3 分钟前" / "2 小时前" / "刚刚"
 */
export function formatTimeAgo(ms: number | null | undefined): string {
  if (ms == null) return '-';
  const d = Date.now() - ms;
  if (d < 60_000) return '刚刚';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  return new Date(ms).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
