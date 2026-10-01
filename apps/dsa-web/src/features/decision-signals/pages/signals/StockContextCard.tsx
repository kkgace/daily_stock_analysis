import type React from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui';
import { StockAutocomplete } from '@/components/StockAutocomplete';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import type { useSignalStockViews } from '@/features/decision-signals/hooks/useSignalStockViews';
import type { useStockCandidates } from '@/features/decision-signals/hooks/useStockCandidates';
import { getCandidateKey } from './signalPageUtils';

type StockContextCardProps = {
  views: ReturnType<typeof useSignalStockViews>;
  candidates: ReturnType<typeof useStockCandidates>;
};

export const StockContextCard: React.FC<StockContextCardProps> = ({ views, candidates }) => {
  const { t } = useUiLanguage();
  const {
    stockDraft,
    setStockDraft,
    activeStockContext,
    handleStockSubmit,
    handleCandidateSelect,
    handleStockFormSubmit,
    handleClearStockContext,
  } = views;
  const { stockCandidates, stockCandidateMode, historyCandidatesLoaded } = candidates;

  const activeStockLabel = activeStockContext
    ? [
      activeStockContext.displayCode ?? activeStockContext.code,
      activeStockContext.name,
      activeStockContext.market,
    ].filter(Boolean).join(' / ')
    : null;

  return (
    <Card title={t('decisionSignals.stockContextTitle')} subtitle={t('decisionSignals.stockContextDescription')} padding="md">
      <form
        className="flex flex-col gap-3 md:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          handleStockFormSubmit(stockDraft);
        }}
      >
        <div className="min-w-0 flex-1">
          <StockAutocomplete
            value={stockDraft}
            onChange={setStockDraft}
            onSubmit={handleStockSubmit}
            placeholder={t('decisionSignals.stockContextPlaceholder')}
            ariaLabel={t('decisionSignals.stockContextInput')}
          />
        </div>
        <button
          type="submit"
          className="btn-primary inline-flex h-11 items-center justify-center gap-2"
          disabled={!stockDraft.trim()}
        >
          <Search className="h-4 w-4" />
          {t('decisionSignals.stockContextApply')}
        </button>
        <button
          type="button"
          className="btn-secondary inline-flex h-11 items-center justify-center gap-2"
          onClick={handleClearStockContext}
          disabled={!activeStockContext && !stockDraft}
        >
          {t('decisionSignals.stockContextClear')}
        </button>
      </form>

      {activeStockLabel ? (
        <p className="mt-3 text-sm text-secondary-text">
          {t('decisionSignals.stockContextCurrent', { stock: activeStockLabel })}
        </p>
      ) : (
        <p className="mt-3 text-sm text-secondary-text">{t('decisionSignals.stockContextEmpty')}</p>
      )}

      {historyCandidatesLoaded && stockCandidates.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-muted-text">
            {stockCandidateMode === 'history'
              ? t('decisionSignals.stockContextRecent')
              : t('decisionSignals.stockContextPopular')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stockCandidates.map((candidate) => (
              <button
                key={`${candidate.source}:${getCandidateKey(candidate)}`}
                type="button"
                className="rounded-full border border-border/70 bg-elevated/40 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/60 hover:text-primary"
                onClick={() => handleCandidateSelect(candidate)}
              >
                <span className="font-mono">{candidate.displayCode ?? candidate.code}</span>
                {candidate.name ? <span className="ml-1 text-secondary-text">{candidate.name}</span> : null}
                {candidate.market ? <span className="ml-1 text-muted-text">/ {candidate.market}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : historyCandidatesLoaded ? (
        <p className="mt-4 text-sm text-secondary-text">{t('decisionSignals.stockContextNoCandidates')}</p>
      ) : null}
    </Card>
  );
};

export default StockContextCard;
