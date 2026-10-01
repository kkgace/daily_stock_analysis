import type React from 'react';
import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  ApiErrorAlert,
  AppPage,
  Card,
  ConfirmDialog,
  EmptyState,
  InlineAlert,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { DecisionSignalCard } from '@/features/decision-signals/components/decision-signals/DecisionSignalDisplay';
import { useSignalDetail } from '@/features/decision-signals/hooks/useSignalDetail';
import { useSignalList } from '@/features/decision-signals/hooks/useSignalList';
import { useSignalReassess } from '@/features/decision-signals/hooks/useSignalReassess';
import { useSignalStatus } from '@/features/decision-signals/hooks/useSignalStatus';
import { useSignalStockViews } from '@/features/decision-signals/hooks/useSignalStockViews';
import { useOutcomeStats } from '@/features/decision-signals/hooks/useOutcomeStats';
import { useStockCandidates } from '@/features/decision-signals/hooks/useStockCandidates';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { useStockIndex } from '@/hooks/useStockIndex';
import { cn } from '@/utils/cn';
import { LatestSignalsCard } from '@/features/decision-signals/pages/signals/LatestSignalsCard';
import { OutcomeStatsCard } from '@/features/decision-signals/pages/signals/OutcomeStatsCard';
import { SignalDetailDrawer } from '@/features/decision-signals/pages/signals/SignalDetailDrawer';
import { SignalFiltersCard } from '@/features/decision-signals/pages/signals/SignalFiltersCard';
import { SignalTimelineCard } from '@/features/decision-signals/pages/signals/SignalTimelineCard';
import { StockContextCard } from '@/features/decision-signals/pages/signals/StockContextCard';
import { ReassessPanel } from '@/features/decision-signals/pages/signals/ReassessPanel';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import type { SelectedSignal } from '@/features/decision-signals/pages/signals/types';

const LATEST_LIMIT = 5;

const DecisionSignalsPage: React.FC = () => {
  const { t } = useUiLanguage();
  const { index: stockIndex } = useStockIndex();
  const [selected, setSelected] = useState<SelectedSignal | null>(null);

  const list = useSignalList({ setSelected });
  const {
    filters,
    setFilters,
    appliedFilters,
    appliedSourceReportId,
    page,
    setPage,
    items,
    total,
    totalPages,
    loading,
    error,
    setError,
    loadSignals,
    loadSignalsForPage,
    handleApplyFilters,
  } = list;

  const { outcomeStats, statsLoading, statsError, loadOutcomeStats } = useOutcomeStats();
  const candidates = useStockCandidates(stockIndex);

  const views = useSignalStockViews({ setSelected });
  const {
    activeStockContext,
    appliedTimelineContext,
    setLatestItems,
    setTimelineItems,
    loadLatestForContext,
    loadTimelineForContext,
  } = views;

  const detail = useSignalDetail(selected);

  const reassess = useSignalReassess({
    setSelected,
    selected,
    appliedSourceReportId,
    activeStockContext,
    appliedTimelineContext,
    latestLimit: LATEST_LIMIT,
    setLatestItems,
    setTimelineItems,
    loadLatestForContext,
    loadTimelineForContext,
    loadSignalsForPage,
    page,
  });
  const {
    reassessPersistConfirm,
    setReassessPersistConfirm,
    reassessPersisting,
    handlePersistReassess,
  } = reassess;

  const {
    pendingStatus,
    setPendingStatus,
    statusUpdating,
    handleStatusUpdate,
  } = useSignalStatus({
    setSelected,
    setError,
    setLatestItems,
    setTimelineItems,
    appliedTimelineContext,
    appliedFilters,
    page,
    loadSignalsForPage,
    loadOutcomeStats,
  });

  useEffect(() => {
    document.title = t('decisionSignals.pageTitle');
  }, [t]);

  return (
    <AppPage>
      <div className="space-y-5">
        <PageHeader
          eyebrow={t('decisionSignals.activeOnly')}
          title={t('decisionSignals.title')}
          description={t('decisionSignals.description')}
          actions={(
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={() => {
                void loadSignals();
                void loadOutcomeStats();
              }}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
              {t('decisionSignals.refresh')}
            </button>
          )}
        />

        <StockContextCard views={views} candidates={candidates} />

        <SignalFiltersCard filters={filters} setFilters={setFilters} onApply={handleApplyFilters} />

        {!selected && appliedSourceReportId ? (
          <Card padding="md">
            <ReassessPanel reassess={reassess} />
          </Card>
        ) : null}

        <OutcomeStatsCard
          outcomeStats={outcomeStats}
          statsLoading={statsLoading}
          statsError={statsError}
          onRetry={() => void loadOutcomeStats()}
        />

        <LatestSignalsCard
          hasStockContext={Boolean(activeStockContext)}
          latestError={views.latestError}
          latestSearched={views.latestSearched}
          latestLoading={views.latestLoading}
          latestItems={views.latestItems}
          selectedId={selected?.item.id ?? null}
          onSelect={(selectedItem: DecisionSignalItem) => setSelected({ source: 'latest', item: selectedItem })}
        />

        <SignalTimelineCard
          hasStockContext={Boolean(activeStockContext)}
          canSearch={Boolean(activeStockContext?.code)}
          timelineFilters={views.timelineFilters}
          setTimelineFilters={views.setTimelineFilters}
          onMarketChange={views.handleTimelineMarketChange}
          onSubmit={views.handleTimelineSearch}
          timelineSearched={views.timelineSearched}
          timelineLoading={views.timelineLoading}
          timelineError={views.timelineError}
          timelineItems={views.timelineItems}
          timelineTruncated={views.timelineTruncated}
          selectedId={selected?.item.id ?? null}
          onSelect={(selectedItem: DecisionSignalItem) => setSelected({ source: 'timeline', item: selectedItem })}
        />

        {error ? (
          <ApiErrorAlert
            error={{ ...error, title: t('decisionSignals.errorTitle') }}
            actionLabel={t('common.retry')}
            onAction={() => void loadSignals()}
          />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-secondary-text">{t('decisionSignals.total', { total })}</p>
          {loading ? <span className="text-xs text-secondary-text">{t('common.loading')}...</span> : null}
        </div>

        {!loading && items.length === 0 ? (
          <EmptyState
            title={t('decisionSignals.emptyTitle')}
            description={t('decisionSignals.emptyDescription')}
            icon={<Activity className="h-7 w-7" />}
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {items.map((item) => (
              <DecisionSignalCard
                key={item.id}
                item={item}
                onSelect={(selectedItem) => setSelected({ source: 'list', item: selectedItem })}
                selected={selected?.item.id === item.id}
              />
            ))}
          </div>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <SignalDetailDrawer
        selected={selected}
        onClose={() => setSelected(null)}
        reassess={reassess}
        detail={detail}
        statusUpdating={statusUpdating}
        onStatusAction={setPendingStatus}
      />

      {statusUpdating ? (
        <InlineAlert
          className="fixed bottom-5 right-5 z-[60] max-w-sm"
          variant="info"
          title={t('common.processing')}
          message={t('decisionSignals.confirmStatusTitle')}
        />
      ) : null}

      <ConfirmDialog
        isOpen={reassessPersistConfirm}
        title={t('decisionSignals.reassessPersistConfirmTitle')}
        message={t('decisionSignals.reassessPersistConfirmMessage')}
        confirmText={t('decisionSignals.reassessPersist')}
        confirmDisabled={reassessPersisting}
        cancelDisabled={reassessPersisting}
        onConfirm={() => void handlePersistReassess()}
        onCancel={() => setReassessPersistConfirm(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingStatus)}
        title={t('decisionSignals.confirmStatusTitle')}
        message={pendingStatus?.message ?? ''}
        confirmText={t('common.confirm')}
        confirmDisabled={statusUpdating}
        cancelDisabled={statusUpdating}
        onConfirm={() => void handleStatusUpdate()}
        onCancel={() => setPendingStatus(null)}
      />
    </AppPage>
  );
};

export default DecisionSignalsPage;
