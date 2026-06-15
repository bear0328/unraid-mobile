// 【阶段 P1-详情 - 2026-06-17 续 32-5】容器详情 modal
// 显示 stats (CPU%/内存 MB) + autoStart + 状态详情 + created
// 【续 52 2026-07-19】端口/网络/挂载/磁盘占用/命令/WebUI 链接已接入(GraphQL 支持,旧注释过时)
// 【阶段 P1-a11y - 2026-06-17 续 29-3】role/aria/focus-trap 沿用同套规范
// 【阶段 P2-收藏 - 2026-06-17 续 32-6】header 加 ⭐ 收藏按钮
// 【阶段 P2-详情增强 - 2026-06-17 续 33-4】显示 created(创建时间) + 跳 WebGUI 链接
// 【续 39-1】改用通用 <Modal> 组件,删除 30+ 行 backdrop/focus-trap/body-scroll 样板
// 【续 39-5】formatCreated/formatBytes/stateLabel 改用 utils/formatters
// 【续 52 2026-07-19】详情扩充:getContainerDetails 拉端口/挂载/网络/磁盘占用/命令/链接,
//   条件渲染;蓝色提示框"GraphQL 不支持端口"已过时,删除该说法
// 【续 53 2026-07-19】删底部"关闭"按钮(内容变长沉底按不到,右上角 × 即可);
//   非 running 容器 stats 区显示友好提示(docker stats 仅运行中有数据),不再 ❌ 报错
import { useEffect, useState } from 'react';
import { UnraidApiService, UnraidDockerContainer, ContainerDetailInfo } from '../../services';
import { useFavorites } from '../../hooks/useFavorites';
import { useApiConfig } from '../../hooks/useUnraidApi';
import MiniSparkline from '../dashboard/MiniSparkline';
import { Modal, ModalHeader } from '../Modal';
import { containerStateLabel, formatDate, formatBytes } from '../../utils/formatters';

interface ContainerDetailsModalProps {
  container: UnraidDockerContainer;
  /** 来自 useUnraidApi(),用于拉 stats */
  api: UnraidApiService | null;
  onClose: () => void;
}

// 【续 46.4】stats 改订阅源(containerStatsStream):memUsage/memLimit 数字 → memPercent + memUsageText
interface Stats {
  cpuPercent: number;
  memPercent: number;
  /** 原始字符串(如 "726.1MiB / 31.1GiB") */
  memUsageText: string;
}

export default function ContainerDetailsModal({
  container,
  api,
  onClose,
}: ContainerDetailsModalProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  // 【续 52】静态详情(端口/挂载/网络/磁盘占用等),打开时拉一次,失败静默(基本区仍可用)
  const [detail, setDetail] = useState<ContainerDetailInfo | null>(null);
  const [showMounts, setShowMounts] = useState(false);
  // 【续 35-7】每容器 CPU/MEM 实时曲线(5s polling,保留 60 个点 ≈ 5min 历史)
  const HISTORY_POINTS = 60;
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const { toggle: toggleFav, isFavorite: isFav } = useFavorites();
  const faved = isFav('container', container.containerId);
  // 【续 33-4】跳 WebGUI 用 baseUrl
  const { config } = useApiConfig();

  // 【续 35-7】单次拉 stats(辅助初始值)
  // 【续 53】非 running 跳过:docker stats 只有运行中容器才有数据,拉了也是报错
  useEffect(() => {
    if (!api) return;
    if (container.state !== 'running') return;
    setStatsLoading(true);
    setStatsError(null);
    api
      .getContainerStats(container.containerId)
      .then((r) => {
        if (r.success && r.data) {
          setStats(r.data as Stats);
        } else {
          setStatsError(r.error || '无法获取 stats');
        }
      })
      .catch((e) => setStatsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setStatsLoading(false));
  }, [api, container.containerId, container.state]);

  // 【续 35-7】5s 周期轮询(仅 running 状态),累积历史
  useEffect(() => {
    if (!api) return;
    if (container.state !== 'running') return;
    const id = setInterval(async () => {
      try {
        const r = await api.getContainerStats(container.containerId);
        if (r.success && r.data) {
          const data = r.data as Stats;
          setStats(data);
          const cpu = data.cpuPercent || 0;
          const memPct = data.memPercent || 0;
          setCpuHistory((prev) => {
            const next = [...prev, cpu];
            return next.length > HISTORY_POINTS ? next.slice(-HISTORY_POINTS) : next;
          });
          setMemHistory((prev) => {
            const next = [...prev, memPct];
            return next.length > HISTORY_POINTS ? next.slice(-HISTORY_POINTS) : next;
          });
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [api, container.containerId, container.state]);

  // 【续 52】拉静态详情(独立于 stats 轮询)
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    api
      .getContainerDetails(container.name)
      .then((r) => {
        if (!cancelled && r.success && r.data) {
          setDetail(r.data);
        }
      })
      .catch(() => {
        /* 静默:基本区仍可用 */
      });
    return () => {
      cancelled = true;
    };
  }, [api, container.name]);

  const state = containerStateLabel(container.state);
  const memPct = stats?.memPercent ?? 0;

  return (
    <Modal open onClose={onClose} title={container.name} maxWidthClass="max-w-md">
      <ModalHeader
        title={container.name}
        onClose={onClose}
        subtitle={
          <p className={`text-sm font-medium ${state.color}`}>
            {state.text}
            {detail?.isUpdateAvailable === true && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                🔔 有更新
              </span>
            )}
          </p>
        }
      >
        <button
          onClick={() =>
            toggleFav({ kind: 'container', value: container.containerId, label: container.name })
          }
          className={`text-xl leading-none ml-1 p-1 rounded transition-colors ${
            faved ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-500'
          }`}
          aria-label={faved ? '取消收藏' : '添加到收藏'}
          title={faved ? '取消收藏' : '添加到收藏'}
        >
          {faved ? '★' : '☆'}
        </button>
      </ModalHeader>

      {/* Stats 区块 */}
      <section>
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          实时资源
        </h4>
        {statsLoading ? (
          <div className="text-sm text-gray-400 py-2">⏳ 加载 stats...</div>
        ) : container.state !== 'running' ? (
          // 【续 53】docker stats 仅运行中容器有数据,停止的容器不再显示 ❌ 报错
          <div className="text-sm text-gray-400 py-2">
            容器未运行,无实时资源数据(CPU/内存统计仅运行中可用)
          </div>
        ) : statsError ? (
          <div className="text-sm text-red-500 py-2">❌ {statsError}</div>
        ) : stats ? (
          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">CPU</span>
                <span className="font-mono font-medium">{stats.cpuPercent.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
                />
              </div>
              {cpuHistory.length > 0 && (
                <MiniSparkline
                  data={cpuHistory}
                  color="#3b82f6"
                  fillColor="rgba(59, 130, 246, 0.15)"
                  height={36}
                  emptyText=""
                />
              )}
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">内存</span>
                <span className="font-mono font-medium">
                  {stats.memUsageText || '—'} ({memPct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${Math.min(memPct, 100)}%` }}
                />
              </div>
              {memHistory.length > 0 && (
                <MiniSparkline
                  data={memHistory}
                  color="#a855f7"
                  fillColor="rgba(168, 85, 247, 0.15)"
                  height={36}
                  emptyText=""
                />
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400 py-2">无数据</div>
        )}
      </section>

      {/* 基本信息 */}
      <section className="space-y-2 text-sm">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          信息
        </h4>
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">镜像</span>
          <span className="font-mono text-xs text-right truncate" title={container.image}>
            {container.image}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">容器 ID</span>
          <span className="font-mono text-xs text-right truncate" title={container.containerId}>
            {container.containerId}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">开机自启</span>
          <span
            className={container.autoStart ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}
          >
            {container.autoStart ? '✓ 启用' : '✗ 禁用'}
            {container.autoStart && detail?.autoStartOrder != null && (
              <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">
                (顺序 {detail.autoStartOrder}
                {detail.autoStartWait != null ? ` / 等待 ${detail.autoStartWait}s` : ''})
              </span>
            )}
          </span>
        </div>
        {detail?.command && (
          <div className="py-1.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">启动命令</span>
            <p className="font-mono text-xs mt-1 break-all text-gray-700 dark:text-gray-300">
              {detail.command}
            </p>
          </div>
        )}
        <div className="flex justify-between gap-2 py-1.5">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">详细状态</span>
          <span className="text-right truncate" title={container.status}>
            {container.status || '—'}
          </span>
        </div>
        {container.created !== undefined && (
          <div className="flex justify-between gap-2 py-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
            <span className="text-gray-500 dark:text-gray-400 shrink-0">创建时间</span>
            <span className="font-mono text-xs text-right">{formatDate(container.created)}</span>
          </div>
        )}
      </section>

      {/* 【续 52】端口(含可点访问地址) */}
      {detail && (detail.ports.length > 0 || detail.lanIpPorts.length > 0) && (
        <section>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            端口
          </h4>
          <div className="space-y-1 text-sm">
            {detail.ports.map((p, i) => (
              <div key={i} className="flex justify-between gap-2 py-0.5">
                <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                  {p.publicPort != null ? (
                    <>
                      {p.ip ? `${p.ip}:` : ''}
                      {p.publicPort} → {p.privatePort}
                    </>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">
                      {p.privatePort}(仅内部)
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{p.type}</span>
              </div>
            ))}
            {detail.lanIpPorts.map((addr) => (
              <a
                key={addr}
                href={`http://${addr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                🔗 {addr} ↗
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 【续 52】网络 */}
      {detail && (detail.networkMode || detail.networks.length > 0) && (
        <section>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            网络
          </h4>
          <div className="space-y-1 text-sm">
            {detail.networkMode && (
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-gray-500 dark:text-gray-400 shrink-0 text-xs">模式</span>
                <span className="font-mono text-xs text-right truncate">{detail.networkMode}</span>
              </div>
            )}
            {detail.networks.map((n) => (
              <div
                key={n.name}
                className="flex justify-between gap-2 py-0.5"
                title={[`网关 ${n.gateway || '—'}`, `MAC ${n.mac || '—'}`].join('\n')}
              >
                <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{n.name}</span>
                <span className="font-mono text-xs shrink-0">{n.ip || '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 【续 52】挂载(可折叠,默认收起) */}
      {detail && detail.mounts.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowMounts((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-700 dark:hover:text-gray-200"
            aria-expanded={showMounts}
          >
            <span>{showMounts ? '▾' : '▸'}</span>
            挂载
            <span className="normal-case font-normal">({detail.mounts.length})</span>
          </button>
          {showMounts && (
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {detail.mounts.map((m, i) => (
                <div key={i} className="py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="font-mono text-[11px] text-gray-700 dark:text-gray-300 break-all"
                      title={`${m.source} → ${m.destination}`}
                    >
                      {m.source} → {m.destination}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] px-1 rounded ${
                        m.rw
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {m.rw ? 'rw' : 'ro'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 【续 52】磁盘占用 */}
      {detail && (detail.sizeRootFs != null || detail.sizeRw != null || detail.sizeLog != null) && (
        <section>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            磁盘占用
          </h4>
          <div className="space-y-1 text-sm">
            {detail.sizeRootFs != null && (
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-gray-500 dark:text-gray-400 text-xs">镜像</span>
                <span className="font-mono text-xs">{formatBytes(detail.sizeRootFs)}</span>
              </div>
            )}
            {detail.sizeRw != null && (
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-gray-500 dark:text-gray-400 text-xs">可写层</span>
                <span className="font-mono text-xs">{formatBytes(detail.sizeRw)}</span>
              </div>
            )}
            {detail.sizeLog != null && (
              <div className="flex justify-between gap-2 py-0.5">
                <span className="text-gray-500 dark:text-gray-400 text-xs">日志</span>
                <span className="font-mono text-xs">{formatBytes(detail.sizeLog)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 【续 52】链接区:WebUI(有则醒目)+ 项目/支持链接 + WebGUI 兜底 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
        {detail?.webUiUrl && (
          <div>
            <a
              href={detail.webUiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              🌐 打开 Web UI ↗
            </a>
          </div>
        )}
        {(detail?.projectUrl || detail?.supportUrl) && (
          <div className="flex flex-wrap gap-3">
            {detail?.projectUrl && (
              <a
                href={detail.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                项目主页 ↗
              </a>
            )}
            {detail?.supportUrl && (
              <a
                href={detail.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                支持 ↗
              </a>
            )}
          </div>
        )}
        {config?.baseUrl && (
          <a
            href={`${config.baseUrl.replace(/\/$/, '')}/Docker`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            🔗 在 unRAID WebGUI 中打开 ↗
          </a>
        )}
      </div>

      {/* 【续 53】底部"关闭"按钮已删:内容变长后沉底按不到,右上角 × 即可关闭 */}
    </Modal>
  );
}
