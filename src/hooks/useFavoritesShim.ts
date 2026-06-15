// 【阶段 P2-备份 - 2026-06-17 续 34-1】薄包装,避免 backup.ts 循环 import useFavorites.ts
// 直接读 LS
export function getFavorites(): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('unraid-mobile-favorites');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
