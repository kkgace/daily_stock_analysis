import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAnomalyStatusPanel } from '../DataAnomalyStatusPanel';

const { listAnomalies } = vi.hoisted(() => ({
  listAnomalies: vi.fn(),
}));

vi.mock('../../../api/data', () => ({
  dataApi: {
    listAnomalies: (...args: unknown[]) => listAnomalies(...args),
  },
}));

const openResponse = {
  items: [
    {
      id: 7,
      code: '688111',
      date: '2026-09-22',
      kind: 'unit_scale_mismatch',
      severity: 'critical',
      dataSource: 'TencentFetcher',
      existingDataSource: 'AkshareFetcher',
      details: { volume: 452164000.0 },
      suggestedFix: { field: 'volume', value: 4521640.0 },
      status: 'open',
      createdAt: '2026-09-25T10:00:00',
      updatedAt: '2026-09-25T10:00:00',
    },
  ],
  summary: {
    totalByStatus: { open: 1 },
    openCritical: 1,
    openByKind: { unit_scale_mismatch: 1 },
  },
};

const emptyResponse = {
  items: [],
  summary: { totalByStatus: {}, openCritical: 0, openByKind: {} },
};

describe('DataAnomalyStatusPanel', () => {
  beforeEach(() => {
    listAnomalies.mockReset();
  });

  it('loads open anomalies by default and renders summary plus rows', async () => {
    listAnomalies.mockResolvedValueOnce(openResponse);

    render(<DataAnomalyStatusPanel />);

    await waitFor(() => {
      expect(listAnomalies).toHaveBeenCalledWith({ status: 'open', limit: 200 });
    });
    expect(await screen.findByText('688111')).toBeInTheDocument();
    expect(screen.getByText('待处理 1')).toBeInTheDocument();
    expect(screen.getByText('严重 1')).toBeInTheDocument();
    expect(screen.getByText('量纲不匹配')).toBeInTheDocument();
    // 「可修复」同时出现在表头与行内 Badge
    expect(screen.getAllByText('可修复').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/--data-quality --data-quality-apply/)).toBeInTheDocument();
  });

  it('shows the clean empty state when no open anomalies exist', async () => {
    listAnomalies.mockResolvedValueOnce(emptyResponse);

    render(<DataAnomalyStatusPanel />);

    expect(await screen.findByText('未发现待处理的数据质量异常')).toBeInTheDocument();
  });

  it('refetches when the status filter changes', async () => {
    listAnomalies.mockResolvedValue(emptyResponse);

    render(<DataAnomalyStatusPanel />);

    const select = await screen.findByLabelText('状态筛选');
    fireEvent.change(select, { target: { value: 'all' } });

    await waitFor(() => {
      expect(listAnomalies).toHaveBeenLastCalledWith({ status: 'all', limit: 200 });
    });
  });

  it('does not show any empty state before the first response arrives', () => {
    // 首帧（请求未返回）不能闪现"未发现异常"的假 clean 状态
    listAnomalies.mockReturnValueOnce(new Promise(() => {}));

    render(<DataAnomalyStatusPanel />);

    expect(screen.queryByText('未发现待处理的数据质量异常')).not.toBeInTheDocument();
    expect(screen.queryByText('当前筛选条件下没有异常记录')).not.toBeInTheDocument();
  });

  it('notes truncation when the display limit is reached', async () => {
    // 返回条数达到 200 上限：必须提示列表被截断，而不是静默丢弃
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      code: `6889${String(i).padStart(3, '0')}`,
      date: '2026-09-22',
      kind: 'volume_history_jump',
      severity: 'warning',
      dataSource: 'TestFetcher',
      existingDataSource: 'TestFetcher',
      details: {},
      status: 'open',
      createdAt: '2026-09-25T10:00:00',
      updatedAt: '2026-09-25T10:00:00',
    }));
    listAnomalies.mockResolvedValueOnce({
      items: rows,
      summary: { totalByStatus: { open: 260 }, openCritical: 0, openByKind: {} },
    });

    render(<DataAnomalyStatusPanel />);

    expect(await screen.findByText('6889000')).toBeInTheDocument();
    expect(screen.getByText(/已达单页展示上限/)).toBeInTheDocument();
    expect(screen.getByText(/260/)).toBeInTheDocument();
  });

  it('renders the parsed API error when loading fails', async () => {
    listAnomalies.mockRejectedValueOnce(new Error('boom'));

    render(<DataAnomalyStatusPanel />);

    await waitFor(() => {
      expect(screen.getByText('请求失败')).toBeInTheDocument();
    });
    expect(screen.queryByText('688111')).not.toBeInTheDocument();
  });
});
