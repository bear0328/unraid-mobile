// 【阶段 P2-9 - 2026-06-16 续 21】fileTypes 工具测试
// 覆盖:isImageFile 扩展名识别 / getImageMime MIME 推断 / 大小写不敏感
import { describe, it, expect } from 'vitest';
import { isImageFile, getImageMime } from './fileTypes';

describe('isImageFile', () => {
  it('常见图片扩展名 → true', () => {
    expect(isImageFile('bear.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
    expect(isImageFile('icon.png')).toBe(true);
    expect(isImageFile('anim.gif')).toBe(true);
    expect(isImageFile('pic.webp')).toBe(true);
    expect(isImageFile('logo.svg')).toBe(true);
    expect(isImageFile('bitmap.bmp')).toBe(true);
    expect(isImageFile('favicon.ico')).toBe(true);
    expect(isImageFile('modern.avif')).toBe(true);
  });

  it('非图片扩展名 → false', () => {
    expect(isImageFile('doc.pdf')).toBe(false);
    expect(isImageFile('archive.zip')).toBe(false);
    expect(isImageFile('script.js')).toBe(false);
    expect(isImageFile('video.mp4')).toBe(false);
  });

  it('大写扩展名 → 仍识别为图片', () => {
    expect(isImageFile('BEAR.JPG')).toBe(true);
    expect(isImageFile('Photo.PNG')).toBe(true);
  });

  it('无扩展名 → false', () => {
    expect(isImageFile('Makefile')).toBe(false);
    expect(isImageFile('')).toBe(false);
  });

  it('路径含子目录 → 仍识别扩展名', () => {
    expect(isImageFile('photos/2026/bear.jpg')).toBe(true);
    expect(isImageFile('docs/report.pdf')).toBe(false);
  });
});

describe('getImageMime', () => {
  it('jpg/jpeg → image/jpeg', () => {
    expect(getImageMime('a.jpg')).toBe('image/jpeg');
    expect(getImageMime('a.jpeg')).toBe('image/jpeg');
  });

  it('png/webp/gif 等 → 对应 MIME', () => {
    expect(getImageMime('a.png')).toBe('image/png');
    expect(getImageMime('a.webp')).toBe('image/webp');
    expect(getImageMime('a.gif')).toBe('image/gif');
    expect(getImageMime('a.svg')).toBe('image/svg+xml');
    expect(getImageMime('a.bmp')).toBe('image/bmp');
    expect(getImageMime('a.ico')).toBe('image/x-icon');
    expect(getImageMime('a.avif')).toBe('image/avif');
  });

  it('非图片扩展名 → null', () => {
    expect(getImageMime('doc.pdf')).toBeNull();
    expect(getImageMime('archive.zip')).toBeNull();
    expect(getImageMime('noext')).toBeNull();
  });

  it('大写不敏感', () => {
    expect(getImageMime('BEAR.JPG')).toBe('image/jpeg');
    expect(getImageMime('Photo.PNG')).toBe('image/png');
  });
});
