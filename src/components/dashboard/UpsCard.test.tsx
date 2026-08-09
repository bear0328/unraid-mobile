// 【续 91 G】UpsCard 测试:Pro 门控 + OL 市电/OB 电池两态 + 无数据不渲染
// (目标机无 UPS,展示态全靠这里的 mock)
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UpsCard from './UpsCard';
import type { UnraidUpsDevice } from '../../services';
import { __setLicenseStateForTest, __resetLicenseForTest } from '../../services/license';

function makeUps(overrides: Partial<UnraidUpsDevice> = {}): UnraidUpsDevice {
  return {
    id: 'ups1',
    name: 'UPS',
    model: 'APC Back-UPS Pro 1500',
    status: 'OL',
    battery: { chargeLevel: 100, estimatedRuntime: 45, health: 'OK' },
    power: {
      inputVoltage: 230,
      outputVoltage: 230,
      loadPercentage: 12,
      nominalPower: 865,
      currentPower: 105.5,
    },
    ...overrides,
  };
}

function setPro() {
  __setLicenseStateForTest({
    status: 'active',
    info: { email: 't@t', tier: 'pro', iat: 1, exp: null },
  });
}

const renderCard = (ups: UnraidUpsDevice | null) =>
  render(
    <MemoryRouter>
      <UpsCard ups={ups} />
    </MemoryRouter>
  );

afterEach(() => {
  __resetLicenseForTest();
});

describe('UpsCard', () => {
  it('未解锁 Pro → ProGate 引导卡(门控在前,不看数据)', () => {
    __setLicenseStateForTest({ status: 'none' });
    renderCard(makeUps());
    expect(screen.getByText(/UPS 监控 · Pro 功能/)).toBeInTheDocument();
    // 数据内容被门控挡住
    expect(screen.queryByText(/市电供电/)).not.toBeInTheDocument();
  });

  it('Pro + OL(市电,充电满):型号 + 状态 + 电量 + 续航 + 负载功率', () => {
    setPro();
    renderCard(makeUps());
    expect(screen.getByText('UPS')).toBeInTheDocument();
    expect(screen.getByText('APC Back-UPS Pro 1500')).toBeInTheDocument();
    expect(screen.getByText('市电供电')).toBeInTheDocument();
    expect(screen.getByText('电量')).toBeInTheDocument();
    expect(screen.getByText(/100\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/约 45 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/负载 12%/)).toBeInTheDocument();
    expect(screen.getByText(/106W \/ 865W/)).toBeInTheDocument();
  });

  it('Pro + OB(电池供电,放电):状态红色 + 放电中标记', () => {
    setPro();
    renderCard(
      makeUps({
        status: 'OB',
        battery: { chargeLevel: 68, estimatedRuntime: 18, health: 'OK' },
      })
    );
    const label = screen.getByText(/电池供电/);
    expect(label.className).toMatch(/text-red-/);
    expect(screen.getByText(/放电中/)).toBeInTheDocument();
    expect(screen.getByText(/68\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/约 18 分钟/)).toBeInTheDocument();
  });

  it('Pro + 无 UPS(null)→ 整卡不渲染(目标机现状)', () => {
    setPro();
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });
});
