// 【续 90 2026-08-09】sharesSort 纯函数测试
// 覆盖:名称中英文混排 / 日期升降 / 大小升降 / 目录优先 / mtime=0 排尾 / LS 持久化读写
import { describe, it, expect, beforeEach } from 'vitest';
import type { FileItem } from '../components/shares/davAuth';
import {
  DEFAULT_SHARES_SORT,
  SHARES_SORT_LS_KEY,
  loadSharesSort,
  saveSharesSort,
  sortFileItems,
  sortRootShares,
} from './sharesSort';

function file(name: string, extra: Partial<FileItem> = {}): FileItem {
  return {
    name,
    path: `photos/${name}`,
    isDir: false,
    size: 0,
    mtime: 0,
    date: '',
    permissions: '',
    ...extra,
  };
}

function dir(name: string, extra: Partial<FileItem> = {}): FileItem {
  return file(name, { isDir: true, path: `photos/${name}/`, size: undefined, ...extra });
}

const names = (items: FileItem[]) => items.map((i) => i.name);

describe('sortFileItems', () => {
  it('名称升序:中英文混排(中文在前按拼音,英文在后按字母)', () => {
    const items = [file('香蕉.txt'), file('banana.txt'), file('苹果.txt'), file('apple.txt')];
    const sorted = sortFileItems(items, { key: 'name', dir: 'asc' });
    // ICU zh 排序:中文块在前且按拼音 苹果(ping) < 香蕉(xiang),英文块在后按字母
    expect(names(sorted)).toEqual(['苹果.txt', '香蕉.txt', 'apple.txt', 'banana.txt']);
  });

  it('名称降序:中英混排倒序', () => {
    const items = [file('apple.txt'), file('苹果.txt'), file('banana.txt'), file('香蕉.txt')];
    const sorted = sortFileItems(items, { key: 'name', dir: 'desc' });
    expect(names(sorted)).toEqual(['banana.txt', 'apple.txt', '香蕉.txt', '苹果.txt']);
  });

  it('修改日期升序/降序', () => {
    const items = [
      file('b.txt', { mtime: 200 }),
      file('a.txt', { mtime: 100 }),
      file('c.txt', { mtime: 300 }),
    ];
    expect(names(sortFileItems(items, { key: 'mtime', dir: 'asc' }))).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
    ]);
    expect(names(sortFileItems(items, { key: 'mtime', dir: 'desc' }))).toEqual([
      'c.txt',
      'b.txt',
      'a.txt',
    ]);
  });

  it('mtime=0(解析失败)按日期排序时排末尾(升序/降序都排尾)', () => {
    const items = [
      file('broken.txt', { mtime: 0 }),
      file('b.txt', { mtime: 200 }),
      file('a.txt', { mtime: 100 }),
    ];
    expect(names(sortFileItems(items, { key: 'mtime', dir: 'asc' }))).toEqual([
      'a.txt',
      'b.txt',
      'broken.txt',
    ]);
    expect(names(sortFileItems(items, { key: 'mtime', dir: 'desc' }))).toEqual([
      'b.txt',
      'a.txt',
      'broken.txt',
    ]);
  });

  it('大小升序/降序(size 缺省按 0)', () => {
    const items = [
      file('big.bin', { size: 3000 }),
      file('nosize.bin', { size: undefined }),
      file('small.bin', { size: 10 }),
    ];
    expect(names(sortFileItems(items, { key: 'size', dir: 'asc' }))).toEqual([
      'nosize.bin',
      'small.bin',
      'big.bin',
    ]);
    expect(names(sortFileItems(items, { key: 'size', dir: 'desc' }))).toEqual([
      'big.bin',
      'small.bin',
      'nosize.bin',
    ]);
  });

  it('目录永远排文件前,排序只在同类内生效(按大小排也不混杂)', () => {
    const items = [
      file('zzz.txt', { size: 1 }),
      dir('bbb'),
      file('aaa.txt', { size: 9999 }),
      dir('aaa'),
    ];
    const sorted = sortFileItems(items, { key: 'size', dir: 'desc' });
    // 目录块在前且目录间也按规则排(size 都缺省 → 名称兜底),文件块在后
    expect(names(sorted)).toEqual(['aaa', 'bbb', 'aaa.txt', 'zzz.txt']);
  });

  it('不改动原数组', () => {
    const items = [file('b.txt'), file('a.txt')];
    const snapshot = [...items];
    sortFileItems(items, { key: 'name', dir: 'asc' });
    expect(items).toEqual(snapshot);
  });
});

describe('sortRootShares', () => {
  const shares = [
    dir('movies', { size: 8000, free: 2000 }),
    dir('appdata', { size: 500, free: 9500 }),
    dir('photos', { size: 3000, free: 7000 }),
  ];

  it('名称升序(默认)', () => {
    expect(names(sortRootShares(shares, { key: 'name', dir: 'asc' }))).toEqual([
      'appdata',
      'movies',
      'photos',
    ]);
  });

  it('已用(size 即 used)降序', () => {
    expect(names(sortRootShares(shares, { key: 'used', dir: 'desc' }))).toEqual([
      'movies',
      'photos',
      'appdata',
    ]);
  });

  it('剩余(free)升序', () => {
    expect(names(sortRootShares(shares, { key: 'free', dir: 'asc' }))).toEqual([
      'movies',
      'photos',
      'appdata',
    ]);
  });
});

describe('LS 持久化', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('无数据 → 返回默认(名称升序)', () => {
    expect(loadSharesSort()).toEqual(DEFAULT_SHARES_SORT);
  });

  it('save → load 往返一致', () => {
    const state = {
      file: { key: 'size', dir: 'desc' },
      share: { key: 'free', dir: 'asc' },
    } as const;
    saveSharesSort(state);
    expect(localStorage.getItem(SHARES_SORT_LS_KEY)).toBe(JSON.stringify(state));
    expect(loadSharesSort()).toEqual(state);
  });

  it('损坏 JSON → 回退默认', () => {
    localStorage.setItem(SHARES_SORT_LS_KEY, '{oops');
    expect(loadSharesSort()).toEqual(DEFAULT_SHARES_SORT);
  });

  it('非法 key/dir → 对应段回退默认,合法段保留', () => {
    localStorage.setItem(
      SHARES_SORT_LS_KEY,
      JSON.stringify({
        file: { key: 'bogus', dir: 'asc' },
        share: { key: 'used', dir: 'desc' },
      })
    );
    expect(loadSharesSort()).toEqual({
      file: DEFAULT_SHARES_SORT.file,
      share: { key: 'used', dir: 'desc' },
    });
  });
});
