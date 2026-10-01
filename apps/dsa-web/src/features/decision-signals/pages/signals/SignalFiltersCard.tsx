import type React from 'react';
import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import {
  getDecisionSignalMarketLabel,
  getDecisionSignalMarketPhaseLabel,
  getDecisionSignalSourceTypeLabel,
} from '@/features/decision-signals/utils/decisionSignalLabels';
import { buildDecisionActionLabelMap } from '@/utils/decisionAction';
import {
  ACTION_OPTIONS,
  MARKET_OPTIONS,
  PHASE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_LABEL_KEYS,
  STATUS_OPTIONS,
  type ListFilters,
} from './types';

type SignalFiltersCardProps = {
  filters: ListFilters;
  setFilters: React.Dispatch<React.SetStateAction<ListFilters>>;
  onApply: (event: React.FormEvent) => void;
};

export const SignalFiltersCard: React.FC<SignalFiltersCardProps> = ({ filters, setFilters, onApply }) => {
  const { t } = useUiLanguage();
  const actionLabels = useMemo(() => buildDecisionActionLabelMap(t), [t]);

  return (
    <Card padding="md">
      <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-7" onSubmit={onApply}>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.market}
          onChange={(event) => setFilters((current) => ({ ...current, market: event.target.value as ListFilters['market'] }))}
          aria-label={t('decisionSignals.market')}
        >
          <option value="">{t('decisionSignals.allMarkets')}</option>
          {MARKET_OPTIONS.map((market) => (
            <option key={market} value={market}>{getDecisionSignalMarketLabel(market, t)}</option>
          ))}
        </select>
        <input
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.stockCode}
          onChange={(event) => setFilters((current) => ({ ...current, stockCode: event.target.value }))}
          placeholder={t('decisionSignals.stockCode')}
          aria-label={t('decisionSignals.stockCode')}
        />
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.action}
          onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value as ListFilters['action'] }))}
          aria-label={t('decisionSignals.action')}
        >
          <option value="">{t('decisionSignals.allActions')}</option>
          {ACTION_OPTIONS.map((action) => (
            <option key={action} value={action}>{actionLabels[action]}</option>
          ))}
        </select>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.marketPhase}
          onChange={(event) => setFilters((current) => ({ ...current, marketPhase: event.target.value as ListFilters['marketPhase'] }))}
          aria-label={t('decisionSignals.marketPhase')}
        >
          <option value="">{t('decisionSignals.allPhases')}</option>
          {PHASE_OPTIONS.map((phase) => (
            <option key={phase} value={phase}>{getDecisionSignalMarketPhaseLabel(phase, t)}</option>
          ))}
        </select>
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.sourceType}
          onChange={(event) => setFilters((current) => ({ ...current, sourceType: event.target.value as ListFilters['sourceType'] }))}
          aria-label={t('decisionSignals.source')}
        >
          <option value="">{t('decisionSignals.allSources')}</option>
          {SOURCE_OPTIONS.map((source) => (
            <option key={source} value={source}>{getDecisionSignalSourceTypeLabel(source, t)}</option>
          ))}
        </select>
        <input
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.sourceReportId}
          onChange={(event) => setFilters((current) => ({ ...current, sourceReportId: event.target.value }))}
          placeholder={t('decisionSignals.sourceReportId')}
          aria-label={t('decisionSignals.sourceReportId')}
          inputMode="numeric"
          min={1}
          step={1}
          type="number"
        />
        <select
          className="input-surface input-focus-glow h-11 rounded-xl border bg-transparent px-3 text-sm"
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ListFilters['status'] }))}
          aria-label={t('decisionSignals.status')}
        >
          <option value="">{t('decisionSignals.allStatuses')}</option>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{t(STATUS_LABEL_KEYS[status])}</option>)}
        </select>
        <button type="submit" className="btn-primary inline-flex h-11 items-center justify-center gap-2">
          <Search className="h-4 w-4" />
          {t('decisionSignals.filter')}
        </button>
      </form>
    </Card>
  );
};

export default SignalFiltersCard;
