// 【阶段 P1-3 - 2026-06-15 续 9】读取/清空/删除前端错误
// 基于 errorReporter 的订阅机制，组件卸载自动退订
import { useEffect, useMemo, useState } from 'react';
import {
  type ErrorRecord,
  clearErrors,
  deleteError,
  getErrors,
  subscribe,
} from '../utils/errorReporter';

export function useErrors() {
  const [errors, setErrors] = useState<ErrorRecord[]>(() => getErrors());

  useEffect(() => {
    return subscribe(setErrors);
  }, []);

  return useMemo(
    () => ({
      errors,
      count: errors.length,
      clear: clearErrors,
      remove: deleteError,
    }),
    [errors]
  );
}
