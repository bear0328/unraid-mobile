// 【阶段 P0-c - 2026-06-15 续 4】替换 window.confirm / window.alert
// 用法：
//   const dialog = useDialog()
//   if (!await dialog.confirm({ title: '...', message: '...', danger: true })) return
//   await dialog.alert({ title: '...', message: '...' })
//   <Dialog {...dialog} />
import { useCallback, useMemo, useState } from 'react';

type ConfirmOpts = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮变红 */
  danger?: boolean;
};

type AlertOpts = {
  title: string;
  message: string;
  okText?: string;
};

type DialogState =
  | {
      type: 'confirm';
      opts: Required<Omit<ConfirmOpts, 'danger'>> & { danger: boolean };
      resolve: (v: boolean) => void;
    }
  | { type: 'alert'; opts: Required<AlertOpts>; resolve: () => void };

export function useDialog() {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: ConfirmOpts): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        type: 'confirm',
        opts: {
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText ?? '确认',
          cancelText: opts.cancelText ?? '取消',
          danger: opts.danger ?? false,
        },
        resolve,
      });
    });
  }, []);

  const alert = useCallback((opts: AlertOpts): Promise<void> => {
    return new Promise<void>((resolve) => {
      setState({
        type: 'alert',
        opts: {
          title: opts.title,
          message: opts.message,
          okText: opts.okText ?? '知道了',
        },
        resolve,
      });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setState((prev) => {
      if (prev) {
        if (prev.type === 'confirm') prev.resolve(result);
        else prev.resolve();
      }
      return null;
    });
  }, []);

  return useMemo(() => ({ state, confirm, alert, close }), [state, confirm, alert, close]);
}
