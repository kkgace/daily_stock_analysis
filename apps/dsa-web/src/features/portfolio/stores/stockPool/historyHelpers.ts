import type { AnalysisReport, HistoryItem, StockHistoryFilters, StockHistoryRange } from '@/types/analysis';
import { getRecentStartDate, getTodayInShanghai } from '@/utils/format';
import { toAssetAwareCodeKey, type AssetAwareAssetType } from '@/utils/stockCode';
import { MARKET_REVIEW_HISTORY_CODE, MARKET_REVIEW_HISTORY_PAGE_SIZE, PAGE_SIZE, STOCK_HISTORY_PAGE_SIZE } from './types';
import type { StockPoolState } from './types';

export function buildHistoryParams(page: number) {
  return {
    startDate: getRecentStartDate(30),
    endDate: getTodayInShanghai(),
    page,
    limit: PAGE_SIZE,
  };
}

export function buildMarketReviewHistoryParams(page: number) {
  return {
    stockCode: MARKET_REVIEW_HISTORY_CODE,
    reportType: 'market_review' as const,
    page,
    limit: MARKET_REVIEW_HISTORY_PAGE_SIZE,
  };
}

export function buildStockHistoryParams(stockCode: string, page: number, filters: StockHistoryFilters) {
  const params: {
    stockCode: string;
    reportType?: 'market_review';
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  } = {
    stockCode,
    page,
    limit: STOCK_HISTORY_PAGE_SIZE,
  };

  if (stockCode === MARKET_REVIEW_HISTORY_CODE) {
    params.reportType = 'market_review';
  }

  if (filters.range === '30d') {
    params.startDate = getRecentStartDate(30);
    params.endDate = getTodayInShanghai();
  } else if (filters.range === '90d') {
    params.startDate = getRecentStartDate(90);
    params.endDate = getTodayInShanghai();
  }

  return params;
}

export function reportToHistoryItem(report: AnalysisReport): HistoryItem | null {
  if (report.meta.id === undefined) {
    return null;
  }

  return {
    id: report.meta.id,
    queryId: report.meta.queryId,
    stockCode: report.meta.stockCode,
    stockName: report.meta.stockName,
    reportType: report.meta.reportType,
    trendPrediction: report.summary.trendPrediction,
    analysisSummary: report.summary.analysisSummary,
    sentimentScore: report.summary.sentimentScore,
    operationAdvice: report.summary.operationAdvice,
    action: report.summary.action,
    actionLabel: report.summary.actionLabel,
    currentPrice: report.meta.currentPrice,
    changePct: report.meta.changePct,
    modelUsed: report.meta.modelUsed,
    assetType: report.meta.assetType,
    createdAt: report.meta.createdAt,
  };
}

export function normalizeSelectedReport(report: AnalysisReport): AnalysisReport {
  if (report.meta.reportType !== 'market_review' || report.meta.stockCode) {
    return report;
  }
  return {
    ...report,
    meta: {
      ...report.meta,
      stockCode: MARKET_REVIEW_HISTORY_CODE,
    },
  };
}

export function normalizeStockCodeKey(
  stockCode: string | undefined,
  assetType?: AssetAwareAssetType | null,
): string {
  return toAssetAwareCodeKey(stockCode, assetType);
}

export function isDateInHistoryRange(createdAt: string | undefined, range: StockHistoryRange): boolean {
  if (range === 'all') {
    return true;
  }
  if (!createdAt) {
    return false;
  }

  const reportDate = createdAt.slice(0, 10);
  const startDate = range === '30d' ? getRecentStartDate(30) : getRecentStartDate(90);
  const endDate = getTodayInShanghai();

  return reportDate >= startDate && reportDate <= endDate;
}

export function includeSelectedReport(
  items: HistoryItem[],
  report: AnalysisReport,
  range: StockHistoryRange,
): HistoryItem[] {
  const current = reportToHistoryItem(report);
  if (!current || !isDateInHistoryRange(current.createdAt, range) || items.some((item) => item.id === current.id)) {
    return items;
  }
  return [current, ...items];
}

export function dedupeHistoryItems(items: HistoryItem[]): HistoryItem[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function resetStockHistoryState(set: (partial: Partial<StockPoolState>) => void) {
  set({
    stockHistoryItems: [],
    stockHistoryTotal: 0,
    stockHistoryPage: 1,
    stockHistoryHasMore: false,
    isLoadingStockHistory: false,
    isLoadingMoreStockHistory: false,
    stockHistoryError: null,
  });
}
