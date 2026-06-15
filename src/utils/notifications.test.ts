// 【续 37-2】notifications 单元测试
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearNotifications,
  deleteNotification,
  getNotifications,
  markAllRead,
  markRead,
  pushNotification,
} from './notifications';

const KEY = 'unraid-mobile-notifications';

beforeEach(() => {
  localStorage.clear();
});

describe('notifications 基础 CRUD', () => {
  it('空时返回空数组', () => {
    expect(getNotifications()).toEqual([]);
  });

  it('push 后能读出', () => {
    pushNotification({ kind: 'container', title: 'a' });
    const arr = getNotifications();
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('a');
    expect(arr[0].read).toBe(false);
    expect(arr[0].id).toBeTruthy();
    expect(arr[0].ts).toBeGreaterThan(0);
  });

  it('markRead 单条', () => {
    const n = pushNotification({ kind: 'container', title: 'a' });
    markRead(n.id);
    expect(getNotifications()[0].read).toBe(true);
  });

  it('markAllRead', () => {
    pushNotification({ kind: 'container', title: 'a' });
    pushNotification({ kind: 'error', title: 'b' });
    markAllRead();
    expect(getNotifications().every((n) => n.read)).toBe(true);
  });

  it('delete 单条', () => {
    const n = pushNotification({ kind: 'container', title: 'a' });
    pushNotification({ kind: 'error', title: 'b' });
    deleteNotification(n.id);
    expect(getNotifications()).toHaveLength(1);
    expect(getNotifications()[0].title).toBe('b');
  });

  it('clear 清空', () => {
    pushNotification({ kind: 'container', title: 'a' });
    clearNotifications();
    expect(getNotifications()).toEqual([]);
  });
});

describe('push 顺序与容量', () => {
  it('最新在前面', () => {
    pushNotification({ kind: 'container', title: 'old' });
    pushNotification({ kind: 'container', title: 'new' });
    const arr = getNotifications();
    expect(arr[0].title).toBe('new');
    expect(arr[1].title).toBe('old');
  });

  it('超过 200 自动裁掉最早的', () => {
    for (let i = 0; i < 210; i++) {
      pushNotification({ kind: 'system', title: `n${i}` });
    }
    const arr = getNotifications();
    expect(arr).toHaveLength(200);
    expect(arr[0].title).toBe('n209');
  });
});

describe('LS 损坏回退', () => {
  it('损坏 JSON 时返回空数组', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getNotifications()).toEqual([]);
  });

  it('非数组结构时返回空数组', () => {
    localStorage.setItem(KEY, '{"a":1}');
    expect(getNotifications()).toEqual([]);
  });
});
