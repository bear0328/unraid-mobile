// 【阶段 P0 - 2026-06-17 续 27】VM 详情 modal
// 【阶段 P1-a11y - 2026-06-17 续 29-3】加 role="dialog" / aria-modal / aria-labelledby / focus-trap
// 【续 36-4】加 getVmDetails 调通 + 跳 unRAID WebGUI VM 页
// 【续 39-1】改用通用 <Modal> 组件,删除 30+ 行 backdrop/focus-trap/body-scroll 样板
// 【续 39-5】formatState 改用 formatters.vmStateLabel
import { useId } from 'react';
import { UnraidVM } from '../../services';
import { useApiConfig } from '../../hooks/useUnraidApi';
import { Modal, ModalFooter, ModalHeader } from '../Modal';
import { vmStateLabel } from '../../utils/formatters';

interface VmDetailsModalProps {
  vm: UnraidVM;
  onClose: () => void;
}

export default function VmDetailsModal({ vm, onClose }: VmDetailsModalProps) {
  const state = vmStateLabel(vm.state);
  // 【续 36-4】baseUrl 用于跳 WebGUI
  const { config } = useApiConfig();
  const titleId = useId();

  return (
    <Modal open onClose={onClose} title={vm.name}>
      <ModalHeader
        title={vm.name}
        onClose={onClose}
        subtitle={<p className={`text-sm font-medium ${state.color}`}>{state.text}</p>}
      />
      <span id={titleId} className="sr-only">
        {vm.name}
      </span>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">名称</span>
          <span className="font-mono text-right truncate">{vm.name}</span>
        </div>
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">VM UUID</span>
          <span className="font-mono text-xs text-right truncate" title={vm.vmUuid}>
            {vm.vmUuid}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">完整 ID</span>
          <span className="font-mono text-xs text-right truncate" title={vm.id}>
            {vm.id}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1.5">
          <span className="text-gray-500 dark:text-gray-400 shrink-0">状态</span>
          <span className={`font-medium ${state.color}`}>{state.text}</span>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
        <div>
          💡 VM 日志、CPU/MEM 实时监控、虚拟磁盘配置等信息需通过 unRAID WebGUI 查看(unRAID GraphQL
          API 不暴露这些字段)。
        </div>
        {/* 【续 36-4】跳 WebGUI VM 页 */}
        {config?.baseUrl && (
          <a
            href={`${config.baseUrl.replace(/\/$/, '')}/Vms`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            🔗 在 unRAID WebGUI 中打开 ↗
          </a>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          关闭
        </button>
      </ModalFooter>
    </Modal>
  );
}
