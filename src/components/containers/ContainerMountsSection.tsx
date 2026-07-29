// 【续 78】从 ContainerDetailsModal.tsx 拆出(纯结构移动,不改行为)
// 挂载区块:可折叠,默认收起
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Icon from '../ui/Icon';
import type { ContainerDetailInfo } from '../../services';

interface ContainerMountsSectionProps {
  mounts: ContainerDetailInfo['mounts'];
}

export default function ContainerMountsSection({ mounts }: ContainerMountsSectionProps) {
  const [showMounts, setShowMounts] = useState(false);

  return (
    <section>
      <button
        type="button"
        onClick={() => setShowMounts((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-700 dark:hover:text-gray-200"
        aria-expanded={showMounts}
      >
        <Icon icon={showMounts ? ChevronDown : ChevronRight} size={12} />
        挂载
        <span className="normal-case font-normal">({mounts.length})</span>
      </button>
      {showMounts && (
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {mounts.map((m, i) => (
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
  );
}
