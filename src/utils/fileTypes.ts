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

// 【批 D 图标】视频/音频/压缩包扩展名识别(FileRow 行首图标映射用)
const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'wmv', 'flv', 'ts'];
const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus'];
const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'];

function hasExt(name: string, exts: string[]): boolean {
  const ext = name.toLowerCase().split('.').pop() || '';
  return exts.includes(ext);
}

export function isVideoFile(name: string): boolean {
  return hasExt(name, VIDEO_EXTS);
}

export function isAudioFile(name: string): boolean {
  return hasExt(name, AUDIO_EXTS);
}

export function isArchiveFile(name: string): boolean {
  return hasExt(name, ARCHIVE_EXTS);
}

export function getImageMime(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() || '';
  return IMAGE_MIME[ext] || null;
}
