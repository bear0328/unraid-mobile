// 【续 50 B6】useContainerEventWatcher 方向过滤测试
// 只在"容器停止"(prev=running → 当前非 running)时 webhook + 通知:
// - 启动(stopped→running)不通知(旧行为会误报"容器停止")
// - healthy↔unhealthy 波动(normalize 后 state 恒 running,见 normalizers.test.ts)不通知
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainerEventWatcher } from './useContainerEventWatcher';
import { sendWebhook } from '../utils/webhook';
import { pushNotification } from '../utils/notifications';
import type { UnraidDockerContainer } from '../services';

const mocks = vi.hoisted(() => ({
  getDockerContainers: vi.fn(),
}));

vi.mock('./useUnraidApi', () => ({
  useUnraidApi: () => ({ getDockerContainers: mocks.getDockerContainers }),
  useApiConfig: () => ({ isConfigured: true, config: { serverUrl: 'http://x', apiKey: 'k' } }),
}));

// mock 1s 轮询间隔,但【续 73】容器轮询有 60s 地板(CONTAINER_POLL_FLOOR_MS),
// 实际 pollMs = max(1000, 60000) = 60s,fake timers 按 60s 推进
vi.mock('./usePollInterval', () => ({
  usePollInterval: () => 1000,
}));

vi.mock('../utils/webhook', () => ({
  useWebhookConfig: () => [
    { provider: 'bark', url: 'http://hook', enabled: true, template: '{{container}} {{state}}' },
    vi.fn(),
  ],
  sendWebhook: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/notifications', () => ({
  pushNotification: vi.fn(),
}));

function container(
  name: string,
  state: UnraidDockerContainer['state'],
  status = ''
): UnraidDockerContainer {
  return {
    id: name,
    name,
    containerId: `container:${name}`,
    image: 'img',
    state,
    status,
    created: '',
    ports: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  mocks.getDockerContainers.mockReset();
  vi.mocked(sendWebhook).mockClear();
  vi.mocked(pushNotification).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useContainerEventWatcher (续 50 B6 方向过滤)', () => {
  it('启动事件(stopped→running)不通知', async () => {
    mocks.getDockerContainers
      .mockResolvedValueOnce([container('a', 'exited')])
      .mockResolvedValueOnce([container('a', 'running')]);
    renderHook(() => useContainerEventWatcher());
    // mount tick:建立 baseline(exited)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 第 2 次 tick:exited → running(启动)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.getDockerContainers).toHaveBeenCalledTimes(2);
    expect(sendWebhook).not.toHaveBeenCalled();
    expect(pushNotification).not.toHaveBeenCalled();
  });

  it('running→stopped 触发 webhook + 通知', async () => {
    mocks.getDockerContainers
      .mockResolvedValueOnce([container('a', 'running')])
      .mockResolvedValueOnce([container('a', 'exited')]);
    renderHook(() => useContainerEventWatcher());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(sendWebhook).toHaveBeenCalledTimes(1);
    expect(pushNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushNotification).mock.calls[0][0].title).toContain('容器停止');
  });

  it('healthy↔unhealthy 波动(state 恒 running)不通知', async () => {
    mocks.getDockerContainers
      .mockResolvedValueOnce([container('a', 'running', 'Up 2 hours (healthy)')])
      .mockResolvedValueOnce([container('a', 'running', 'Up 2 hours (unhealthy)')])
      .mockResolvedValueOnce([container('a', 'running', 'Up 2 hours (healthy)')]);
    renderHook(() => useContainerEventWatcher());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 2 次 tick:status 在 healthy/unhealthy 间波动,state 始终 running
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(mocks.getDockerContainers).toHaveBeenCalledTimes(3);
    expect(sendWebhook).not.toHaveBeenCalled();
    expect(pushNotification).not.toHaveBeenCalled();
  });
});
