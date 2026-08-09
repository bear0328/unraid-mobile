// 【续 91 G】UPS 监控卡(Pro)
// 门控在前数据在后:未解锁 Pro → ProGate 引导卡(卖点广告位);
// 解锁后无 UPS(查询 error/null)→ 整卡不渲染(目标机现状,展示态靠单测 mock)
import { memo } from 'react';
import { PlugZap } from 'lucide-react';
import { UnraidUpsDevice } from '../../services';
import ProgressBar from '../ProgressBar';
import ProGate from '../ProGate';
import { usePro } from '../../hooks/usePro';
import { cardClass, CardHeader } from '../ui/Card';

interface UpsCardProps {
  ups: UnraidUpsDevice | null;
}

/** apcaccess 状态码 → 中文:OL=市电(On Line),OB=电池(On Battery),其余原样展示 */
function upsStatusLabel(status: string): { text: string; color: string } {
  if (status.startsWith('OB')) {
    return { text: '电池供电', color: 'text-red-600 dark:text-red-400' };
  }
  if (status.startsWith('OL')) {
    return { text: '市电供电', color: 'text-green-600 dark:text-green-400' };
  }
  return { text: status || '未知', color: 'text-gray-500 dark:text-gray-400' };
}

/** 续航分钟数 → 友好文本(90 → 约 1.5 小时;45 → 约 45 分钟) */
function formatRuntime(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 120) return `约 ${minutes} 分钟`;
  return `约 ${(minutes / 60).toFixed(1)} 小时`;
}

function UpsCard({ ups }: UpsCardProps) {
  const pro = usePro();
  // 门控在前:未解锁一律 ProGate 引导卡(不依赖数据)
  if (!pro) return <ProGate feature="UPS 监控">{null}</ProGate>;
  // 数据在后:已解锁但无 UPS/查询失败 → 整卡不渲染
  if (!ups) return null;

  const onBattery = ups.status.startsWith('OB');
  const label = upsStatusLabel(ups.status);
  const charge = ups.battery.chargeLevel;
  const chargeColor = charge <= 20 ? 'red' : charge <= 50 ? 'yellow' : 'green';

  return (
    <div className={cardClass}>
      <CardHeader
        icon={PlugZap}
        title="UPS"
        badge={
          <span className={`text-xs font-medium ${label.color}`}>
            {label.text}
            {onBattery && ' · 放电中'}
          </span>
        }
      />

      {ups.model && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">{ups.model}</p>
      )}

      <ProgressBar label="电量" value={charge} color={chargeColor} />

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>预计续航 {formatRuntime(ups.battery.estimatedRuntime)}</span>
        <span>
          负载 {ups.power.loadPercentage}%
          {ups.power.currentPower !== null && (
            <span className="ml-1">
              · {ups.power.currentPower.toFixed(0)}W
              {ups.power.nominalPower !== null && ` / ${ups.power.nominalPower}W`}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export default memo(UpsCard);
