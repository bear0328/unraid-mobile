// 【阶段 P1-详情 - 2026-06-17 续 33-1】ContainerDetailsModal 测试
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContainerDetailsModal from './ContainerDetailsModal';
import { clearFavorites } from '../../hooks/useFavorites';
import type { UnraidApiService, UnraidDockerContainer } from '../../services';

const container: UnraidDockerContainer = {
  containerId: 'container:abc123',
  name: 'nginx',
  image: 'nginx:latest',
  state: 'running',
  status: 'Up 2 hours',
  autoStart: true,
  id: 'abc123',
  created: '2026-01-01T00:00:00Z',
  ports: [],
};

describe('ContainerDetailsModal', () => {
  beforeEach(() => {
    clearFavorites();
    localStorage.clear();
  });

  it('显示容器名 + 状态 + 镜像', () => {
    render(<ContainerDetailsModal container={container} api={null} onClose={() => {}} />);
    // Modal 渲染 sr-only h2 + ModalHeader 渲染可见 h3,用 heading level 3 精确选可见标题
    expect(screen.getByRole('heading', { name: 'nginx', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('nginx:latest')).toBeInTheDocument();
  });

  it('显示 autoStart 启用/禁用', () => {
    render(<ContainerDetailsModal container={container} api={null} onClose={() => {}} />);
    expect(screen.getByText('✓ 启用')).toBeInTheDocument();
  });

  it('api=null 时显示 stats 加载中', () => {
    render(<ContainerDetailsModal container={container} api={null} onClose={() => {}} />);
    // 无 api 直接显示"无数据"
    expect(screen.getByText('无数据')).toBeInTheDocument();
  });

  it('api 拿到 stats 后显示 CPU%/内存条', async () => {
    const api = {
      getContainerStats: vi.fn().mockResolvedValue({
        success: true,
        // 【续 46.4】订阅源数据形状:memPercent + memUsageText(旧 memUsage/memLimit 已废)
        data: { cpuPercent: 42.5, memPercent: 10, memUsageText: '100MiB / 1GiB' },
      }),
      getContainerDetails: vi.fn().mockResolvedValue({ success: false, error: 'x' }),
    };
    render(<ContainerDetailsModal container={container} api={api as unknown as UnraidApiService} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('42.5%')).toBeInTheDocument();
    });
    expect(api.getContainerStats).toHaveBeenCalledWith('container:abc123');
  });

  it('stats 失败时显示错误信息', async () => {
    const api = {
      getContainerStats: vi.fn().mockResolvedValue({
        success: false,
        error: '连接失败',
      }),
      getContainerDetails: vi.fn().mockResolvedValue({ success: false, error: '连接失败' }),
    };
    render(<ContainerDetailsModal container={container} api={api as unknown as UnraidApiService} onClose={() => {}} />);
    await waitFor(() => {
      // 源码渲染 `❌ {statsError}`,文本节点带 emoji 前缀,用 RegExp 匹配包含
      expect(screen.getByText(/连接失败/)).toBeInTheDocument();
    });
  });

  it('点 ⭐ 切换收藏状态', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<ContainerDetailsModal container={container} api={null} onClose={() => {}} />);
    const favBtn = screen.getByLabelText('添加到收藏');
    expect(favBtn).toHaveTextContent('☆');
    await userEvent.click(favBtn);
    expect(screen.getByLabelText('取消收藏')).toHaveTextContent('★');
  });

  it('paused 状态显示对应文案', () => {
    render(
      <ContainerDetailsModal
        container={{ ...container, state: 'paused' }}
        api={null}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  // ==================== 【续 52】详情扩充 ====================

  const detailPayload = {
    image: 'nginx:latest',
    status: 'Up 2 hours',
    created: 1767225600,
    command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    ports: [{ ip: null, privatePort: 80, publicPort: 3998, type: 'TCP' }],
    lanIpPorts: ['192.168.6.140:3998'],
    mounts: [
      { type: 'bind', source: '/mnt/user/appdata/x', destination: '/data', rw: true },
      { type: 'bind', source: '/boot/config', destination: '/config', rw: false },
    ],
    networks: [{ name: 'bridge', ip: '172.17.0.2', gateway: '172.17.0.1', mac: '02:42:ac' }],
    networkMode: 'bridge',
    sizeRootFs: 62517714,
    sizeRw: 11791,
    sizeLog: 490825,
    webUiUrl: 'http://192.168.6.140:3998',
    projectUrl: null,
    supportUrl: null,
    isUpdateAvailable: true,
    autoStartOrder: 10,
    autoStartWait: 5,
  };

  function makeApi(detailResult: unknown) {
    return {
      getContainerStats: vi.fn().mockResolvedValue({ success: false, error: 'no stats' }),
      getContainerDetails: vi.fn().mockResolvedValue(detailResult),
    } as unknown as UnraidApiService;
  }

  it('【续 52】详情到达后渲染端口/访问链接/网络/磁盘/命令/WebUI 按钮/更新徽标', async () => {
    const api = makeApi({ success: true, data: detailPayload });
    render(<ContainerDetailsModal container={container} api={api} onClose={() => {}} />);
    // 启动命令
    await waitFor(() => {
      expect(screen.getByText("/docker-entrypoint.sh nginx -g 'daemon off;'")).toBeInTheDocument();
    });
    // 端口行(文本拆在多节点,按 textContent 匹配)
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '3998 → 80')
    ).toBeInTheDocument();
    // lanIpPorts 可点链接
    const link = screen.getByRole('link', { name: /192\.168\.6\.140:3998/ });
    expect(link).toHaveAttribute('href', 'http://192.168.6.140:3998');
    // 网络
    expect(screen.getByText('172.17.0.2')).toBeInTheDocument();
    // 磁盘占用
    expect(screen.getByText('磁盘占用')).toBeInTheDocument();
    // 自启顺序/等待
    expect(screen.getByText(/顺序 10/)).toBeInTheDocument();
    // 更新徽标 + WebUI 按钮
    expect(screen.getByText('🔔 有更新')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /打开 Web UI/ })).toHaveAttribute(
      'href',
      'http://192.168.6.140:3998'
    );
  });

  it('【续 52】挂载默认收起,点击展开显示 source → destination + ro/rw', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const api = makeApi({ success: true, data: detailPayload });
    render(<ContainerDetailsModal container={container} api={api} onClose={() => {}} />);
    const toggle = await screen.findByRole('button', { name: /挂载/ });
    expect(screen.queryByText(/\/mnt\/user\/appdata\/x/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/\/mnt\/user\/appdata\/x → \/data/)).toBeInTheDocument();
    expect(screen.getByText('rw')).toBeInTheDocument();
    expect(screen.getByText('ro')).toBeInTheDocument();
  });

  it('【续 52】详情拉取失败:基本区仍在,新区块不渲染', async () => {
    const api = makeApi({ success: false, error: '容器不存在' });
    render(<ContainerDetailsModal container={container} api={api} onClose={() => {}} />);
    await waitFor(() => {
      expect(api.getContainerDetails).toHaveBeenCalledWith('nginx');
    });
    expect(screen.getByText('nginx:latest')).toBeInTheDocument();
    expect(screen.queryByText('磁盘占用')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /挂载/ })).not.toBeInTheDocument();
  });

  it('【续 53】停止的容器:stats 区显示友好提示,且不发 stats 请求', async () => {
    const api = makeApi({ success: false, error: 'x' });
    render(
      <ContainerDetailsModal
        container={{ ...container, state: 'exited' }}
        api={api}
        onClose={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/容器未运行,无实时资源数据/)).toBeInTheDocument();
    });
    expect(api.getContainerStats).not.toHaveBeenCalled();
  });

  it('【续 53】底部无"关闭"按钮(右上角 × 承担关闭)', () => {
    render(<ContainerDetailsModal container={container} api={null} onClose={() => {}} />);
    // 仅 header 的 ×(aria-label=关闭)一个关闭控件,不再有额外按钮
    expect(screen.getAllByRole('button', { name: '关闭' })).toHaveLength(1);
  });
});
