// 【续 68 GUI 焕新】Dashboard 门面头卡
// 主色渐变(from/to-primary-* 跟随用户自选主色,usePrimaryColor 注入的 CSS 覆盖),
// 白字显示服务器名 + 阵列状态 pill + uptime + 幽灵刷新按钮。
// 替换原「黑字标题 + 灰色 uptime」朴素头部(Dashboard.tsx)。
// 【续 89b】信息增强:unRAID 版本/license 类型(并入信息行)、OS 更新提醒徽章
// (notifications 同源 webGui 铃铛,点击跳 webGui 更新页)
// 【续 90】padding 去 sm:p-5,恒 p-4(与其它卡一致)
// 【续 94】外网地址行(续 89b 加、掩码 Eye + 复制)整行移除:想要的外网 IP 无法自动
//   获取,显示当前访问地址/内网 IP/域名都无意义(用户拍板)
import { memo } from 'react';
import { RefreshCw, ArrowUpCircle } from 'lucide-react';
import { UnraidServerMeta } from '../../services';
import Icon from '../ui/Icon';
import LastRefreshText from '../ui/LastRefreshText';
import { useApiConfig } from '../../hooks/useUnraidApi';

interface ServerHeroCardProps {
  name?: string;
  uptime?: string;
  arrayStatus?: string;
  /** 【续 89b】版本/license/更新提醒(null=未拉到,信息行只显示 uptime) */
  meta?: UnraidServerMeta | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function licenseLabel(regTy?: string): string | null {
  if (!regTy) return null;
  switch (regTy.toUpperCase()) {
    case 'LIFETIME':
      return 'Lifetime';
    case 'TRIAL':
      return '试用版';
    case 'PLUS':
      return 'Plus';
    case 'PRO':
      return 'Pro';
    case 'STARTER':
      return 'Starter';
    case 'UNLEASHED':
      return 'Unleashed';
    case 'BASIC':
      return 'Basic';
    default:
      return regTy;
  }
}

function ServerHeroCard({
  name,
  uptime,
  arrayStatus,
  meta,
  isRefreshing,
  onRefresh,
}: ServerHeroCardProps) {
  const isStarted = arrayStatus === 'Started';
  const { config } = useApiConfig();

  // 信息行:版本 · license · 运行时长(有啥显示啥)
  const license = licenseLabel(meta?.regTy);
  const infoParts = [
    meta?.version ? `Unraid OS ${meta.version}` : null,
    license,
    `运行时长: ${uptime || 'N/A'}`,
  ].filter(Boolean);
  const updateHref =
    meta?.osUpdate?.link && config?.serverUrl
      ? `${config.serverUrl.replace(/\/$/, '')}${meta.osUpdate.link}`
      : null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-500 dark:from-primary-800 dark:to-primary-600 p-4 text-white shadow-md">
      {/* 装饰光斑(纯 CSS,不干扰交互) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-14 right-16 w-32 h-32 rounded-full bg-white/5"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold truncate">{name || 'unRAID Server'}</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isStarted ? 'bg-green-300' : 'bg-yellow-300'
                }`}
              />
              {arrayStatus || 'Unknown'}
            </span>
            {/* 【续 89b】OS 更新提醒(有通知才渲染,点击跳 webGui 更新页) */}
            {meta?.osUpdate && (
              <a
                href={updateHref || undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={meta.osUpdate.subject}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-400/90 text-amber-950 hover:bg-amber-300 transition-colors"
              >
                <Icon icon={ArrowUpCircle} size={12} />
                系统有更新
              </a>
            )}
          </div>
          <p className="text-sm text-white/80 mt-1">{infoParts.join(' · ')}</p>
        </div>

        {/* 幽灵刷新按钮:invalidate cache + 强制 fetch(不拉磁盘,不唤醒硬盘) */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="手动刷新 Dashboard 数据"
          title="立即拉新数据(不拉磁盘,不唤醒硬盘)"
        >
          <Icon icon={RefreshCw} size={12} className={isRefreshing ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="relative flex items-center gap-2 mt-2.5">
        {isRefreshing && (
          <span className="text-xs text-white/85 bg-white/15 rounded-full px-3 py-0.5">
            后台刷新中…
          </span>
        )}
        {/* 【续 74】页签刷新时间统一走全局「更新于」(所有页签同一个值) */}
        <LastRefreshText className="!text-white/80" />
      </div>
    </div>
  );
}

export default memo(ServerHeroCard);
