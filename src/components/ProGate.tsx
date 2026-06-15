// 【续 55 商业化】Pro 功能门
// <ProGate feature="容器详情">{...}</ProGate>:未解锁时渲染 🔒 引导卡(点击跳设置页 License 区)
// <ProGateButton>:行内小锁按钮(替代原操作按钮,Shares 工具条/容器卡片按钮等用)
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePro } from '../hooks/usePro';

interface ProGateProps {
  /** 功能名(显示在引导文案里) */
  feature: string;
  children: ReactNode;
}

export default function ProGate({ feature, children }: ProGateProps) {
  const pro = usePro();
  const navigate = useNavigate();
  if (pro) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => navigate('/settings', { state: { focusLicense: true } })}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
    >
      <span>🔒</span>
      <span>
        {feature} · Pro 功能,点击前往解锁
      </span>
    </button>
  );
}

interface ProGateButtonProps {
  /** 原按钮的显示文本 */
  label: string;
  className?: string;
  title?: string;
}

/** 行内 🔒 占位按钮(未解锁时替代原操作按钮;已解锁时调用方应渲染原按钮) */
export function ProGateButton({ label, className = '', title }: ProGateButtonProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/settings', { state: { focusLicense: true } })}
      className={className}
      title={title ?? `${label} · Pro 功能,点击前往解锁`}
    >
      🔒 {label}
    </button>
  );
}
