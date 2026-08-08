// 【续 88 2026-08-08】LicenseSection 激活链路回滚测试:
// 绑机不匹配(mismatch)必须 clearLicense 回滚落盘 key —— 旧代码只 toast 不回滚,
// 与同函数设备超限分支行为矛盾(激活注释自称"任一不过则回滚")
// mock 说明:license / licenseBinding 两模块全桩,useToast 桩;store 快照用可变 currentState 驱动
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LicenseSection from './LicenseSection';
import {
  activateLicense,
  clearLicense,
  getLicenseState,
  subscribeLicense,
  type LicenseInfo,
  type LicenseState,
} from '../services/license';
import { checkServerBinding, registerDevice } from '../services/licenseBinding';

const { mockToastError, mockToastSuccess, mockToastInfo } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastInfo: vi.fn(),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess, info: mockToastInfo }),
}));

vi.mock('../services/license', () => ({
  activateLicense: vi.fn(),
  clearLicense: vi.fn(),
  getLicenseState: vi.fn(),
  subscribeLicense: vi.fn(),
}));

vi.mock('../services/licenseBinding', () => ({
  checkServerBinding: vi.fn(),
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),
}));

const mockActivate = vi.mocked(activateLicense);
const mockClear = vi.mocked(clearLicense);
const mockGetState = vi.mocked(getLicenseState);
const mockSubscribe = vi.mocked(subscribeLicense);
const mockCheckBinding = vi.mocked(checkServerBinding);
const mockRegister = vi.mocked(registerDevice);

const activeInfo: LicenseInfo = { email: 'u@e.com', tier: 'pro', iat: 1, exp: null, guid: 'G-1' };

/** useSyncExternalStore 的快照源:激活成功模拟 activateLicense 真行为(置 active) */
let currentState: LicenseState = { status: 'none' };

beforeEach(() => {
  vi.clearAllMocks();
  currentState = { status: 'none' };
  mockGetState.mockImplementation(() => currentState);
  mockSubscribe.mockImplementation(() => () => {});
  mockActivate.mockImplementation(async () => {
    currentState = { status: 'active', info: activeInfo };
    return { ok: true };
  });
});

function renderAndActivate() {
  render(<LicenseSection />);
  fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'UMPRO1.x.y' } });
  fireEvent.click(screen.getByRole('button', { name: '激活' }));
}

describe('LicenseSection 激活回滚(续 88)', () => {
  it('绑机不匹配 → clearLicense 回滚落盘 key + 错误 toast,不进设备注册', async () => {
    mockCheckBinding.mockResolvedValue(false);
    renderAndActivate();
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('另一台 unRAID 服务器'));
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('设备超限 → clearLicense 回滚(既有行为回归保护)', async () => {
    mockCheckBinding.mockResolvedValue(true);
    mockRegister.mockResolvedValue({ ok: false, error: '已达 3 台设备上限。' });
    renderAndActivate();
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('设备上限'));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('绑机通过 + 注册成功 → 不清 key,toast 成功', async () => {
    mockCheckBinding.mockResolvedValue(true);
    mockRegister.mockResolvedValue({ ok: true, count: 1, maxDev: 3 });
    renderAndActivate();
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Pro 已激活 🎉'));
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});
