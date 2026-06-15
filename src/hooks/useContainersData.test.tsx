// 【阶段 P2-3 - 2026-06-16 续 15】useContainersData hook 测试
// 覆盖:enabled=true/false / api=null / refresh 调一次 / 失败 error / 手动 refresh / ref 同步
// 不测 polling 10s 周期:那是 usePolling 的责任(已 10 个测试覆盖),fake timers 会干扰 promise
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useContainersData } from './useContainersData';
import type { UnraidApiService, UnraidDockerContainer, UnraidVM } from '../services';

function makeApi(overrides: Partial<UnraidApiService> = {}): UnraidApiService {
  return {
    getDockerContainers: vi.fn().mockResolvedValue([] as UnraidDockerContainer[]),
    getVMs: vi.fn().mockResolvedValue([] as UnraidVM[]),
    ...overrides,
  } as unknown as UnraidApiService & {
    getDockerContainers: ReturnType<typeof vi.fn>;
    getVMs: ReturnType<typeof vi.fn>;
  };
}

const SAMPLE_CONTAINERS: UnraidDockerContainer[] = [
  {
    id: 'c1',
    name: 'nginx',
    containerId: 'container:nginx',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    created: '2026-06-15T12:00:00Z',
    ports: ['80:80'],
  },
];

const SAMPLE_VMS: UnraidVM[] = [
  {
    id: 'v1',
    name: 'win11',
    vmUuid: 'vm:win11',
    state: 'RUNNING',
    uuid: 'win11',
  } as unknown as UnraidVM,
];

describe('useContainersData', () => {
  it('enabled=true + api 配置 → refresh 调 getDockerContainers + getVMs,填充 state', async () => {
    const api = makeApi({
      getDockerContainers: vi.fn().mockResolvedValue(SAMPLE_CONTAINERS),
      getVMs: vi.fn().mockResolvedValue(SAMPLE_VMS),
    });
    const { result } = renderHook(() => useContainersData(api, true));

    await waitFor(() => {
      expect(result.current.containers).toHaveLength(1);
    });
    expect(result.current.containers[0].name).toBe('nginx');
    expect(result.current.vms[0].name).toBe('win11');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.getDockerContainers).toHaveBeenCalled();
    expect(api.getVMs).toHaveBeenCalled();
  });

  it('enabled=false → 不调 refresh', async () => {
    const api = makeApi();
    const { result } = renderHook(() => useContainersData(api, false));

    // 等 effect 跑(usePolling 在 enabled=false 时不调 callback)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(api.getDockerContainers).not.toHaveBeenCalled();
    expect(api.getVMs).not.toHaveBeenCalled();
    expect(result.current.containers).toEqual([]);
  });

  it('api=null → 不调 refresh', async () => {
    const { result } = renderHook(() => useContainersData(null, true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.containers).toEqual([]);
  });

  it('refresh 失败 → error 填充', async () => {
    const api = makeApi({
      getDockerContainers: vi.fn().mockRejectedValue(new Error('network')),
    });
    const { result } = renderHook(() => useContainersData(api, true));

    await waitFor(() => {
      expect(result.current.error).toBe('无法连接到 unRAID 服务器');
    });
    expect(result.current.loading).toBe(false);
  });

  it('refresh() 暴露给外部可手动调', async () => {
    const getDockerContainers = vi.fn().mockResolvedValue(SAMPLE_CONTAINERS);
    const api = makeApi({ getDockerContainers });
    const { result } = renderHook(() => useContainersData(api, true));

    await waitFor(() => {
      expect(result.current.containers).toHaveLength(1);
    });
    const initialCalls = getDockerContainers.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(getDockerContainers.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('containersRef/vmsRef 始终指向最新 state', async () => {
    const api = makeApi({
      getDockerContainers: vi.fn().mockResolvedValue(SAMPLE_CONTAINERS),
    });
    const { result } = renderHook(() => useContainersData(api, true));

    await waitFor(() => {
      expect(result.current.containers).toHaveLength(1);
    });
    expect(result.current.containersRef.current).toEqual(SAMPLE_CONTAINERS);
    expect(result.current.vmsRef.current).toEqual([]);
  });
});
