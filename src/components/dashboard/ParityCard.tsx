// 【续 91 D】parity 校验进度卡(免费)
// running:进度条 + 速度 + 错误数(>0 红色)+ correcting/paused 状态;
// 非 running:status 中文化 + 上次 date/duration/errors;
// 数据 null(查询失败/老 schema)→ 整卡不渲染。不做控制按钮(start/pause 留待下轮)
import { memo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { UnraidParityStatus } from '../../services';
import ProgressBar from '../ProgressBar';
import { cardClass, CardHeader } from '../ui/Card';
import { formatDate, formatDuration } from '../../utils/formatters';

interface ParityCardProps {
  status: UnraidParityStatus | null;
}

/** ParityCheckStatus 枚举 → 中文(unraid-api:NEVER_RUN/RUNNING/PAUSED/COMPLETED/CANCELLED/FAILED) */
const STATUS_TEXT: Record<string, string> = {
  NEVER_RUN: '从未校验',
  RUNNING: '校验中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  FAILED: '校验失败',
};

function ParityCard({ status }: ParityCardProps) {
  if (!status) return null;

  const errors = status.errors ?? 0;
  const errorClass =
    errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
  const statusText = STATUS_TEXT[status.status] ?? status.status;

  return (
    <div className={cardClass}>
      <CardHeader
        icon={ShieldCheck}
        title="Parity 校验"
        badge={
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              status.running
                ? status.paused
                  ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}
          >
            {status.running ? (status.paused ? '已暂停' : '进行中') : statusText}
          </span>
        }
      />

      {status.running ? (
        <>
          <ProgressBar label="" value={status.progress} color={errors > 0 ? 'red' : 'blue'} />
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {status.progress.toFixed(1)}%
              {status.speed && status.speed !== '0' && <span className="ml-2">速度 {status.speed}</span>}
              {status.correcting && <span className="ml-2">纠错模式</span>}
            </span>
            <span className={errorClass}>错误 {errors}</span>
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {!status.date && <p>{statusText}</p>}
          {status.date && (
            <p>
              上次校验 {formatDate(status.date)}
              {status.duration !== null && status.duration > 0 && (
                <span className="ml-2">耗时 {formatDuration(status.duration * 1000)}</span>
              )}
            </p>
          )}
          <p className={errorClass}>错误 {errors}</p>
        </div>
      )}
    </div>
  );
}

export default memo(ParityCard);
