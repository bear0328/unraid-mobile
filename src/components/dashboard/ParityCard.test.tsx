// 【续 91 D】ParityCard 三态测试:running / 非 running(NEVER_RUN + 上次信息) / null 不渲染
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ParityCard from './ParityCard';
import type { UnraidParityStatus } from '../../services';

function makeStatus(overrides: Partial<UnraidParityStatus> = {}): UnraidParityStatus {
  return {
    arrayState: 'STARTED',
    status: 'NEVER_RUN',
    running: false,
    paused: false,
    correcting: false,
    progress: 0,
    speed: '0',
    errors: null,
    date: null,
    duration: null,
    ...overrides,
  };
}

describe('ParityCard', () => {
  it('running 态:进度条 + 速度 + 错误数(>0 红色)+ 纠错模式', () => {
    render(
      <ParityCard
        status={makeStatus({
          status: 'RUNNING',
          running: true,
          progress: 45.2,
          speed: '120 MB/s',
          errors: 2,
          correcting: true,
        })}
      />
    );
    expect(screen.getByText('Parity 校验')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText(/45\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/速度 120 MB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/纠错模式/)).toBeInTheDocument();
    const err = screen.getByText('错误 2');
    expect(err.className).toMatch(/text-red-/);
  });

  it('running + paused 态:徽章显示已暂停', () => {
    render(<ParityCard status={makeStatus({ status: 'PAUSED', running: true, paused: true, progress: 30 })} />);
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('非 running + NEVER_RUN:中文化「从未校验」,无上次信息', () => {
    render(<ParityCard status={makeStatus()} />);
    // 徽章 + 正文各一处
    expect(screen.getAllByText('从未校验').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/上次校验/)).not.toBeInTheDocument();
    expect(screen.getByText('错误 0')).toBeInTheDocument();
  });

  it('非 running + 有上次记录:date/duration/errors 展示', () => {
    render(
      <ParityCard
        status={makeStatus({
          status: 'COMPLETED',
          date: '2026-08-01T10:00:00Z',
          duration: 3661,
          errors: 0,
        })}
      />
    );
    expect(screen.getByText(/上次校验/)).toBeInTheDocument();
    expect(screen.getByText(/耗时 1h 1m 1s/)).toBeInTheDocument();
  });

  it('数据 null(查询失败/老 schema)→ 整卡不渲染', () => {
    const { container } = render(<ParityCard status={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
