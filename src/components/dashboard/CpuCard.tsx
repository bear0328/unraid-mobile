// 【阶段 1 P0 - 2026-06-15】CPU 卡片
// 从 Dashboard.tsx 拆出：CPU 总体进度 + 每核心展开/收起
// 【阶段 P1-2 - 2026-06-15 续 8】React.memo 包装
// 【阶段 P2-监控图 - 2026-06-17 续 32-7】接收 history 显示折线图
// 【续 45.8b 2026-07-04】删 SYSTEM_INFO_QUERY 的 temperature 字段,系统层 cpuTemp=0
// 【续 46.5 2026-07-19】续 46 曾用 temperature.sensors 短暂恢复温度,实锤 standby 下唤盘,红线永禁
// 【续 51 2026-07-19】温度改由 compose-api 提供(后端直读 /sys/class/hwmon,不唤盘);
//   cpuTemp=0 表示温度不可用(未装 compose-api/无 CPU 传感器),显示占位
import { useState, memo } from 'react';
import { UnraidSystemInfo } from '../../services';
import { usePro } from '../../hooks/usePro';
import ProgressBar from '../ProgressBar';
import { getCpuColor } from '../../utils/formatters';
import MiniSparkline from './MiniSparkline';
import StaleBadge from '../ui/StaleBadge';

interface CpuCardProps {
  systemInfo: UnraidSystemInfo | null;
  /** 过去 N 次 CPU% 采样(0-100),用于折线图 */
  history?: number[];
  /** 【续 45.7 2026-07-01】dashboard 数据 cache age(ms),>30min 显示 staleness 提示 */
  cacheAgeMs?: number | null;
}

function CpuCard({ systemInfo, history, cacheAgeMs }: CpuCardProps) {
  const [coresCollapsed, setCoresCollapsed] = useState(true);
  const pro = usePro();
  const cpu = systemInfo?.cpu || 0;
  const cpuColor = getCpuColor(cpu);
  const colorClass =
    cpuColor === 'red'
      ? 'text-red-600 dark:text-red-400'
      : cpuColor === 'yellow'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-blue-600 dark:text-blue-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          <span className="text-2xl mr-2">💻</span>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">CPU</h3>
              <StaleBadge
                cacheAgeMs={cacheAgeMs}
                thresholdMs={60 * 1000}
                title="Dashboard 缓存数据,点 🔄 刷新拉最新"
              />
            </div>
            {systemInfo?.cpuInfo?.brand && (
              <p className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate max-w-[180px]">
                {systemInfo.cpuInfo.brand}
              </p>
            )}
            {systemInfo?.cpuInfo && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {systemInfo.cpuInfo.cores} 核心 / {systemInfo.cpuInfo.threads} 线程
                {!pro ? (
                  // 【续 57 2026-07-22】CPU 温度归 Pro:免费版显示 🔒 占位,
                  // systemApi 侧也不会调 compose-api 取温度(免费零宿主改动)。
                  <span
                    className="ml-2 text-gray-400 dark:text-gray-500"
                    title="CPU 温度为 Pro 功能,激活 License 并安装宿主后端(compose-api)后显示"
                  >
                    🔒 温度 Pro
                  </span>
                ) : systemInfo?.cpuTemp && systemInfo.cpuTemp > 0 ? (
                  <span
                    className={`ml-2 ${
                      systemInfo.cpuTemp > 80
                        ? 'text-red-600 dark:text-red-400'
                        : systemInfo.cpuTemp > 60
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    🌡️ {systemInfo.cpuTemp.toFixed(1)}°C
                  </span>
                ) : (
                  // 【续 51 2026-07-19】cpuTemp=0 表示温度不可用:温度改由 compose-api 提供
                  // (后端直读 /sys/class/hwmon,不唤盘),未安装/无 CPU 传感器时落到此占位。
                  // GraphQL temperature 依旧永禁(续 46.5 唤盘红线),勿恢复。
                  <span
                    className="ml-2 text-gray-400 dark:text-gray-500"
                    title="CPU 温度由 compose-api 提供(直读内核传感器,不会唤醒硬盘);未安装 compose-api 或机器无 CPU 温度传感器时不显示"
                  >
                    🌡️ 温度不可用
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className={`text-2xl font-bold ${colorClass}`}>
          {systemInfo?.cpu?.toFixed(1) || '0'}%
        </div>
      </div>

      <ProgressBar label="" value={cpu} color={cpuColor} />

      {/* 【续 32-7】趋势折线图(过去 10 分钟) */}
      {history && history.length > 1 && (
        <div className="mt-2 -mb-1">
          <MiniSparkline
            data={history}
            color="#3b82f6"
            fillColor="rgba(59, 130, 246, 0.15)"
            height={40}
            label="趋势 (10 分钟)"
            current={`${cpu.toFixed(0)}%`}
          />
        </div>
      )}

      {/* 每核心 CPU 条 */}
      {systemInfo?.cpus && systemInfo.cpus.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setCoresCollapsed(!coresCollapsed)}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <span>{coresCollapsed ? '▶' : '▼'}</span>
            <span>{coresCollapsed ? '展开' : '收起'}</span>
            <span className="text-gray-400">({systemInfo.cpus.length} 核心)</span>
          </button>
          {!coresCollapsed && (
            <div className="space-y-1">
              {systemInfo.cpus.map((core, i) => {
                const userPct = core.percentUser || 0;
                const sysPct = core.percentSystem || 0;
                const activePct = userPct + sysPct;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-6 text-right flex-shrink-0">
                      {i}
                    </span>
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${userPct}%` }}
                        title={`User: ${userPct.toFixed(1)}%`}
                      />
                      <div
                        className="h-full bg-orange-400"
                        style={{ width: `${sysPct}%` }}
                        title={`System: ${sysPct.toFixed(1)}%`}
                      />
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-300 w-10">
                      {activePct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mt-1">
                <span className="w-6" />
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded" /> User
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-orange-400 rounded" /> Sys
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(CpuCard);
