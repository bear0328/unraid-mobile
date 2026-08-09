// 【续 91 E】unRAID 服务器告警徽章(顶栏)
// 数据:serverMeta.alerts(【续 91 A15】getServerMeta 从已拉回的 notifications.list
// 提取 ALERT/WARNING,零新增请求);Layout 侧自调 getServerMeta,namespace 'serverMeta'
// 缓存命中 0 成本(Dashboard 已同节拍失效,这里 60s 兜底重读)。
// 徽章取最高级染色:含 ALERT 红 / 纯 WARNING 琥珀;点击跳 webGui 通知页(新窗)。
// 注:既有铃铛(NavLink→/notifications)是 App 内通知中心(容器事件/关键字告警),
// 数据源不同,不动它;本按钮与之并列,仅在有未读告警时出现
import { useCallback, useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { getServerMeta } from '../services/unraidApi/systemApi';
import { getApiConfig, subscribeApiConfigChange } from '../services';
import type { UnraidAlert } from '../services/types';
import Icon from './ui/Icon';

// 60s 兜底重读:平时全命中 namespace 缓存(0 请求),Dashboard tick 失效后下一轮重拉
const REFRESH_MS = 60_000;

export default function UnraidAlertBell() {
  const [alerts, setAlerts] = useState<UnraidAlert[]>([]);

  const refresh = useCallback(async () => {
    const cfg = getApiConfig();
    if (!cfg) {
      setAlerts([]);
      return;
    }
    const meta = await getServerMeta(cfg.serverUrl, cfg.apiKey, true);
    setAlerts(meta?.alerts ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    // 切服务器/改配置 → 立即重读(clearServerScopedCaches 已清缓存,必走真请求)
    const unsub = subscribeApiConfigChange(() => void refresh());
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [refresh]);

  if (alerts.length === 0) return null;

  // 取最高级:任意 ALERT → 红,否则(WARNING)→ 琥珀
  const hasAlert = alerts.some((a) => a.importance === 'ALERT');

  const openNotifications = () => {
    const url = (getApiConfig()?.serverUrl ?? '').replace(/\/+$/, '');
    if (url) window.open(`${url}/Tools/Notifications`, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={openNotifications}
      className="relative p-1.5 sm:p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-600"
      aria-label="unRAID 告警"
      title={`unRAID 有 ${alerts.length} 条未读告警,点击查看`}
    >
      <Icon icon={BellRing} />
      <span
        className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] leading-[18px] text-center font-medium ${
          hasAlert ? 'bg-red-500' : 'bg-amber-500'
        }`}
      >
        {alerts.length > 99 ? '99+' : alerts.length}
      </span>
    </button>
  );
}
