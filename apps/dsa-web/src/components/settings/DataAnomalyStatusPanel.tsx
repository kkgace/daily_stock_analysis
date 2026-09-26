import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { CircleCheckBig, RefreshCw, ShieldAlert } from 'lucide-react';
import { dataApi } from '../../api/data';
import { getParsedApiError, type ParsedApiError } from '../../api/error';
import { useUiLanguage } from '../../contexts/UiLanguageContext';
import type { UiTextKey } from '../../i18n/uiText';
import type { DataQualityAnomaliesResponse } from '../../types/dataAnomalies';
import { ApiErrorAlert, Badge, Button, EmptyState } from '../common';

type Translate = ReturnType<typeof useUiLanguage>['t'];

interface DataAnomalyStatusPanelProps {
  disabled?: boolean;
}

type StatusFilter = 'open' | 'repaired' | 'dismissed' | 'all';

type DataAnomalyStatusValue = DataQualityAnomaliesResponse['items'][number]['status'];

const STATUS_FILTERS: StatusFilter[] = ['open', 'repaired', 'dismissed', 'all'];

const FILTER_LABEL_KEYS: Record<StatusFilter, UiTextKey> = {
  open: 'settings.dataAnomalyFilterOpen',
  repaired: 'settings.dataAnomalyFilterRepaired',
  dismissed: 'settings.dataAnomalyFilterDismissed',
  all: 'settings.dataAnomalyFilterAll',
};

const STATUS_LABEL_KEYS: Record<DataAnomalyStatusValue, UiTextKey> = {
  open: 'settings.dataAnomalyStatusOpen',
  repaired: 'settings.dataAnomalyStatusRepaired',
  dismissed: 'settings.dataAnomalyStatusDismissed',
};

function severityVariant(severity: string): 'danger' | 'warning' {
  return severity === 'critical' ? 'danger' : 'warning';
}

function statusVariant(status: string): 'warning' | 'success' | 'history' {
  if (status === 'open') return 'warning';
  if (status === 'repaired') return 'success';
  return 'history';
}

function kindLabel(kind: string, t: Translate): string {
  const labels: Record<string, string> = {
    unit_scale_mismatch: t('settings.dataAnomalyKindUnitScale'),
    zero_volume_with_price: t('settings.dataAnomalyKindZeroVolume'),
    volume_history_jump: t('settings.dataAnomalyKindVolumeJump'),
    close_history_jump: t('settings.dataAnomalyKindCloseJump'),
    cross_source_mismatch: t('settings.dataAnomalyKindCrossSource'),
  };
  return labels[kind] ?? kind;
}

const ANOMALY_LIST_LIMIT = 200;

const AnomalyRow: React.FC<{
  item: DataQualityAnomaliesResponse['items'][number];
  t: Translate;
}> = ({ item, t }) => (
  <tr>
    <td className="whitespace-nowrap px-3 py-2 text-muted-text">{item.date}</td>
    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-foreground">{item.code}</td>
    <td className="px-3 py-2 text-sm text-foreground">
      {kindLabel(item.kind, t)}
      <span className="ml-2 text-xs text-muted-text">{item.kind}</span>
    </td>
    <td className="px-3 py-2">
      <Badge variant={severityVariant(item.severity)} size="sm">
        {item.severity === 'critical' ? t('settings.dataAnomalySeverityCritical') : t('settings.dataAnomalySeverityWarning')}
      </Badge>
    </td>
    <td className="px-3 py-2">
      <Badge variant={statusVariant(item.status)} size="sm">
        {t(STATUS_LABEL_KEYS[item.status])}
      </Badge>
    </td>
    <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-text">{item.dataSource}</td>
    <td className="px-3 py-2 text-sm">
      {item.suggestedFix ? (
        <Badge variant="info" size="sm">{t('settings.dataAnomalyFixable')}</Badge>
      ) : (
        <span className="text-muted-text">—</span>
      )}
    </td>
  </tr>
);

export const DataAnomalyStatusPanel: React.FC<DataAnomalyStatusPanelProps> = ({
  disabled = false,
}) => {
  const { t } = useUiLanguage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [data, setData] = useState<DataQualityAnomaliesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    try {
      const next = await dataApi.listAnomalies({
        status: statusFilter,
        limit: ANOMALY_LIST_LIMIT,
      });
      if (requestIdRef.current !== requestId) {
        return;
      }
      setData(next);
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setData(null);
      setError(getParsedApiError(err));
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = data?.summary;
  const items = data?.items ?? [];
  const totalOpen = summary?.totalByStatus?.open ?? 0;
  // data === null 表示首个请求尚未返回：此时不渲染任何空态，
  // 避免首帧闪现"未发现异常"的假 clean 状态
  const isEmpty = data !== null && !isLoading && !error && items.length === 0;

  return (
    <div data-testid="data-anomaly-status-panel" className="space-y-3 rounded-xl border settings-border bg-card/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('settings.dataAnomalyPanelTitle')}</p>
          <p className="mt-1 text-xs leading-5 text-muted-text">
            {t('settings.dataAnomalyPanelDescription')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="data-anomaly-status-filter">
            {t('settings.dataAnomalyStatusFilter')}
          </label>
          <select
            id="data-anomaly-status-filter"
            className="rounded-lg border settings-border bg-background px-2 py-1 text-sm text-foreground"
            value={statusFilter}
            disabled={disabled || isLoading}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t(FILTER_LABEL_KEYS[value])}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="settings-secondary"
            size="sm"
            disabled={disabled || isLoading}
            isLoading={isLoading}
            loadingText={t('settings.dataAnomalyRefreshing')}
            onClick={() => void refresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('settings.dataAnomalyRefresh')}
          </Button>
        </div>
      </div>

      {summary ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-text">
          <Badge variant="warning" size="sm">
            {t('settings.dataAnomalyOpenCount', { count: summary.totalByStatus.open ?? 0 })}
          </Badge>
          <Badge variant="danger" size="sm">
            {t('settings.dataAnomalyCriticalCount', { count: summary.openCritical })}
          </Badge>
          <Badge variant="success" size="sm">
            {t('settings.dataAnomalyRepairedCount', { count: summary.totalByStatus.repaired ?? 0 })}
          </Badge>
          <Badge variant="history" size="sm">
            {t('settings.dataAnomalyDismissedCount', { count: summary.totalByStatus.dismissed ?? 0 })}
          </Badge>
        </div>
      ) : null}

      {error ? <ApiErrorAlert error={error} /> : null}

      {isEmpty && totalOpen === 0 && (statusFilter === 'open' || statusFilter === 'all') ? (
        <EmptyState
          icon={<CircleCheckBig className="h-10 w-10" aria-hidden="true" />}
          title={t('settings.dataAnomalyEmptyTitle')}
          description={t('settings.dataAnomalyEmptyDescription')}
        />
      ) : null}

      {isEmpty && (totalOpen > 0 || (statusFilter !== 'open' && statusFilter !== 'all')) ? (
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10" aria-hidden="true" />}
          title={t('settings.dataAnomalyNoRowsTitle')}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-text">
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnDate')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnCode')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnKind')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnSeverity')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnStatus')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnSource')}</th>
                <th className="px-3 py-2">{t('settings.dataAnomalyColumnFix')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((item) => (
                <AnomalyRow key={item.id} item={item} t={t} />
              ))}
            </tbody>
          </table>
          {items.length >= ANOMALY_LIST_LIMIT ? (
            <p className="mt-2 text-xs leading-5 text-muted-text">
              {t('settings.dataAnomalyTruncated', { shown: items.length })}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-text">
        {t('settings.dataAnomalyFooterHint')}
      </p>
    </div>
  );
};
