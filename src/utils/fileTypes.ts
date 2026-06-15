// 【阶段 P1-4b - 2026-06-15】文件类型工具
// 图片扩展名识别 + MIME 推断

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

export function isImageFile(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() || '';
  return IMAGE_EXTS.includes(ext);
}

export function getImageMime(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() || '';
  return IMAGE_MIME[ext] || null;
}
