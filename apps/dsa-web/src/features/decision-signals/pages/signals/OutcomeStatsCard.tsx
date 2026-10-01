import type React from 'react';
import { BarChart3 } from 'lucide-react';
import { ApiErrorAlert, Card, EmptyState } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import type { ParsedApiError } from '@/api/error';
import type { DecisionSignalOutcomeStatsResponse } from '@/features/decision-signals/types/decisionSignals';
import { DecisionSignalProfileCalibration } from '@/features/decision-signals/components/decision-signals/DecisionSignalProfileCalibration';
import { formatStatPercent } from './signalPageUtils';

type OutcomeStatsCardProps = {
  outcomeStats: DecisionSignalOutcomeStatsResponse | null;
  statsLoading: boolean;
  statsError: ParsedApiError | null;
  onRetry: () => void;
};

export const OutcomeStatsCard: React.FC<OutcomeStatsCardProps> = ({
  outcomeStats,
  statsLoading,
  statsError,
  onRetry,
}) => {
  const { t } = useUiLanguage();

  return (
    <Card title={t('decisionSignals.statsTitle')} subtitle={t('decisionSignals.statsDescription')} padding="md">
      <p className="mb-3 text-sm text-secondary-text">{t('decisionSignals.statsGlobalScope')}</p>
      {statsError ? (
        <ApiErrorAlert
          error={{ ...statsError, title: t('decisionSignals.statsErrorTitle') }}
          actionLabel={t('common.retry')}
          onAction={onRetry}
        />
      ) : statsLoading ? (
        <p className="text-sm text-secondary-text">{t('common.loading')}...</p>
      ) : outcomeStats && outcomeStats.total > 0 ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border/60 bg-elevated/40 px-3 py-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.statsTotal')}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{outcomeStats.total}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-elevated/40 px-3 py-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.statsHitRate')}</p>
              <p className="mt-1 text-2xl font-semibold text-success">{formatStatPercent(outcomeStats.hitRatePct)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-elevated/40 px-3 py-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.outcome.hit')}</p>
              <p className="mt-1 text-2xl font-semibold text-success">{outcomeStats.hit}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-elevated/40 px-3 py-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.outcome.miss')}</p>
              <p className="mt-1 text-2xl font-semibold text-danger">{outcomeStats.miss}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-elevated/40 px-3 py-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.outcome.unable')}</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{outcomeStats.unable}</p>
            </div>
          </div>
          {outcomeStats.profileCalibration ? (
            <DecisionSignalProfileCalibration calibration={outcomeStats.profileCalibration} />
          ) : null}
        </div>
      ) : (
        <EmptyState
          className="border-none bg-transparent py-6 shadow-none"
          title={t('decisionSignals.noReviewedStatsTitle')}
          description={t('decisionSignals.noReviewedStatsDescription')}
          icon={<BarChart3 className="h-6 w-6" />}
        />
      )}
    </Card>
  );
};

export default OutcomeStatsCard;
