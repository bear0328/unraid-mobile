// 【阶段 P2-3 - 2026-06-16 续 15】useContainerActions hook 测试
// 覆盖:handleContainerAction 成功(start/stop/restart)/ 失败 / handleVmAction 成功 / 失败 / 错误 3s 后清
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainerActions } from './useContainerActions';
import type { UnraidApiService, UnraidDockerContainer, UnraidVM } from '../services';

function makeApi(overrides: Partial<UnraidApiService> = {}): UnraidApiService {
  return {
    startContainer: vi.fn().mockResolvedValue({ success: true }),
    stopContainer: vi.fn().mockResolvedValue({ success: true }),
    restartContainer: vi.fn().mockResolvedValue({ success: true }),
    pauseContainer: vi.fn().mockResolvedValue({ success: true }),
    resumeContainer: vi.fn().mockResolvedValue({ success: true }),
    startVm: vi.fn().mockResolvedValue({ success: true }),
    stopVm: vi.fn().mockResolvedValue({ success: true }),
    pauseVm: vi.fn().mockResolvedValue({ success: true }),
    resumeVm: vi.fn().mockResolvedValue({ success: true }),
    rebootVm: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as unknown as UnraidApiService;
}

const SAMPLE_CONTAINERS: UnraidDockerContainer[] = [
  {
    id: 'c1',
    name: 'nginx',
    containerId: 'nginx',
    image: 'nginx:latest',
    state: 'stopped',
    status: 'Exited',
    created: '2026-06-15T12:00:00Z',
    ports: [],
  },
];

const SAMPLE_VMS: UnraidVM[] = [
  {
    id: 'v1',
    name: 'win11',
    vmUuid: 'win11',
    state: 'STOPPED',
    uuid: 'win11',
  } as unknown as UnraidVM,
];

const containersRefObj = { current: SAMPLE_CONTAINERS } as React.MutableRefObject<
  UnraidDockerContainer[]
>;
const vmsRefObj = { current: SAMPLE_VMS } as React.MutableRefObject<UnraidVM[]>;

const noopRefresh = async () => {};

describe('useContainerActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('api=null → handleContainerAction 不调任何东西', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(null, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'start');
    });
    expect(api.startContainer).not.toHaveBeenCalled();
  });

  it('handleContainerAction(start) 调 startContainer + refresh', async () => {
    const api = makeApi();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useContainerActions(api, refresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'start');
    });
    expect(api.startContainer).toHaveBeenCalledWith('c1');
    expect(refresh).toHaveBeenCalled();
  });

  it('handleContainerAction(stop) 调 stopContainer', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'stop');
    });
    expect(api.stopContainer).toHaveBeenCalledWith('c1');
  });

  it('handleContainerAction(pause/resume) 调对应方法', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'pause');
    });
    expect(api.pauseContainer).toHaveBeenCalledWith('c1');

    await act(async () => {
      await result.current.handleContainerAction('c1', 'resume');
    });
    expect(api.resumeContainer).toHaveBeenCalledWith('c1');
  });

  it('handleContainerAction 失败 → actionError 填充', async () => {
    const api = makeApi({
      startContainer: vi.fn().mockResolvedValue({ success: false, error: '权限不足' }),
    });
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'start');
    });
    expect(result.current.actionError).toBe('权限不足');
  });

  it('handleContainerAction 抛异常 → actionError=操作失败', async () => {
    const api = makeApi({
      startContainer: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'start');
    });
    expect(result.current.actionError).toBe('操作失败');
  });

  it('handleContainerAction(restart) 成功 → restartingContainers 加 id', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'restart');
    });
    // restart 路径:refresh 调 + setInterval 跑 + state 还在 restarting
    expect(api.restartContainer).toHaveBeenCalledWith('c1');
    expect(result.current.restartingContainers.has('c1')).toBe(true);
    // 推 30s timeout 让它自动从 restarting 移除(但 setInterval 还没检查到 running)
    await act(async () => {
      vi.advanceTimersByTime(30500);
    });
    expect(result.current.restartingContainers.has('c1')).toBe(false);
  });

  it('handleVmAction(start/stop/pause/resume) 调对应方法', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleVmAction('win11', 'start');
    });
    expect(api.startVm).toHaveBeenCalledWith('win11');

    await act(async () => {
      await result.current.handleVmAction('win11', 'stop');
    });
    expect(api.stopVm).toHaveBeenCalledWith('win11');

    await act(async () => {
      await result.current.handleVmAction('win11', 'pause');
    });
    expect(api.pauseVm).toHaveBeenCalledWith('win11');

    await act(async () => {
      await result.current.handleVmAction('win11', 'resume');
    });
    expect(api.resumeVm).toHaveBeenCalledWith('win11');
  });

  it('handleVmAction(reboot) 成功 → rebootingVms 加 id', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleVmAction('win11', 'reboot');
    });
    expect(api.rebootVm).toHaveBeenCalledWith('win11');
    expect(result.current.rebootingVms.has('win11')).toBe(true);
    // 推 30s timeout 清理
    await act(async () => {
      vi.advanceTimersByTime(30500);
    });
    expect(result.current.rebootingVms.has('win11')).toBe(false);
  });

  it('handleVmAction 失败 → actionError 填充', async () => {
    const api = makeApi({
      startVm: vi.fn().mockResolvedValue({ success: false, error: 'VM 已被占用' }),
    });
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleVmAction('win11', 'start');
    });
    expect(result.current.actionError).toBe('VM 已被占用');
  });

  it('actionError 3s 后自动清', async () => {
    const api = makeApi({
      startContainer: vi.fn().mockResolvedValue({ success: false, error: 'x' }),
    });
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('c1', 'start');
    });
    expect(result.current.actionError).toBe('x');

    // 推 3s
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(result.current.actionError).toBeNull();
  });

  it('api=null → handleVmAction 不调', async () => {
    const api = makeApi();
    const { result } = renderHook(() =>
      useContainerActions(null, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleVmAction('win11', 'start');
    });
    expect(api.startVm).not.toHaveBeenCalled();
  });

  // 【续 50 C2】批量操作按返回值计数,两个 action 函数必须返回真实成败
  it('handleContainerAction 返回 boolean:成功 true / success:false 返 false / 抛异常返 false', async () => {
    const apiOk = makeApi();
    const ok = renderHook(() => useContainerActions(apiOk, noopRefresh, containersRefObj, vmsRefObj));
    await act(async () => {
      expect(await ok.result.current.handleContainerAction('c1', 'start')).toBe(true);
    });

    const apiFail = makeApi({
      stopContainer: vi.fn().mockResolvedValue({ success: false, error: 'x' }),
    });
    const fail = renderHook(() =>
      useContainerActions(apiFail, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      expect(await fail.result.current.handleContainerAction('c1', 'stop')).toBe(false);
    });

    const apiThrow = makeApi({ startContainer: vi.fn().mockRejectedValue(new Error('boom')) });
    const thr = renderHook(() =>
      useContainerActions(apiThrow, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      expect(await thr.result.current.handleContainerAction('c1', 'start')).toBe(false);
    });
  });

  it('handleVmAction 返回 boolean:成功 true / 失败 false', async () => {
    const apiOk = makeApi();
    const ok = renderHook(() => useContainerActions(apiOk, noopRefresh, containersRefObj, vmsRefObj));
    await act(async () => {
      expect(await ok.result.current.handleVmAction('win11', 'start')).toBe(true);
    });

    const apiFail = makeApi({ stopVm: vi.fn().mockResolvedValue({ success: false, error: 'x' }) });
    const fail = renderHook(() =>
      useContainerActions(apiFail, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      expect(await fail.result.current.handleVmAction('win11', 'stop')).toBe(false);
    });
  });
});
