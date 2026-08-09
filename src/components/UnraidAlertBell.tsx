// 【续 91 E】unRAID 服务器告警徽章(顶栏)
// 数据:serverMeta.alerts(【续 91 A15】getServerMeta 从已拉回的 notifications.list
// 提取 ALERT/WARNING,零新增请求);Layout 侧自调 getServerMeta,namespace 'serverMeta'
// 缓存命中 0 成本(Dashboard 已同节拍失效,这里 60s 兜底重读)。
// 徽章取最高级染色:含 ALERT 红 / 纯 WARNING 琥珀。
// 【续 95 P1-3】点击不再直接跳 webGui,改开本地告警列表弹层(级别/标题/正文/时间,
// 单条 link 新窗打开);底部保留「在 webGui 查看全部」原跳转。
// 注:既有铃铛(NavLink→/notifications)是 App 内通知中心(容器事件/关键字告警),
// 数据源不同,不动它;本按钮与之并列,仅在有未读告警时出现
import { useCallback, useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { getServerMeta } from '../services/unraidApi/systemApi';
import { getApiConfig, subscribeApiConfigChange } from '../services';
import type { UnraidAlert } from '../services/types';
import Icon from './ui/Icon';
import { Modal, ModalFooter, ModalHeader } from './Modal';

// 60s 兜底重读:平时全命中 namespace 缓存(0 请求),Dashboard tick 失效后下一轮重拉
const REFRESH_MS = 60_000;

export default function UnraidAlertBell() {
  const [alerts, setAlerts] = useState<UnraidAlert[]>([]);
  // 【续 95 P1-3】本地告警列表弹层开关
  const [open, setOpen] = useState(false);

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

  // 单条 alert 的 link 是相对路径,拼 serverUrl(去尾斜杠)
  const serverUrl = (getApiConfig()?.serverUrl ?? '').replace(/\/+$/, '');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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

      {/* 【续 95 P1-3】本地告警列表:不跳 webGui 也能看全量内容 */}
      <Modal open={open} onClose={() => setOpen(false)} title="unRAID 告警列表">
        <ModalHeader title={`unRAID 告警 (${alerts.length})`} onClose={() => setOpen(false)} />
        {/* 超长列表内部滚动(约 55dvh),header/footer 保持可见,不被顶出屏外 */}
        <ul className="space-y-2 max-h-[55dvh] overflow-y-auto">
          {alerts.map((a, i) => {
            const isAlert = a.importance === 'ALERT';
            const ts = a.timestamp ? new Date(a.timestamp) : null;
            const tsText = ts && !Number.isNaN(ts.getTime()) ? ts.toLocaleString() : null;
            // 【续 95-4】badge 改卡片右上角绝对定位(方案 D),不占正文流;
            // 卡片 relative + overflow-hidden 让 badge 被圆角裁切
            const badge = (
              <span
                className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded font-medium text-white ${
                  isAlert ? 'bg-red-500' : 'bg-amber-500'
                }`}
              >
                {isAlert ? 'ALERT' : 'WARNING'}
              </span>
            );
            const body = (
              // title 加 pr-12 避免长标题被右上角 badge 覆盖;
              // 时间戳保持右侧与标题第一行对齐
              <>
                <div className="flex items-start gap-2 pr-12">
                  <span className="text-sm font-medium text-gray-900 dark:text-white break-words">
                    {a.title}
                  </span>
                  {tsText && (
                    <span className="ml-auto shrink-0 text-[10px] leading-5 text-gray-400 dark:text-gray-500">
                      {tsText}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-words line-clamp-2">
                  {a.subject}
                </p>
              </>
            );
            const itemClass =
              'relative overflow-hidden block rounded-lg border border-gray-200 dark:border-gray-700 p-2.5';
            return (
              <li key={i}>
                {a.link ? (
                  <a
                    href={`${serverUrl}${a.link}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${itemClass} hover:bg-gray-50 dark:hover:bg-gray-700/50`}
                  >
                    {badge}
                    {body}
                  </a>
                ) : (
                  <div className={itemClass}>
                    {badge}
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <ModalFooter>
          <button
            onClick={openNotifications}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            在 webGui 查看全部
          </button>
          {/* 【续 95-1】底部显式关闭按钮(原只有 ×,移动端看不见/点不到);
              样式对齐 SheetModal 取消按钮的灰色 secondary 口径 */}
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            关闭
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
