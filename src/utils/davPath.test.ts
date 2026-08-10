// 【续 103 2026-08-10】encodeDavPath 单测
import { describe, it, expect } from 'vitest';
import { encodeDavPath } from './davPath';

describe('encodeDavPath', () => {
  it('纯 ASCII 路径原样返回', () => {
    expect(encodeDavPath('photos/bear.jpg')).toBe('photos/bear.jpg');
  });

  it('目录尾斜杠保留', () => {
    expect(encodeDavPath('photos/subdir/')).toBe('photos/subdir/');
  });

  it('空串/根斜杠', () => {
    expect(encodeDavPath('')).toBe('');
    expect(encodeDavPath('/')).toBe('/');
  });

  it('连续斜杠的空段被滤掉', () => {
    expect(encodeDavPath('a//b')).toBe('a/b');
  });

  it('中文名编码', () => {
    expect(encodeDavPath('photos/中文.txt')).toBe('photos/%E4%B8%AD%E6%96%87.txt');
  });

  it('# 编码为 %23,不再被 fragment 截断', () => {
    expect(encodeDavPath('dir/a#b.txt')).toBe('dir/a%23b.txt');
  });

  it('? % 空格 均转义', () => {
    expect(encodeDavPath('a?b')).toBe('a%3Fb');
    expect(encodeDavPath('100%.txt')).toBe('100%25.txt');
    expect(encodeDavPath('my file.txt')).toBe('my%20file.txt');
  });

  it('文件名含 %41 字面量 → % 转义为 %25,不会误解码成 A', () => {
    // 真实文件叫 "100%41.txt"(nginx href 为 100%2541.txt,解析解码回 100%41.txt)
    // 再编码必须回到 100%2541.txt,双程一致
    expect(encodeDavPath('100%41.txt')).toBe('100%2541.txt');
  });

  it('前导斜杠段被滤掉(相对路径语义)', () => {
    expect(encodeDavPath('/a/b')).toBe('a/b');
  });
});
