import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataApi } from '@/features/settings/api/data';

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@/api/index', () => ({
  default: {
    get,
  },
}));

describe('dataApi', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('lists anomalies with snake_case query params and camelCase response fields', async () => {
    get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 7,
            code: '688111',
            date: '2026-09-22',
            kind: 'unit_scale_mismatch',
            severity: 'critical',
            data_source: 'TencentFetcher',
            existing_data_source: 'AkshareFetcher',
            details: { volume: 452164000.0 },
            suggested_fix: { field: 'volume', value: 4521640.0 },
            status: 'open',
            created_at: '2026-09-25T10:00:00',
            updated_at: '2026-09-25T10:00:00',
          },
        ],
        summary: {
          total_by_status: { open: 1 },
          open_critical: 1,
          open_by_kind: { unit_scale_mismatch: 1 },
        },
      },
    });

    const response = await dataApi.listAnomalies({ status: 'open', limit: 100 });

    expect(get).toHaveBeenCalledWith('/api/v1/data/anomalies', {
      params: { status: 'open', limit: 100 },
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: 7,
      code: '688111',
      kind: 'unit_scale_mismatch',
      dataSource: 'TencentFetcher',
      existingDataSource: 'AkshareFetcher',
      suggestedFix: { field: 'volume', value: 4521640.0 },
    });
    expect(response.summary).toEqual({
      totalByStatus: { open: 1 },
      openCritical: 1,
      // toCamelCase 深转换：open_by_kind 的动态 kind 键同样被驼峰化
      openByKind: { unitScaleMismatch: 1 },
    });
  });

  it('omits undefined filters from the query params', async () => {
    get.mockResolvedValueOnce({
      data: { items: [], summary: { total_by_status: {}, open_critical: 0, open_by_kind: {} } },
    });

    await dataApi.listAnomalies();

    expect(get).toHaveBeenCalledWith('/api/v1/data/anomalies', { params: {} });
  });
});
