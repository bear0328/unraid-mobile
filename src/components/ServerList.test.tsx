// 【续 104 P0-2】ServerList 保存前 serverUrl 归一化 + 校验
// 覆盖:非法地址拒绝保存(不落 LS)/ 合法地址自动补协议归一化 / 编辑路径同样归一化
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ServerList from './ServerList';
import ToastContainer from './ToastContainer';
import { getServers, addServer } from '../services/unraidApi/config';
import { __resetLicenseForTest } from '../services/license';

// ProGateButton(免费版 ≥1 台时「添加」变锁占位)用 useNavigate,必须包 Router
const renderServerList = () =>
  render(
    <MemoryRouter>
      <ServerList />
      <ToastContainer />
    </MemoryRouter>
  );

async function openAddModal(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /添加/ }));
  await user.type(screen.getByPlaceholderText('如:客厅 NAS'), '测试机');
  await user.type(
    screen.getByPlaceholderText('从 unRAID Connect 页面获取'),
    'key-123'
  );
}

describe('ServerList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    __resetLicenseForTest();
  });

  it('新增:非法 serverUrl(非法协议)→ toast.error + 不落 localStorage', async () => {
    const user: UserEvent = userEvent.setup();
    renderServerList();
    await openAddModal(user);
    await user.type(screen.getByPlaceholderText('http://192.168.1.100'), 'ftp://nas');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('服务器地址格式无效')).toBeInTheDocument();
    expect(getServers()).toHaveLength(0);
    expect(localStorage.getItem('unraid-mobile-servers')).toBeNull();
  });

  it('新增:缺协议 + 尾斜杠 → 自动归一化补 http:// 后保存', async () => {
    const user: UserEvent = userEvent.setup();
    renderServerList();
    await openAddModal(user);
    await user.type(screen.getByPlaceholderText('http://192.168.1.100'), 'nas.local:3998/');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(getServers()).toHaveLength(1);
    });
    expect(getServers()[0].serverUrl).toBe('http://nas.local:3998');
  });

  it('编辑:协议后空格(续 92 事故形态)→ 归一化后保存', async () => {
    const srv = addServer({ name: 'nas', serverUrl: 'http://nas', apiKey: 'k' });
    const user: UserEvent = userEvent.setup();
    renderServerList();
    await user.click(screen.getByRole('button', { name: `编辑 ${srv.name}` }));
    const urlInput = screen.getByPlaceholderText('http://192.168.1.100');
    await user.clear(urlInput);
    await user.type(urlInput, 'http:// 192.168.6.140');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(getServers()[0].serverUrl).toBe('http://192.168.6.140');
    });
  });
});
