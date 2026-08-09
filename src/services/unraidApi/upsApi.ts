// 【续 91 G】UPS 监控 API(Pro)
// upsDevices 数据来自 apcaccess(emhttp 内存态,只读不唤盘);
// 目标机无 UPS 时查询报 INTERNAL_SERVER_ERROR "No UPS data returned from apcaccess"
// → 失败/无数据一律返 null(UpsCard 整卡不渲染,真机只能验证这条,展示态靠单测 mock)
import { UnraidUpsDevice } from '../types';
import { UpsDevicesResponse, UpsDeviceInfo } from '../graphqlTypes';
import { graphqlRequest, buildGraphqlEndpoint } from './graphql';
import { UPS_QUERY } from './queries';

/**
 * 取 UPS 设备列表(归一化)。
 * 失败(含无 UPS 的 INTERNAL_SERVER_ERROR)/空列表 → 返 null。
 * namespace 'ups' 缓存,Dashboard tick 失效后重拉(与 systemInfo 同节拍)。
 */
export async function getUpsDevices(
  baseUrl: string,
  apiKey: string,
  useProxy: boolean
): Promise<UnraidUpsDevice[] | null> {
  const endpoint = buildGraphqlEndpoint(baseUrl, useProxy);
  const result = await graphqlRequest<UpsDevicesResponse>(endpoint, apiKey, UPS_QUERY, undefined, {
    namespace: 'ups',
  });
  if (!result.success || !result.data) return null;
  const list = result.data.upsDevices;
  if (!Array.isArray(list) || list.length === 0) return null;

  return list.map((d: UpsDeviceInfo) => ({
    id: d.id || '',
    name: d.name || '',
    model: d.model || '',
    status: d.status || '',
    battery: {
      chargeLevel: d.battery?.chargeLevel ?? 0,
      estimatedRuntime: d.battery?.estimatedRuntime ?? 0,
      health: d.battery?.health || '',
    },
    power: {
      inputVoltage: d.power?.inputVoltage ?? 0,
      outputVoltage: d.power?.outputVoltage ?? 0,
      loadPercentage: d.power?.loadPercentage ?? 0,
      nominalPower: typeof d.power?.nominalPower === 'number' ? d.power.nominalPower : null,
      currentPower: typeof d.power?.currentPower === 'number' ? d.power.currentPower : null,
    },
  }));
}
