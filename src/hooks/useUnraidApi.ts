// 【阶段 1 P0 2026-06-15】修 useEffect 依赖 warning:
// - useMemo 依赖 configVersion(它是 trigger,不是真依赖,加依赖反而死循环)
// - useEffect 依赖 config(同上)
import { useEffect, useMemo, useState } from 'react';
import { UnraidApiService, getApiConfig, subscribeApiConfigChange } from '../services';

/**
 * 获取 unRAID API 实例（自动响应配置变化）
 */
export function useUnraidApi(): UnraidApiService | null {
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    return subscribeApiConfigChange(() => {
      setConfigVersion((prev) => prev + 1);
    });
  }, []);

  return useMemo(() => {
    const config = getApiConfig();
    if (!config || !config.serverUrl || !config.apiKey) {
      return null;
    }
    return new UnraidApiService(config.serverUrl, config.apiKey);
    // configVersion 是 trigger,不是真依赖,加依赖反而死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configVersion]);
}

/**
 * 获取 API 配置状态
 */
export function useApiConfig() {
  const [config, setConfig] = useState(getApiConfig());

  useEffect(() => {
    if (!config || !config.serverUrl || !config.apiKey) {
      setConfig(getApiConfig());
    }
    return subscribeApiConfigChange(() => {
      setConfig(getApiConfig());
    });
    // config 是 trigger,加依赖会导致组件 mount 后立即 re-render 死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    config,
    isConfigured: !!(config && config.serverUrl && config.apiKey),
  };
}
