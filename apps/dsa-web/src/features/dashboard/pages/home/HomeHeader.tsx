import type React from 'react';
import { BarChart3, Check, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui';
import { StockAutocomplete } from '@/components/StockAutocomplete';
import { MarketReviewRegionSelector } from '@/features/dashboard/components/market-review/MarketReviewRegionSelector';
import type { useStrategyMenu } from '@/features/dashboard/hooks/useStrategyMenu';
import type { MarketReviewRegion } from '@/types/analysis';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';

type TranslateFn = (key: UiTextKey, params?: UiTextParams) => string;
type SubmitAnalysisSource = 'manual' | 'autocomplete' | 'import' | 'image';

type HomeHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  inputError: string | null;
  isAnalyzing: boolean;
  onSubmitAnalysis: (stockCode?: string, stockName?: string, selectionSource?: SubmitAnalysisSource) => void;
  onOpenSidebar: () => void;
  strategy: ReturnType<typeof useStrategyMenu>;
  marketReviewRegionOverride: MarketReviewRegion[] | undefined;
  onMarketReviewRegionChange: (regions: MarketReviewRegion[] | undefined) => void;
  notify: boolean;
  onNotifyChange: (notify: boolean) => void;
  isSubmittingMarketReview: boolean;
  onTriggerMarketReview: () => void;
  t: TranslateFn;
};

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  query,
  onQueryChange,
  inputError,
  isAnalyzing,
  onSubmitAnalysis,
  onOpenSidebar,
  strategy,
  marketReviewRegionOverride,
  onMarketReviewRegionChange,
  notify,
  onNotifyChange,
  isSubmittingMarketReview,
  onTriggerMarketReview,
  t,
}) => {
  const {
    analysisSkills,
    selectedStrategy,
    selectedStrategyId,
    strategyOptions,
    strategyMenuOpen,
    setStrategyMenuOpen,
    strategyMenuRef,
    strategyButtonRef,
    strategyItemRefs,
    selectStrategy,
    handleStrategyButtonKeyDown,
    handleStrategyMenuKeyDown,
  } = strategy;

  return (
    <header className="relative z-30 flex min-w-0 flex-shrink-0 items-center overflow-visible px-3 py-3 md:px-4 md:py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            onClick={onOpenSidebar}
            className="md:hidden -ml-1 flex-shrink-0 rounded-lg p-1.5 text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
            aria-label={t('home.historyButton')}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="relative min-w-0 flex-1">
            <StockAutocomplete
              value={query}
              onChange={onQueryChange}
              onSubmit={(stockCode, stockName, selectionSource) => {
                onSubmitAnalysis(stockCode, stockName, selectionSource);
              }}
              placeholder={t('home.placeholder')}
              disabled={isAnalyzing}
              className={inputError ? 'border-danger/50' : undefined}
            />
          </div>
          {analysisSkills.length > 0 ? (
            <div ref={strategyMenuRef} className="relative flex-shrink-0">
              <button
                ref={strategyButtonRef}
                id="strategy-menu-button"
                type="button"
                aria-haspopup="menu"
                aria-expanded={strategyMenuOpen}
                aria-controls={strategyMenuOpen ? 'strategy-menu' : undefined}
                onClick={() => setStrategyMenuOpen((open) => !open)}
                onKeyDown={handleStrategyButtonKeyDown}
                disabled={isAnalyzing}
                className="home-surface-button flex h-10 max-w-[8.5rem] items-center gap-1.5 rounded-xl px-3 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[11rem]"
              >
                <SlidersHorizontal className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedStrategy?.name || t('home.strategy')}</span>
              </button>
              {strategyMenuOpen ? (
                <div
                  id="strategy-menu"
                  role="menu"
                  aria-labelledby="strategy-menu-button"
                  onKeyDown={handleStrategyMenuKeyDown}
                  className="absolute right-0 top-11 z-[120] max-h-80 w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-subtle bg-elevated p-1.5 text-sm text-foreground shadow-2xl"
                >
                  {strategyOptions.map((option, index) => {
                    const selected = selectedStrategyId === option.id;
                    return (
                      <button
                        key={option.id || 'default'}
                        ref={(node) => {
                          strategyItemRefs.current[index] = node;
                        }}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        tabIndex={-1}
                        onClick={() => selectStrategy(option.id)}
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover"
                      >
                        <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block font-medium">{option.name}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-text">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <MarketReviewRegionSelector
            value={marketReviewRegionOverride}
            disabled={isSubmittingMarketReview}
            onChange={onMarketReviewRegionChange}
          />
          <label className="flex h-10 flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-subtle bg-surface/60 px-3 text-xs text-secondary-text select-none transition-colors hover:border-subtle-hover hover:text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <input
              type="checkbox"
              checked={notify}
              disabled={isSubmittingMarketReview}
              onChange={(e) => onNotifyChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            {t('home.notify')}
          </label>
          <Button
            type="button"
            variant="secondary"
            size="md"
            isLoading={isSubmittingMarketReview}
            loadingText={t('home.submitMarketReview')}
            onClick={onTriggerMarketReview}
            className="h-10 flex-1 whitespace-nowrap md:flex-none"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {t('home.marketReview')}
          </Button>
          <button
            type="button"
            onClick={() => onSubmitAnalysis()}
            disabled={!query || isAnalyzing}
            className="btn-primary flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap md:flex-none"
          >
            {isAnalyzing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('home.analyzing')}
              </>
            ) : (
              t('home.analyze')
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
