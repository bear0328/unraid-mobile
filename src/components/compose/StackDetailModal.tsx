// 【续 47 2026-07-19】Compose 栈详情弹窗
// 功能: 状态展示 / up·down·restart(同步) / pull·rebuild(异步,轮询日志)
//       autostart 开关 / compose.yaml 查看 + 编辑保存(后端校验失败自动回滚)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ModalHeader } from '../Modal';
import { useToast } from '../../hooks/useToast';
import {
  getStack,
  getStackLog,
  saveComposeYaml,
  setAutostart,
  stackAction,
  ComposeApiError,
  type ComposeOp,
  type ComposeStackDetail,
} from '../../services/composeApi';

const OP_LABEL: Record<ComposeOp, string> = {
  up: '启动',
  down: '停止',
  restart: '重启',
  pull: '拉取镜像',
  rebuild: '重建',
};

/** down / rebuild 有破坏性,执行前确认(持久确认条,见下) */
const NEED_CONFIRM: ReadonlySet<ComposeOp> = new Set(['down', 'rebuild']);
/** 确认条文案 */
const CONFIRM_TEXT: Record<string, string> = {
  down: '停止后该栈所有容器将被删除(数据卷保留)',
  rebuild: '重建将强制重新创建该栈所有容器',
};

/** 【续 50 C7】异步操作轮询上限:90 次 × 2s = 3min,后端异常(.op-running 残留)时不再无限轮询 */
const MAX_POLL_ATTEMPTS = 90;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  /** null = 关闭 */
  stackName: string | null;
  onClose: () => void;
  /** 操作完成后通知父级刷新列表 */
  onChanged: () => void;
}

export default function StackDetailModal({ stackName, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<ComposeStackDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<ComposeOp | null>(null);
  const [editing, setEditing] = useState(false);
  const [editYaml, setEditYaml] = useState('');
  const [saving, setSaving] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  // 【续 47.2 2026-07-19】持久确认条:点破坏性操作 → 弹确认横幅,不自动消失,
  // 点「确认执行」或「取消」才结束。取代 47.1 的 3s 两段式 — 计时窗口对自动化
  // (Hermes 两次点击间隔 >3s 永远只是"第一次点")和真人都不友好,持久条零竞态
  const [confirmOp, setConfirmOp] = useState<ComposeOp | null>(null);
  const toast = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearConfirm = useCallback(() => {
    setConfirmOp(null);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async (name: string) => {
    try {
      const d = await getStack(name);
      setDetail(d);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  // 打开时加载;关闭时清理所有状态
  useEffect(() => {
    if (stackName) {
      setDetail(null);
      setLoadError(null);
      setEditing(false);
      setBusyOp(null);
      clearConfirm();
      void load(stackName);
    } else {
      stopPolling();
      clearConfirm();
    }
    return () => {
      stopPolling();
      clearConfirm();
    };
  }, [stackName, load, stopPolling, clearConfirm]);

  /** 异步操作(pull/rebuild):2s 轮询日志直到 .op-running 消失 */
  const startAsyncPolling = useCallback(
    (name: string, op: ComposeOp) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(() => {
        void (async () => {
          // 【续 50 C7】轮询上限:超时停止并报错,不再只靠关弹窗才停
          attempts += 1;
          if (attempts > MAX_POLL_ATTEMPTS) {
            stopPolling();
            setBusyOp(null);
            toast.error(`${OP_LABEL[op]}超时:3 分钟仍未结束,请刷新确认栈状态`);
            void load(name);
            onChanged();
            return;
          }
          try {
            const { log, running } = await getStackLog(name);
            setDetail((prev) => (prev ? { ...prev, lastCmdLog: log, opRunning: running } : prev));
            if (!running) {
              stopPolling();
              setBusyOp(null);
              // 【续 50 C7】?action=log 只回 {log, running},成败要看 stack.lastResult:
              // 后端异步命令先写 last_result.json 再删 .op-running,故此时读到的必是本次结果。
              // 不再无条件报成功 — pull 失败也弹"完成"的 bug 修这里
              try {
                const d = await getStack(name);
                setDetail(d);
                setLoadError(null);
                const lr = d.stack.lastResult;
                if (lr && lr.operation === op) {
                  if (lr.result === 'success') {
                    toast.success(`${OP_LABEL[op]}完成`);
                  } else {
                    // 后端无错误消息字段,取日志最后一行非空行作错误摘要
                    const lastLine =
                      d.lastCmdLog
                        .split('\n')
                        .filter((l) => l.trim())
                        .pop() ?? '';
                    const summary =
                      lastLine.length > 120 ? `${lastLine.slice(0, 120)}…` : lastLine;
                    toast.error(
                      `${OP_LABEL[op]}失败(exit ${lr.exit_code})${summary ? `: ${summary}` : ''}`
                    );
                  }
                } else {
                  toast.info(`${OP_LABEL[op]}已结束,请查看日志确认结果`);
                }
              } catch {
                toast.info(`${OP_LABEL[op]}已结束,请查看日志确认结果`);
              }
              onChanged();
            }
          } catch {
            // 轮询失败下轮再试
          }
        })();
      }, 2000);
    },
    [load, onChanged, stopPolling, toast]
  );

  const handleOp = useCallback(
    async (op: ComposeOp) => {
      if (!stackName || busyOp) return;
      // 破坏性操作先进确认态(持久确认条),确认条/按钮第二点才真正执行
      if (NEED_CONFIRM.has(op) && confirmOp !== op) {
        setConfirmOp(op);
        return;
      }
      clearConfirm();
      setBusyOp(op);
      try {
        const result = await stackAction(stackName, op);
        if (result.async) {
          toast.info(`${OP_LABEL[op]}已开始,后台执行中…`);
          setDetail((prev) => (prev ? { ...prev, opRunning: true } : prev));
          startAsyncPolling(stackName, op);
        } else if (result.exitCode === 0) {
          toast.success(`${OP_LABEL[op]}成功`);
          setBusyOp(null);
          void load(stackName);
          onChanged();
        } else {
          toast.error(`${OP_LABEL[op]}失败(exit ${result.exitCode}),见下方日志`);
          setBusyOp(null);
          void load(stackName);
          onChanged();
        }
      } catch (err) {
        setBusyOp(null);
        toast.error(err instanceof ComposeApiError ? err.message : `${OP_LABEL[op]}请求失败`);
      }
    },
    [stackName, busyOp, confirmOp, clearConfirm, load, onChanged, startAsyncPolling, toast]
  );

  const handleAutostart = useCallback(async () => {
    if (!stackName || !detail || autostartBusy) return;
    setAutostartBusy(true);
    try {
      const next = !detail.stack.autostart;
      await setAutostart(stackName, next);
      setDetail((prev) =>
        prev ? { ...prev, stack: { ...prev.stack, autostart: next } } : prev
      );
      toast.success(next ? '已开启自动启动' : '已关闭自动启动');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'autostart 设置失败');
    } finally {
      setAutostartBusy(false);
    }
  }, [stackName, detail, autostartBusy, onChanged, toast]);

  const handleSave = useCallback(async () => {
    if (!stackName || saving) return;
    setSaving(true);
    try {
      await saveComposeYaml(stackName, editYaml);
      toast.success('compose.yaml 已保存(校验通过)');
      setEditing(false);
      void load(stackName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [stackName, saving, editYaml, load, toast]);

  const stack = detail?.stack;
  const opRunning = detail?.opRunning ?? false;

  return (
    <Modal open={stackName !== null} onClose={onClose} maxWidthClass="max-w-lg" title="栈详情">
      <ModalHeader
        title={stackName ?? ''}
        onClose={onClose}
        subtitle={
          stack ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {stack.project}
              {stack.composeFile ? ` · ${stack.composeFile}` : ''}
            </span>
          ) : undefined
        }
      />

      {loadError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          {loadError}
        </div>
      )}
      {!detail && !loadError && (
        <div className="text-center text-gray-400 text-sm py-6 animate-pulse">加载中…</div>
      )}

      {detail && stack && (
        <>
          {/* 状态 + autostart */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  stack.running ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-gray-700 dark:text-gray-200">
                {stack.status ?? '未运行'}
              </span>
            </div>
            <button
              onClick={() => void handleAutostart()}
              disabled={autostartBusy}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                stack.autostart
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}
              aria-label="切换自动启动"
            >
              {stack.autostart ? '🔁 自动启动: 开' : '🔁 自动启动: 关'}
            </button>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-2">
            {(['up', 'down', 'restart', 'pull', 'rebuild'] as ComposeOp[]).map((op) => (
              <button
                key={op}
                onClick={() => void handleOp(op)}
                disabled={busyOp !== null || opRunning}
                className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  confirmOp === op
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : op === 'up'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : op === 'down'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                {busyOp === op ? '⏳ ' : ''}
                {confirmOp === op ? `确认${OP_LABEL[op]}?` : OP_LABEL[op]}
              </button>
            ))}
            <button
              onClick={() => stackName && void load(stackName)}
              className="px-2 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
            >
              🔄 刷新
            </button>
          </div>

          {/* 【续 47.2】破坏性操作确认条:持久显示,不自动消失 */}
          {confirmOp && (
            <div
              className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-2.5"
              data-testid="op-confirm-banner"
            >
              <span className="flex-1 min-w-0 text-xs text-orange-700 dark:text-orange-300">
                ⚠️ {CONFIRM_TEXT[confirmOp]},确定要{OP_LABEL[confirmOp]}「{stack.name}」吗?
              </span>
              <button
                onClick={() => void handleOp(confirmOp)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              >
                确认执行
              </button>
              <button
                onClick={clearConfirm}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 shrink-0"
              >
                取消
              </button>
            </div>
          )}

          {/* 上次操作结果 */}
          {stack.lastResult && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              上次操作: {stack.lastResult.operation}{' '}
              <span className={stack.lastResult.result === 'success' ? 'text-green-600' : 'text-red-600'}>
                {stack.lastResult.result === 'success' ? '✓ 成功' : `✗ 失败(${stack.lastResult.exit_code})`}
              </span>{' '}
              · {formatTime(stack.lastResult.timestamp)}
            </div>
          )}

          {/* compose.yaml 查看 / 编辑 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">compose.yaml</h4>
              {!editing ? (
                <button
                  onClick={() => {
                    setEditYaml(detail.composeYaml);
                    setEditing(true);
                  }}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  ✏️ 编辑
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '保存中…' : '💾 保存'}
                  </button>
                </div>
              )}
            </div>
            {editing ? (
              <textarea
                value={editYaml}
                onChange={(e) => setEditYaml(e.target.value)}
                spellCheck={false}
                className="w-full h-56 font-mono text-xs p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="编辑 compose.yaml"
              />
            ) : (
              <pre className="max-h-48 overflow-auto font-mono text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                {detail.composeYaml || '(空)'}
              </pre>
            )}
            {detail.overrideYaml && !editing && (
              <details className="mt-1.5">
                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  override 文件
                </summary>
                <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                  {detail.overrideYaml}
                </pre>
              </details>
            )}
          </div>

          {/* 操作日志 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              操作日志{opRunning ? '(执行中…)' : ''}
            </h4>
            <pre className="max-h-40 overflow-auto font-mono text-[11px] p-2.5 rounded-lg bg-gray-900 text-gray-200 whitespace-pre-wrap break-all">
              {detail.lastCmdLog || '(暂无日志)'}
            </pre>
          </div>
        </>
      )}
    </Modal>
  );
}
