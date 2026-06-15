// normalize 系列工具方法（unraid 字段映射 → 业务类型）

// Disk 类型规范化
export function normalizeDiskType(type: string): 'parity' | 'data' | 'cache' | 'ssd' | 'boot' {
  if (!type) return 'data';
  const t = type.toUpperCase();
  if (t.includes('PARITY')) return 'parity';
  if (t.includes('CACHE') || t.includes('SSD')) return 'cache';
  if (t.includes('BOOT') || t.includes('FLASH')) return 'boot';
  return 'data';
}

// Docker 容器状态规范化（综合 state 和 status 字段）
export function normalizeDockerState(
  state: string,
  status: string
): 'running' | 'stopped' | 'paused' | 'restarting' {
  const s = state.toLowerCase();
  const st = status.toLowerCase();

  // 检查是否明确停止（包括 exited、dead 等）
  // 【续 50 B6】'(unhealthy)' 不再归一为 stopped:docker state 本就是 running,
  // 健康度属于 status 文本,不该进 state(否则 running 不健康容器显示"已停止",
  // 且 healthy↔unhealthy 波动会触发容器停止误报)
  if (
    s === 'exited' ||
    s === 'dead' ||
    s === 'stopped' ||
    st.includes('exited') ||
    st.includes('stopped') ||
    st.includes('已停止') ||
    st.match(/\(exited\s+\d+\)/)
  ) {
    return 'stopped';
  }

  // 检查是否暂停
  if (s === 'paused' || st.includes('paused') || st.includes('已暂停')) {
    return 'paused';
  }

  // 检查是否重启中
  if (s === 'restarting' || st.includes('restarting')) {
    return 'restarting';
  }

  // 检查是否运行中（包括 healthy、starting 等）
  if (
    s === 'running' ||
    s === 'up' ||
    st.includes('running') ||
    st.includes('up') ||
    st.includes('healthy') ||
    st.includes('starting') ||
    st.match(/\(healthy\)/)
  ) {
    return 'running';
  }

  // 默认返回 stopped
  return 'stopped';
}

// 从日期字符串格式化 uptime
export function formatUptimeFromDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const startDate = new Date(dateStr);
    if (isNaN(startDate.getTime())) return 'N/A';
    const now = new Date();
    const diffMs = now.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${diffDays}d ${diffHours}h`;
  } catch {
    return 'N/A';
  }
}

// Disk 状态规范化
export function normalizeDiskStatus(status: string): string {
  const s = status?.toUpperCase() || '';
  if (s.includes('OK') || s.includes('NORMAL') || s.includes('STARTED')) return 'normal';
  if (s.includes('DISK_ERR') || s.includes('ERROR')) return 'error';
  if (s.includes('DISK_RD') || s.includes('REBUILDING')) return 'rebuilding';
  return 'unknown';
}
