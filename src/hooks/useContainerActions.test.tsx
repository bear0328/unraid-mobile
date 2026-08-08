// 【阶段 P2-3 - 2026-06-16 续 15】useContainerActions hook 测试
// 覆盖:handleContainerAction 成功(start/stop/restart)/ 失败 / handleVmAction 成功 / 失败 / 错误 3s 后清
// 【续 85】重启过程 toast:开始 info / 到达 success / 超时 warning / silent 不刷
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainerActions } from './useContainerActions';
import { useToastList } from './useToast';
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

  // ==== 【续 85】重启过程 toast 反馈 ====

  it('restart 成功发起 → info toast「开始重启」', async () => {
    const api = makeApi();
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart');
    });
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'info' && t.message === '开始重启「nginx」…'
      )
    ).toBe(true);
  });

  it('restart + silent → 不发 info toast(批量路径)', async () => {
    const api = makeApi();
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart', { silent: true });
    });
    expect(toasts.result.current.toasts.some((t) => t.type === 'info')).toBe(false);
    expect(result.current.restartingContainers.has('nginx')).toBe(true);
  });

  it('restart 后轮询到达 running → success toast + 清空等待', async () => {
    const api = makeApi();
    const ref = {
      current: SAMPLE_CONTAINERS.map((c) => ({ ...c })),
    } as React.MutableRefObject<UnraidDockerContainer[]>;
    // refresh 模拟容器已恢复 running
    const refresh = vi.fn().mockImplementation(async () => {
      ref.current = ref.current.map((c) =>
        c.containerId === 'nginx' ? { ...c, state: 'running' as const } : c
      );
    });
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() => useContainerActions(api, refresh, ref, vmsRefObj));
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart');
    });
    expect(result.current.restartingContainers.has('nginx')).toBe(true);
    // 推 1s+ 触发第一次轮询 → reached → onDone(true)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.restartingContainers.size).toBe(0);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'success' && t.message === '「nginx」重启完成'
      )
    ).toBe(true);
  });

  it('restart 轮询 30s 未恢复 → warning toast', async () => {
    const api = makeApi();
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart');
    });
    await act(async () => {
      vi.advanceTimersByTime(30500);
    });
    expect(result.current.restartingContainers.size).toBe(0);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'warning' && t.message.includes('超时')
      )
    ).toBe(true);
  });

  it('reboot 成功发起 → info toast「开始重启」', async () => {
    const api = makeApi();
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() =>
      useContainerActions(api, noopRefresh, containersRefObj, vmsRefObj)
    );
    await act(async () => {
      await result.current.handleVmAction('win11', 'reboot');
    });
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'info' && t.message === '开始重启「win11」…'
      )
    ).toBe(true);
  });

  // ==== 【续 88 2026-08-08】批量 restart 结算修正 ====
  // 原 find 只返回第一个等待容器,它一 running 就 onDone(true) 清空整个 set,
  // 其余未恢复的容器被误报"N 个容器已重启完成"

  const TWO_CONTAINERS: UnraidDockerContainer[] = [
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
    {
      id: 'c2',
      name: 'web',
      containerId: 'web',
      image: 'web:latest',
      state: 'stopped',
      status: 'Exited',
      created: '2026-06-15T12:00:00Z',
      ports: [],
    },
  ];

  it('批量 restart:所有等待容器都 running 才结算成功(部分恢复不清算)', async () => {
    const api = makeApi();
    const ref = {
      current: TWO_CONTAINERS.map((c) => ({ ...c })),
    } as React.MutableRefObject<UnraidDockerContainer[]>;
    // action 内的 refresh(第 1、2 次)不改状态;wait 轮询第 1 次 nginx 恢复、第 2 次 web 恢复
    let calls = 0;
    const refresh = vi.fn().mockImplementation(async () => {
      calls++;
      ref.current = ref.current.map((c) => {
        if (c.containerId === 'nginx' && calls >= 3) return { ...c, state: 'running' as const };
        if (c.containerId === 'web' && calls >= 4) return { ...c, state: 'running' as const };
        return c;
      });
    });
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() => useContainerActions(api, refresh, ref, vmsRefObj));
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart', { silent: true });
      await result.current.handleContainerAction('web', 'restart', { silent: true });
    });
    expect(result.current.restartingContainers.size).toBe(2);

    // 轮询第 1 次:nginx running / web 还 stopped → 不结算(修复前此处已清空 + 误报成功)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.restartingContainers.size).toBe(2);
    expect(toasts.result.current.toasts.some((t) => t.type === 'success')).toBe(false);

    // 轮询第 2 次:web 也 running → 全部到达 → 结算成功
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.restartingContainers.size).toBe(0);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'success' && t.message === '2 个容器已重启完成'
      )
    ).toBe(true);
  });

  it('批量 restart:部分超时按实际逐个统计(已恢复报成功,未恢复报警告)', async () => {
    const api = makeApi();
    const ref = {
      current: TWO_CONTAINERS.map((c) => ({ ...c })),
    } as React.MutableRefObject<UnraidDockerContainer[]>;
    // 只有 nginx 恢复 running,web 一直 stopped
    const refresh = vi.fn().mockImplementation(async () => {
      ref.current = ref.current.map((c) =>
        c.containerId === 'nginx' ? { ...c, state: 'running' as const } : c
      );
    });
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() => useContainerActions(api, refresh, ref, vmsRefObj));
    await act(async () => {
      await result.current.handleContainerAction('nginx', 'restart', { silent: true });
      await result.current.handleContainerAction('web', 'restart', { silent: true });
    });
    expect(result.current.restartingContainers.size).toBe(2);

    // 30s 超时:nginx 已恢复 / web 未恢复 → 1 成功 + 1 超时警告
    await act(async () => {
      vi.advanceTimersByTime(30500);
    });
    expect(result.current.restartingContainers.size).toBe(0);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'success' && t.message === '1 个容器已重启完成'
      )
    ).toBe(true);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'warning' && t.message === '1 个容器重启等待超时,未恢复运行,请手动确认'
      )
    ).toBe(true);
  });

  // 【续 88 2026-08-08】VM reboot 同款批量结算修正(与容器 restart 对齐)
  const TWO_VMS: UnraidVM[] = [
    { id: 'v1', name: 'win11', vmUuid: 'win11', state: 'STOPPED', uuid: 'win11' } as unknown as UnraidVM,
    { id: 'v2', name: 'ubuntu', vmUuid: 'ubuntu', state: 'STOPPED', uuid: 'ubuntu' } as unknown as UnraidVM,
  ];

  it('批量 reboot:所有等待 VM 都 RUNNING 才结算成功(部分恢复不清算)', async () => {
    const api = makeApi();
    const vref = {
      current: TWO_VMS.map((v) => ({ ...v })),
    } as React.MutableRefObject<UnraidVM[]>;
    // action 内的 refresh(第 1、2 次)不改状态;wait 轮询第 1 次 win11 恢复、第 2 次 ubuntu 恢复
    let calls = 0;
    const refresh = vi.fn().mockImplementation(async () => {
      calls++;
      vref.current = vref.current.map((v) => {
        if (v.vmUuid === 'win11' && calls >= 3) return { ...v, state: 'RUNNING' };
        if (v.vmUuid === 'ubuntu' && calls >= 4) return { ...v, state: 'RUNNING' };
        return v;
      });
    });
    const toasts = renderHook(() => useToastList());
    const { result } = renderHook(() => useContainerActions(api, refresh, containersRefObj, vref));
    await act(async () => {
      await result.current.handleVmAction('win11', 'reboot', { silent: true });
      await result.current.handleVmAction('ubuntu', 'reboot', { silent: true });
    });
    expect(result.current.rebootingVms.size).toBe(2);

    // 轮询第 1 次:win11 RUNNING / ubuntu 还 STOPPED → 不结算(修复前此处已清空 + 误报成功)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.rebootingVms.size).toBe(2);
    expect(toasts.result.current.toasts.some((t) => t.type === 'success')).toBe(false);

    // 轮询第 2 次:ubuntu 也 RUNNING → 全部到达 → 结算成功
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.rebootingVms.size).toBe(0);
    expect(
      toasts.result.current.toasts.some(
        (t) => t.type === 'success' && t.message === '2 个虚拟机已重启完成'
      )
    ).toBe(true);
  });
});
