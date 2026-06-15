// 【续 50 B7】AuthErrorListener 测试
// 收到 unraid-auth-error → toast "鉴权失败" + 200ms 后跳 /settings;
// 1s 去重:graphql.ts(请求返 401 时)和 App.tsx(health 报告 401)会对同一次 401 各派一次,
// 窗口内只响应第一个,不双 toast、不双跳路由
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthErrorListener from './AuthErrorListener';

const { mockToastError, mockNavigate } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ error: mockToastError }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function dispatchAuthError() {
  window.dispatchEvent(
    new CustomEvent('unraid-auth-error', { detail: { reason: 'invalid-api-key' } })
  );
}

function renderListener() {
  return render(
    <MemoryRouter>
      <AuthErrorListener />
    </MemoryRouter>
  );
}

describe('AuthErrorListener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockToastError.mockClear();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('收到事件 → toast 鉴权失败 + 200ms 后跳 /settings', () => {
    renderListener();
    act(() => {
      dispatchAuthError();
    });
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError.mock.calls[0][0]).toContain('鉴权失败');
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('1s 窗口内重复事件去重:只 toast 一次、只跳一次', () => {
    renderListener();
    act(() => {
      dispatchAuthError(); // graphql.ts 派发
      dispatchAuthError(); // App.tsx health 报告 401 再派一次
    });
    expect(mockToastError).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('超过 1s 的再次 401 仍正常提示(去重不误伤后续真实失败)', () => {
    renderListener();
    act(() => {
      dispatchAuthError();
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      dispatchAuthError();
    });
    expect(mockToastError).toHaveBeenCalledTimes(2);
  });
});
