import type React from 'react';
import { Activity, Search } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import type { UiTextKey } from '@/i18n/uiText';
import type { ParsedApiError } from '@/api/error';
import type {
  DecisionSignalItem,
  DecisionSignalMarket,
} from '@/features/decision-signals/types/decisionSignals';
import { DecisionSignalTimeline } from '@/features/decision-signals/components/decision-signals/DecisionSignalTimeline';
import { getDecisionSignalMarketLabel } from '@/features/decision-signals/utils/decisionSignalLabels';
import {
  MARKET_OPTIONS,
  REASSESS_PROFILES,
  type TimelineFilters,
  type TimelineRange,
  type TimelineStatusFilter,
} from './types';

type SignalTimelineCardProps = {
  hasStockContext: boolean;
  timelineFilters: TimelineFilters;
  setTimelineFilters: React.Dispatch<React.SetStateAction<TimelineFilters>>;
  onMarketChange: (market: '' | DecisionSignalMarket) => void;
  onSubmit: (event: React.FormEvent) => void;
  timelineSearched: boolean;
  timelineLoading: boolean;
  timelineError: ParsedApiError | null;
  timelineItems: DecisionSignalItem[];
  timelineTruncated: boolean;
  selectedId: number | null;
  onSelect: (item: DecisionSignalItem) => void;
  canSearch: boolean;
};

export const SignalTimelineCard: React.FC<SignalTimelineCardProps> = ({
  hasStockContext,
  timelineFilters,
  setTimelineFilters,
  onMarketChange,
  onSubmit,
  timelineSearched,
  timelineLoading,
  timelineError,
  timelineItems,
  timelineTruncated,
  selectedId,
  onSelect,
  canSearch,
}) => {
  const { t } = useUiLanguage();

  return (
    <Card title={t('decisionSignals.timelineTitle')} subtitle={t('decisionSignals.timelineDescription')} padding="md">
      <form className="grid gap-3 md:grid-cols-5" onSubmit={onSubmit}>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={timelineFilters.market}
          onChange={(event) => onMarketChange(event.target.value as TimelineFilters['market'])}
          aria-label={t('decisionSignals.timelineMarket')}
        >
          <option value="">{t('decisionSignals.allMarkets')}</option>
          {MARKET_OPTIONS.map((market) => (
            <option key={market} value={market}>{getDecisionSignalMarketLabel(market, t)}</option>
          ))}
        </select>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={timelineFilters.range}
          onChange={(event) => setTimelineFilters((current) => ({ ...current, range: event.target.value as TimelineRange }))}
          aria-label={t('decisionSignals.timelineRange')}
        >
          <option value="30d">{t('decisionSignals.timelineRange.30d')}</option>
          <option value="90d">{t('decisionSignals.timelineRange.90d')}</option>
          <option value="180d">{t('decisionSignals.timelineRange.180d')}</option>
        </select>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={timelineFilters.status}
          onChange={(event) => setTimelineFilters((current) => ({ ...current, status: event.target.value as TimelineStatusFilter }))}
          aria-label={t('decisionSignals.timelineStatus')}
        >
          <option value="all">{t('decisionSignals.timelineStatus.all')}</option>
          <option value="active">{t('decisionSignals.timelineStatus.active')}</option>
        </select>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={timelineFilters.decisionProfile}
          onChange={(event) => setTimelineFilters((current) => ({
            ...current,
            decisionProfile: event.target.value as TimelineFilters['decisionProfile'],
          }))}
          aria-label={t('decisionSignals.timelineProfile')}
        >
          <option value="">{t('decisionSignals.allProfiles')}</option>
          {REASSESS_PROFILES.map((profile) => (
            <option key={profile} value={profile}>
              {t(`decisionSignals.profile.${profile}` as UiTextKey)}
            </option>
          ))}
          <option value="unknown">{t('decisionSignals.profile.unknown')}</option>
        </select>
        <button
          type="submit"
          className="btn-secondary inline-flex h-11 items-center justify-center gap-2"
          disabled={timelineLoading || !canSearch}
        >
          <Search className="h-4 w-4" />
          {t('decisionSignals.timelineSearch')}
        </button>
      </form>
      <div className="mt-4">
        {!timelineSearched ? (
          <EmptyState
            className="border-none bg-transparent py-6 shadow-none"
            title={hasStockContext ? t('decisionSignals.timelineGuideTitle') : t('decisionSignals.stockContextGuideTitle')}
            description={hasStockContext ? t('decisionSignals.timelineGuideDescription') : t('decisionSignals.stockContextGuideDescription')}
            icon={<Activity className="h-6 w-6" />}
          />
        ) : (
          <DecisionSignalTimeline
            items={timelineItems}
            selectedId={selectedId}
            loading={timelineLoading}
            error={timelineError?.message ?? null}
            truncated={timelineTruncated}
            onSelect={onSelect}
          />
        )}
      </div>
    </Card>
  );
};

export default SignalTimelineCard;
