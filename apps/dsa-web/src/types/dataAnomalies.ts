export type DataAnomalyStatus = 'open' | 'repaired' | 'dismissed';

export type DataAnomalySeverity = 'critical' | 'warning';

export type DataAnomalyKind =
  | 'unit_scale_mismatch'
  | 'zero_volume_with_price'
  | 'volume_history_jump'
  | 'close_history_jump'
  | 'cross_source_mismatch';

export interface DataQualityAnomalyItem {
  id: number;
  code: string;
  date: string;
  kind: DataAnomalyKind | string;
  severity: DataAnomalySeverity;
  dataSource: string;
  existingDataSource: string | null;
  details: Record<string, unknown> | null;
  suggestedFix: Record<string, unknown> | null;
  status: DataAnomalyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityAnomalySummary {
  totalByStatus: Record<string, number>;
  openCritical: number;
  openByKind: Record<string, number>;
}

export interface DataQualityAnomaliesResponse {
  items: DataQualityAnomalyItem[];
  summary: DataQualityAnomalySummary;
}

export interface DataAnomalyListQuery {
  status?: 'open' | 'repaired' | 'dismissed' | 'all';
  code?: string;
  kind?: string;
  limit?: number;
}
