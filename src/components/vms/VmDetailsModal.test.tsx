// 【续 101 2026-08-10】VmDetailsModal 增强详情测试
// 覆盖:基本信息免费渲染 / Pro 门控(未解锁不拉取) / 增强区各区块渲染 /
//       加载态 / 错误态(宿主后端不可用提示)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UnraidVM, VmInfo, UnraidApiService } from '../../services';
import { __setLicenseStateForTest, __resetLicenseForTest } from '../../services/license';

// mock useUnraidApi:useUnraidApi 返回可控 api;useApiConfig 固定已配置
// 注意 api 对象必须引用稳定 —— 每次 render 返新对象会让 VmDetailsModal 的
// effect deps([pro, api, vm.name])反复 cleanup(cancelled=true),永远停在加载态
const apiMock = vi.hoisted(() => ({ getVmInfo: vi.fn() }));
const getVmInfoMock = apiMock.getVmInfo;
vi.mock('../../hooks/useUnraidApi', () => ({
  useUnraidApi: vi.fn(() => apiMock as unknown as UnraidApiService),
  useApiConfig: vi.fn(() => ({ config: { baseUrl: 'http://nas.local' }, isConfigured: true })),
}));

import VmDetailsModal from './VmDetailsModal';

const vm: UnraidVM = {
  id: 'srv-1:uuid-aaa',
  vmUuid: 'uuid-aaa',
  name: 'win11',
  state: 'RUNNING',
};

const vmInfo: VmInfo = {
  name: 'win11',
  uuid: 'uuid-aaa',
  vcpus: 8,
  memory: { current: 8388608, max: 16777216, unit: 'KiB' },
  autostart: true,
  disks: [
    {
      type: 'file',
      path: '/mnt/user/domains/win11/vdisk1.img',
      bus: 'virtio',
      dev: 'vda',
      format: 'qcow2',
      size: 68719476736,
    },
  ],
  interfaces: [{ type: 'bridge', bridge: 'br0', mac: '52:54:00:aa:bb:cc', model: 'virtio' }],
  graphics: { type: 'vnc', port: '5900', autoport: true, listen: '0.0.0.0' },
  hostDevices: [
    { type: 'pci', domain: '0x0000', bus: '0x03', slot: '0x00', function: '0x0' },
    { type: 'usb', vendorId: '0x046d', productId: '0xc52b' },
  ],
  snapshots: ['before-upgrade'],
};

function renderModal() {
  return render(
    <MemoryRouter>
      <VmDetailsModal vm={vm} onClose={vi.fn()} />
    </MemoryRouter>
  );
}

describe('VmDetailsModal 增强详情(续 101)', () => {
  beforeEach(() => {
    getVmInfoMock.mockReset();
    __setLicenseStateForTest({
      status: 'active',
      info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
    });
  });

  afterEach(() => {
    __resetLicenseForTest();
  });

  it('基本信息(免费):名称/UUID/完整 ID/状态 + WebGUI 链接', () => {
    getVmInfoMock.mockResolvedValue({ success: true, data: vmInfo });
    renderModal();
    expect(screen.getAllByText('win11').length).toBeGreaterThan(0);
    expect(screen.getByText('uuid-aaa')).toBeInTheDocument();
    expect(screen.getByText('srv-1:uuid-aaa')).toBeInTheDocument();
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0);
    expect(screen.getByText('在 unRAID WebGUI 中打开')).toBeInTheDocument();
  });

  it('Pro:打开即调 getVmInfo(vm.name),渲染 CPU/内存/磁盘/网络/图形/直通/快照', async () => {
    getVmInfoMock.mockResolvedValue({ success: true, data: vmInfo });
    renderModal();
    await waitFor(() => expect(getVmInfoMock).toHaveBeenCalledWith('win11'));
    // CPU/内存(KiB → GiB:8388608 KiB = 8.0 GiB,16777216 = 16.0 GiB)
    await screen.findByText('CPU / 内存');
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/8\.0 GiB \/ 上限 16\.0 GiB/)).toBeInTheDocument();
    expect(screen.getByText('启用')).toBeInTheDocument(); // autostart
    // 磁盘(formatBytes 十进制:68719476736 B = 68.7G)
    expect(screen.getByText('磁盘(1)')).toBeInTheDocument();
    expect(screen.getByText(/vdisk1\.img · qcow2 · virtio · 68\.7G/)).toBeInTheDocument();
    // 网络
    expect(screen.getByText(/52:54:00:aa:bb:cc · virtio/)).toBeInTheDocument();
    // 图形
    expect(screen.getByText(/端口 5900/)).toBeInTheDocument();
    // 直通
    expect(screen.getByText('0x0000:0x03:0x00.0x0')).toBeInTheDocument();
    expect(screen.getByText('0x046d:0xc52b')).toBeInTheDocument();
    // 快照
    expect(screen.getByText('before-upgrade')).toBeInTheDocument();
  });

  it('未解锁 Pro:不调用 getVmInfo,显示 ProGate 锁占位', () => {
    __setLicenseStateForTest({ status: 'none' });
    renderModal();
    expect(getVmInfoMock).not.toHaveBeenCalled();
    expect(screen.getByText(/增强详情/)).toBeInTheDocument();
    // 基本信息仍可见
    expect(screen.getByText('uuid-aaa')).toBeInTheDocument();
  });

  it('加载态:pending 时显示「加载增强信息…」', () => {
    getVmInfoMock.mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByText('加载增强信息…')).toBeInTheDocument();
  });

  it('错误态:后端不可用 → 显示错误信息', async () => {
    getVmInfoMock.mockResolvedValue({ success: false, error: 'HTTP 404' });
    renderModal();
    await screen.findByText(/增强信息不可用:HTTP 404/);
  });
});
