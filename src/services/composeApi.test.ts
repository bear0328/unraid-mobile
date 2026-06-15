// 【续 47 2026-07-19】composeApi service 单元测试
// 覆盖: 鉴权 header / list 解析 / 错误响应(401 + ok:false) / 非 JSON 响应 /
//       POST body / PUT raw body / 未配置
// 【续 50 C-补充】补充: fetch 超时(15s/60s) / HTTP 200 + {ok:false} 语义
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStacks,
  getCpuTemp,
  stackAction,
  saveComposeYaml,
  ComposeApiError,
} from './composeApi';

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('unraid-mobile-server-url', 'http://test');
  localStorage.setItem('unraid-mobile-api-key', 'secret-key');
  vi.restoreAllMocks();
});

describe('composeApi', () => {
  it('getStacks: 带 X-Api-Key 请求 /compose-api/?action=list 并返回 data', async () => {
    const stacks = [{ name: 'emby', running: true }];
    const spy = mockFetchOnce(200, { ok: true, data: stacks });
    const result = await getStacks();
    expect(result).toEqual(stacks);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/compose-api/?action=list');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('401 + ok:false → 抛 ComposeApiError(status=401, message=后端 error)', async () => {
    mockFetchOnce(401, { ok: false, error: '未授权: X-Api-Key 无效' });
    const err = await getStacks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ComposeApiError);
    expect((err as ComposeApiError).status).toBe(401);
    expect((err as ComposeApiError).message).toBe('未授权: X-Api-Key 无效');
  });

  it('非 JSON 响应(nginx 错误页)→ 抛 ComposeApiError', async () => {
    mockFetchOnce(502, '<html>Bad Gateway</html>');
    const err = await getStacks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ComposeApiError);
    expect((err as ComposeApiError).status).toBe(502);
  });

  it('未配置 apiKey → 抛 status=0,不发请求', async () => {
    localStorage.removeItem('unraid-mobile-api-key');
    const spy = vi.spyOn(globalThis, 'fetch');
    const err = await getStacks().catch((e: unknown) => e);
    expect((err as ComposeApiError).status).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stackAction: PUT JSON body {action, name}(POST 被 webGui CSRF prepend 拦,写操作走 PUT)', async () => {
    const spy = mockFetchOnce(200, { ok: true, data: { exitCode: 0, output: 'done' } });
    const result = await stackAction('emby', 'up');
    expect(result.exitCode).toBe(0);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'up', name: 'emby' });
  });

  it('saveComposeYaml: PUT raw body,name 进 query', async () => {
    const spy = mockFetchOnce(200, { ok: true, data: { saved: true, file: 'compose.yaml' } });
    await saveComposeYaml('ms-go', 'services:\n  app:\n    image: x\n');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/compose-api/?name=ms-go');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('services:\n  app:\n    image: x\n');
  });

  // 【续 50 C-补充】HTTP 200 但 body {ok:false}:仍抛错,message 取后端 error 字段
  it('HTTP 200 但 body {ok:false} → 抛 ComposeApiError,message 取 body.error', async () => {
    mockFetchOnce(200, { ok: false, error: '栈不存在' });
    const err = await getStacks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ComposeApiError);
    expect((err as ComposeApiError).message).toBe('栈不存在');
  });

  // 【续 50 C-补充】读请求 15s 超时:mock fetch 永不 resolve,手动触发 abort 模拟到点
  it('后端 hang 住 → AbortSignal.timeout(15000) 到点,抛 ComposeApiError(请求超时)', async () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation timed out.', 'TimeoutError'));
          });
        })
    );
    const promise = getStacks();
    controller.abort(); // 模拟 15s 超时到点(真实环境由 AbortSignal.timeout 触发)
    const err = await promise.catch((e: unknown) => e);
    expect(timeoutSpy).toHaveBeenCalledWith(15000);
    expect(err).toBeInstanceOf(ComposeApiError);
    expect((err as ComposeApiError).message).toContain('请求超时');
  });

  // 【续 50 C-补充】stackAction 同步跑 docker compose,慢,超时放宽到 60s
  it('stackAction: 超时放宽到 60s(同步 compose 命令较慢)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    mockFetchOnce(200, { ok: true, data: { exitCode: 0, output: 'done' } });
    await stackAction('emby', 'up');
    expect(timeoutSpy).toHaveBeenCalledWith(60000);
  });

  // 【续 51】CPU 温度端点(后端直读 /sys/class/hwmon,不唤盘)
  it('getCpuTemp: 请求 ?action=cputemp 并返回 celsius/sensor', async () => {
    const spy = mockFetchOnce(200, {
      ok: true,
      data: { celsius: 47.0, sensor: 'coretemp/package id 0' },
    });
    const result = await getCpuTemp();
    expect(result).toEqual({ celsius: 47.0, sensor: 'coretemp/package id 0' });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/compose-api/?action=cputemp');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('getCpuTemp: 无 CPU 传感器时 celsius 为 null(不视为错误)', async () => {
    mockFetchOnce(200, { ok: true, data: { celsius: null, sensor: null } });
    const result = await getCpuTemp();
    expect(result.celsius).toBeNull();
  });
});
