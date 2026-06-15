// 【阶段 P2-性能告警 - 2026-06-17 续 34-4】性能预算告警开关
// 抽离自 PerformanceBudgetAlert.tsx 以避开 react-refresh/only-export-components
const STORAGE_KEY = 'unraid-mobile-perf-alert-enabled';

function isEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function setEnabled(v: boolean) {
  if (typeof localStorage === 'undefined') return;
  if (v) localStorage.setItem(STORAGE_KEY, 'true');
  else localStorage.removeItem(STORAGE_KEY);
}

export function setPerfAlertEnabled(v: boolean) {
  setEnabled(v);
}
export function getPerfAlertEnabled() {
  return isEnabled();
}
export function isPerfAlertEnabled() {
  return isEnabled();
}
