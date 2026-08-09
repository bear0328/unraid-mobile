// 【续 68 GUI 焕新】Dashboard 门面头卡
// 主色渐变(from/to-primary-* 跟随用户自选主色,usePrimaryColor 注入的 CSS 覆盖),
// 白字显示服务器名 + 阵列状态 pill + uptime + 幽灵刷新按钮。
// 替换原「黑字标题 + 灰色 uptime」朴素头部(Dashboard.tsx)。
// 【续 89b】信息增强:unRAID 版本/license 类型(并入信息行)、OS 更新提醒徽章
// (notifications 同源 webGui 铃铛,点击跳 webGui 更新页)、外网地址(=当前访问地址,
// 默认掩码点 Eye 显示,显示态点击复制,截屏友好)
// 【续 90】外网地址显示值 origin → host(去 http:// scheme,显示纯 IP:端口/域名:端口);
//   padding 去 sm:p-5,恒 p-4(与其它卡一致)
import { memo, useState } from 'react';
import { RefreshCw, Eye, EyeOff, Copy, Check, ArrowUpCircle } from 'lucide-react';
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
  // 【续 89b】外网地址显隐 + 复制反馈(均组件内 state,不持久化)
  const [showAddress, setShowAddress] = useState(false);
  const [copied, setCopied] = useState(false);
  // 【续 91】复制失败也要给反馈(不静默)
  const [copyFailed, setCopyFailed] = useState(false);
  // 【续 90】host 而非 origin:去 scheme,显示纯 IP:端口(域名访问则域名:端口)
  const address = typeof window !== 'undefined' ? window.location.host : '';

  // 【续 91】clipboard API 回退:http 非安全上下文 navigator.clipboard 不存在,
  // 用隐藏 textarea + execCommand('copy')
  const fallbackCopy = (text: string): boolean => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copyAddress = async () => {
    let ok = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(address);
        ok = true;
      } catch {
        /* 落入回退 */
      }
    }
    if (!ok) ok = fallbackCopy(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1500);
    }
  };

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
          {/* 【续 89b】外网地址(=当前访问地址):默认掩码,Eye 切换显隐,显示态点击复制 */}
          {address && (
            <p className="flex items-center gap-1.5 text-xs text-white/70 mt-1">
              <span>外网地址:</span>
              {showAddress ? (
                <>
                  <button
                    onClick={copyAddress}
                    className="inline-flex items-center gap-1 font-mono hover:text-white transition-colors"
                    title="点击复制"
                  >
                    {address}
                    <Icon icon={copied ? Check : Copy} size={11} />
                  </button>
                  {copied && <span className="text-green-300">已复制</span>}
                  {copyFailed && <span className="text-red-300">复制失败</span>}
                </>
              ) : (
                <span className="font-mono tracking-wider">••••••••</span>
              )}
              <button
                onClick={() => setShowAddress(!showAddress)}
                className="inline-flex items-center hover:text-white transition-colors"
                aria-label={showAddress ? '隐藏外网地址' : '显示外网地址'}
              >
                <Icon icon={showAddress ? EyeOff : Eye} size={12} />
              </button>
            </p>
          )}
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
