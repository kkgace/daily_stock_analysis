import apiClient from './index';
import { toCamelCase } from './utils';
import type { DataAnomalyListQuery, DataQualityAnomaliesResponse } from '../types/dataAnomalies';

function toAnomalyListParams(query: DataAnomalyListQuery = {}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.code) params.code = query.code;
  if (query.kind) params.kind = query.kind;
  if (query.limit !== undefined) params.limit = query.limit;
  return params;
}

export const dataApi = {
  async listAnomalies(query: DataAnomalyListQuery = {}): Promise<DataQualityAnomaliesResponse> {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/data/anomalies', {
      params: toAnomalyListParams(query),
    });
    return toCamelCase<DataQualityAnomaliesResponse>(response.data);
  },
};
