// 【阶段 P0 - 2026-06-17 续 27】VM 详情 modal
// 【阶段 P1-a11y - 2026-06-17 续 29-3】加 role="dialog" / aria-modal / aria-labelledby / focus-trap
// 【续 36-4】加 getVmDetails 调通 + 跳 unRAID WebGUI VM 页
// 【续 39-1】改用通用 <Modal> 组件,删除 30+ 行 backdrop/focus-trap/body-scroll 样板
// 【续 39-5】formatState 改用 formatters.vmStateLabel
// 【续 101 2026-08-10】增强详情(Pro):compose-api vminfo 端点读 libvirt XML,
//   展示 CPU/内存/磁盘/网络/图形/直通/快照;基本信息(name/uuid/state)保持免费
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Lightbulb, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { UnraidVM, VmInfo } from '../../services';
import { useApiConfig, useUnraidApi } from '../../hooks/useUnraidApi';
import { usePro } from '../../hooks/usePro';
import { Modal, ModalFooter, ModalHeader } from '../Modal';
import { ProGateButton } from '../ProGate';
import Icon from '../ui/Icon';
import { vmStateLabel, formatBytes } from '../../utils/formatters';

interface VmDetailsModalProps {
  vm: UnraidVM;
  onClose: () => void;
}

/** 内存按 unit 格式化(libvirt 默认 KiB → GiB 一位小数;其它单位原样) */
function formatMem(value: number, unit: string): string {
  if (unit === 'KiB') return `${(value / 1024 / 1024).toFixed(1)} GiB`;
  if (unit === 'MiB') return `${(value / 1024).toFixed(1)} GiB`;
  return `${value} ${unit}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <span className="text-gray-500 dark:text-gray-400 shrink-0 text-xs">{label}</span>
      <span className="font-mono text-xs text-right break-all">{children}</span>
    </div>
  );
}

export default function VmDetailsModal({ vm, onClose }: VmDetailsModalProps) {
  const state = vmStateLabel(vm.state);
  // 【续 36-4】baseUrl 用于跳 WebGUI
  const { config } = useApiConfig();
  const titleId = useId();

  // 【续 101】增强详情(Pro,compose-api vminfo):打开即拉,失败只影响增强区
  const api = useUnraidApi();
  const pro = usePro();
  const [info, setInfo] = useState<VmInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    if (!pro || !api) return;
    let cancelled = false;
    setInfoLoading(true);
    setInfoError(null);
    api
      .getVmInfo(vm.name)
      .then((r) => {
        if (cancelled) return;
        if (r.success && r.data) {
          setInfo(r.data);
        } else {
          setInfoError(r.error || '获取增强信息失败');
        }
      })
      .catch(() => {
        if (!cancelled) setInfoError('获取增强信息失败');
      })
      .finally(() => {
        if (!cancelled) setInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pro, api, vm.name]);

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

      {/* 基本信息(免费) */}
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

      {/* 【续 101】增强详情(Pro 门控) */}
      {!pro ? (
        <div className="flex justify-center">
          <ProGateButton
            label="增强详情(CPU/内存/磁盘/网络/直通/快照)"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
          />
        </div>
      ) : infoLoading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          加载增强信息…
        </p>
      ) : infoError ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-200">
          增强信息不可用:{infoError}
        </div>
      ) : info ? (
        <div className="space-y-3 text-sm">
          <Section title="CPU / 内存">
            {info.vcpus != null && <Row label="vCPU">{info.vcpus}</Row>}
            {info.memory && (
              <Row label="内存">
                {formatMem(info.memory.current, info.memory.unit)} / 上限{' '}
                {formatMem(info.memory.max, info.memory.unit)}
              </Row>
            )}
            {info.autostart != null && (
              <Row label="开机自启">{info.autostart ? '启用' : '禁用'}</Row>
            )}
          </Section>

          {info.disks.length > 0 && (
            <Section title={`磁盘(${info.disks.length})`}>
              {info.disks.map((d, i) => (
                <Row key={i} label={d.dev ?? `disk${i + 1}`}>
                  {d.path ?? '—'}
                  {d.format ? ` · ${d.format}` : ''}
                  {d.bus ? ` · ${d.bus}` : ''}
                  {d.size != null ? ` · ${formatBytes(d.size)}` : ''}
                </Row>
              ))}
            </Section>
          )}

          {info.interfaces.length > 0 && (
            <Section title={`网络(${info.interfaces.length})`}>
              {info.interfaces.map((n, i) => (
                <Row key={i} label={n.bridge ?? n.type ?? `net${i + 1}`}>
                  {n.mac ?? '—'}
                  {n.model ? ` · ${n.model}` : ''}
                </Row>
              ))}
            </Section>
          )}

          {info.graphics && (
            <Section title="远程图形">
              <Row label={info.graphics.type?.toUpperCase() ?? '图形'}>
                {info.graphics.port ? `端口 ${info.graphics.port}` : ''}
                {info.graphics.autoport ? '(自动)' : ''}
                {info.graphics.listen ? ` · 监听 ${info.graphics.listen}` : ''}
              </Row>
            </Section>
          )}

          {info.hostDevices.length > 0 && (
            <Section title={`直通设备(${info.hostDevices.length})`}>
              {info.hostDevices.map((h, i) => (
                <Row key={i} label={h.type.toUpperCase()}>
                  {h.type === 'pci'
                    ? `${h.domain ?? ''}:${h.bus ?? ''}:${h.slot ?? ''}.${h.function ?? ''}`
                    : `${h.vendorId ?? '?'}:${h.productId ?? '?'}`}
                </Row>
              ))}
            </Section>
          )}

          {info.snapshots.length > 0 && (
            <Section title={`快照(${info.snapshots.length})`}>
              {info.snapshots.map((s) => (
                <Row key={s} label="快照">
                  {s}
                </Row>
              ))}
            </Section>
          )}
        </div>
      ) : null}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <Icon icon={Lightbulb} size={14} className="mt-0.5 shrink-0" />
          <span>
            VM 日志、CPU/MEM 实时监控、虚拟磁盘配置等信息需通过 unRAID WebGUI 查看(unRAID GraphQL
            API 不暴露这些字段)。
          </span>
        </div>
        {/* 【续 36-4】跳 WebGUI VM 页 */}
        {config?.baseUrl && (
          <a
            href={`${config.baseUrl.replace(/\/$/, '')}/Vms`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            <Icon icon={LinkIcon} size={12} />
            在 unRAID WebGUI 中打开
            <Icon icon={ExternalLink} size={12} />
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
