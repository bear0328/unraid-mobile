// 【续 78】OtherServersCard 测试:门控(非 Pro / 单服务器不渲染)、
// 在线摘要 / 无 key 离线 / 请求失败离线 / 点击切换
// waitFor 统一 3000ms:usePolling mount jitter 最高 1000ms(续 78 flake 教训)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OtherServersCard from './OtherServersCard';
import {
  getServers,
  getActiveServerId,
  getServerApiKey,
  setActiveServer,
} from '../../services/unraidApi/config';
import { getSystemInfo } from '../../services/unraidApi/systemApi';
import { usePro } from '../../hooks/usePro';

vi.mock('../../services/unraidApi/config', () => ({
  getServers: vi.fn(),
  getActiveServerId: vi.fn(),
  getServerApiKey: vi.fn(),
  setActiveServer: vi.fn(),
}));
vi.mock('../../services/unraidApi/systemApi', () => ({ getSystemInfo: vi.fn() }));
vi.mock('../../hooks/usePro', () => ({ usePro: vi.fn() }));
vi.mock('../../hooks/usePollInterval', () => ({ usePollInterval: () => 60000 }));

const SERVER_A = { id: 'a', name: '主力机', serverUrl: 'http://192.168.1.1', color: '#ff0000' };
const SERVER_B = { id: 'b', name: '备用机', serverUrl: 'http://192.168.1.2' };
const WAIT = { timeout: 3000 };

function setup({ pro = true, servers = [SERVER_A, SERVER_B], activeId = 'a' } = {}) {
  vi.mocked(usePro).mockReturnValue(pro);
  vi.mocked(getServers).mockReturnValue(servers);
  vi.mocked(getActiveServerId).mockReturnValue(activeId);
}

describe('OtherServersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('非 Pro → 不渲染', () => {
    setup({ pro: false });
    const { container } = render(<OtherServersCard />);
    expect(container.firstChild).toBeNull();
  });

  it('单服务器 → 不渲染', () => {
    setup({ servers: [SERVER_A] });
    const { container } = render(<OtherServersCard />);
    expect(container.firstChild).toBeNull();
  });

  it('在线:显示其他服务器 CPU/内存/uptime 摘要', async () => {
    setup();
    vi.mocked(getServerApiKey).mockReturnValue('key-b');
    vi.mocked(getSystemInfo).mockResolvedValue({
      name: '备用机',
      cpu: 23.4,
      memory: 55.6,
      uptime: '3 天',
    } as never);
    render(<OtherServersCard />);
    await waitFor(() => {
      expect(screen.getByText(/CPU 23% · 内存 56% · 3 天/)).toBeInTheDocument();
    }, WAIT);
    // 只列非 active 服务器
    expect(screen.getByText('备用机')).toBeInTheDocument();
    expect(screen.queryByText('主力机')).not.toBeInTheDocument();
    // 直连 + 不污染共享缓存 + 跳过温度
    expect(getSystemInfo).toHaveBeenCalledWith('http://192.168.1.2', 'key-b', false, {
      namespace: null,
      skipCpuTemp: true,
    });
  });

  it('无 key → 离线,不发请求', async () => {
    setup();
    vi.mocked(getServerApiKey).mockReturnValue(null);
    render(<OtherServersCard />);
    await waitFor(() => {
      expect(screen.getByText('离线')).toBeInTheDocument();
    }, WAIT);
    expect(getSystemInfo).not.toHaveBeenCalled();
  });

  it('getSystemInfo 抛错 → 离线', async () => {
    setup();
    vi.mocked(getServerApiKey).mockReturnValue('key-b');
    vi.mocked(getSystemInfo).mockRejectedValue(new Error('timeout'));
    render(<OtherServersCard />);
    await waitFor(() => {
      expect(screen.getByText('离线')).toBeInTheDocument();
    }, WAIT);
  });

  it('点击卡片 → setActiveServer(id) 切换', async () => {
    setup();
    vi.mocked(getServerApiKey).mockReturnValue('key-b');
    vi.mocked(getSystemInfo).mockResolvedValue(null);
    render(<OtherServersCard />);
    await waitFor(() => {
      expect(screen.getByText('备用机')).toBeInTheDocument();
    }, WAIT);
    fireEvent.click(screen.getByText('备用机'));
    expect(setActiveServer).toHaveBeenCalledWith('b');
  });
});
