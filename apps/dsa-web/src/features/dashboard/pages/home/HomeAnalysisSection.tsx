import type React from 'react';
import { BarChart3 } from 'lucide-react';
import { ApiErrorAlert, Button, EmptyState, InlineAlert } from '@/components/ui';
import { DashboardStateBlock } from '@/features/dashboard/components/dashboard';
import { StockHistoryTrendDrawer } from '@/features/dashboard/components/history';
import { MarketReviewReportView } from '@/features/dashboard/components/report/MarketReviewReportView';
import { ReportSummary } from '@/features/dashboard/components/report/ReportSummary';
import type { ParsedApiError } from '@/api/error';
import type {
  AnalysisReport,
  HistoryItem,
  MarketReviewPayload,
  ReportLanguage,
  StockHistoryFilters,
  StockHistoryRange,
} from '@/types/analysis';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';
import type { MarketReviewNotice } from '@/features/dashboard/pages/home/homeUtils';

type TranslateFn = (key: UiTextKey, params?: UiTextParams) => string;

type HomeAnalysisSectionProps = {
  scrollRef: React.Ref<HTMLElement>;
  t: TranslateFn;
  marketReviewNotice: MarketReviewNotice;
  marketReviewError: ParsedApiError | null;
  onDismissMarketReviewError: () => void;
  marketReviewReport: string | null;
  marketReviewPayload: MarketReviewPayload | null;
  liveMarketReviewLanguage: ReportLanguage;
  error: ParsedApiError | null;
  onClearError: () => void;
  isLoadingReport: boolean;
  selectedReport: AnalysisReport | null;
  isHistoryTrendOpen: boolean;
  isHistoryTrendUnavailable: boolean;
  isAnalyzing: boolean;
  isSubmittingMarketReview: boolean;
  onReanalyze: () => void;
  onAskFollowUp: () => void;
  onTriggerMarketReview: () => void;
  onToggleHistoryTrend: () => void;
  stockHistoryItems: HistoryItem[];
  stockHistoryTotal: number;
  stockHistoryHasMore: boolean;
  isLoadingStockHistory: boolean;
  isLoadingMoreStockHistory: boolean;
  stockHistoryError?: unknown;
  stockHistoryFilters: StockHistoryFilters;
  onCloseHistoryTrend: () => void;
  onStockHistoryRangeChange: (range: StockHistoryRange) => void;
  onLoadMoreStockHistory: () => void;
  onSelectHistoryRecord: (recordId: number) => void;
  onRetryHistoryTrend: () => void;
  onOpenMarkdownDrawer: () => void;
  onOpenHistoryRunFlow: (recordId: number) => void;
  watchlist: {
    isInWatchlist: (code: string) => boolean;
    onToggle: (code: string) => void;
    isActioning: boolean;
    actionMessage: string | null;
  };
};

export const HomeAnalysisSection: React.FC<HomeAnalysisSectionProps> = ({
  scrollRef,
  t,
  marketReviewNotice,
  marketReviewError,
  onDismissMarketReviewError,
  marketReviewReport,
  marketReviewPayload,
  liveMarketReviewLanguage,
  error,
  onClearError,
  isLoadingReport,
  selectedReport,
  isHistoryTrendOpen,
  isHistoryTrendUnavailable,
  isAnalyzing,
  isSubmittingMarketReview,
  onReanalyze,
  onAskFollowUp,
  onTriggerMarketReview,
  onToggleHistoryTrend,
  stockHistoryItems,
  stockHistoryTotal,
  stockHistoryHasMore,
  isLoadingStockHistory,
  isLoadingMoreStockHistory,
  stockHistoryError,
  stockHistoryFilters,
  onCloseHistoryTrend,
  onStockHistoryRangeChange,
  onLoadMoreStockHistory,
  onSelectHistoryRecord,
  onRetryHistoryTrend,
  onOpenMarkdownDrawer,
  onOpenHistoryRunFlow,
  watchlist,
}) => {
  const isMarketReviewHistoryReport = selectedReport?.meta.reportType === 'market_review';

  return (
    <section
      ref={scrollRef}
      data-testid="home-dashboard-scroll"
      className="flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto px-3 pb-4 md:px-6 touch-pan-y"
    >
      {marketReviewNotice ? (
        <div className="mb-3">
          <InlineAlert
            variant={marketReviewNotice.variant}
            title={marketReviewNotice.title}
            message={marketReviewNotice.message}
            className="rounded-xl px-3 py-2 text-xs shadow-none"
          />
        </div>
      ) : null}

      {marketReviewError ? (
        <div className="mb-3">
          <ApiErrorAlert
            error={marketReviewError}
            className="mb-1"
            onDismiss={onDismissMarketReviewError}
          />
        </div>
      ) : null}

      {marketReviewReport ? (
        <MarketReviewReportView
          content={marketReviewReport}
          payload={marketReviewPayload}
          reportLanguage={liveMarketReviewLanguage}
          className="mb-3"
        />
      ) : null}

      {error ? (
        <ApiErrorAlert
          error={error}
          className="mb-3"
          onDismiss={onClearError}
        />
      ) : null}
      {!marketReviewReport && isLoadingReport ? (
        <div className="flex h-full flex-col items-center justify-center">
          <DashboardStateBlock title={t('home.loadingReport')} loading />
        </div>
      ) : !marketReviewReport && selectedReport ? (
        <div className={isHistoryTrendOpen ? 'max-w-6xl space-y-4 pb-8' : 'max-w-4xl space-y-4 pb-8'}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isMarketReviewHistoryReport ? (
              <>
                <Button
                  variant="home-action-ai"
                  size="sm"
                  disabled={isAnalyzing || selectedReport.meta.id === undefined}
                  onClick={onReanalyze}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('home.reanalyze')}
                </Button>
                <Button
                  variant="home-action-ai"
                  size="sm"
                  disabled={selectedReport.meta.id === undefined}
                  onClick={onAskFollowUp}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {t('home.askAi')}
                </Button>
              </>
            ) : (
              <Button
                variant="home-action-ai"
                size="sm"
                disabled={isSubmittingMarketReview}
                isLoading={isSubmittingMarketReview}
                loadingText={t('home.submitMarketReview')}
                onClick={onTriggerMarketReview}
              >
                <BarChart3 className="h-4 w-4" />
                {t('home.rerunMarketReview')}
              </Button>
            )}
            <Button
              variant="home-action-ai"
              size="sm"
              disabled={selectedReport.meta.id === undefined || isHistoryTrendUnavailable}
              className={isHistoryTrendOpen ? 'border-primary/70 bg-primary/15 text-primary shadow-glow-cyan' : undefined}
              onClick={onToggleHistoryTrend}
            >
              <BarChart3 className="h-4 w-4" />
              {t('home.historyTrend')}
            </Button>
            <Button
              variant="home-action-ai"
              size="sm"
              disabled={selectedReport.meta.id === undefined}
              onClick={onOpenMarkdownDrawer}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {t('home.fullReport')}
            </Button>
          </div>
          {isHistoryTrendOpen ? (
            <StockHistoryTrendDrawer
              key={`stock-history-${selectedReport.meta.id}`}
              report={selectedReport}
              items={stockHistoryItems}
              total={stockHistoryTotal}
              hasMore={stockHistoryHasMore}
              isLoading={isLoadingStockHistory}
              isLoadingMore={isLoadingMoreStockHistory}
              error={stockHistoryError}
              filters={stockHistoryFilters}
              onClose={onCloseHistoryTrend}
              onRangeChange={onStockHistoryRangeChange}
              onLoadMore={onLoadMoreStockHistory}
              onSelectRecord={onSelectHistoryRecord}
              onRetry={onRetryHistoryTrend}
            />
          ) : (
            <ReportSummary
              data={selectedReport}
              isHistory
              onOpenRunFlow={onOpenHistoryRunFlow}
              watchlist={watchlist}
            />
          )}
        </div>
      ) : !marketReviewReport ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            title={t('home.startAnalysisTitle')}
            description={t('home.startAnalysisDescription')}
            className="max-w-xl border-dashed"
            icon={(
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 012 2v10m0 0a2 2 0 002-2h2a2 2 0 01-2-2h-2a2 2 0 01-2-2z" />
              </svg>
            )}
          />
        </div>
      ) : null}
    </section>
  );
};
