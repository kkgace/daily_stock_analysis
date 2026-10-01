import { getParsedApiError } from '@/api/error';
import { historyApi } from '@/features/dashboard/api/history';
import type { HistoryListResponse } from '@/types/analysis';
import { consumeCompletedTaskSelection, queueCompletedTaskSelection } from './completedTaskSelection';
import {
  buildHistoryParams,
  buildMarketReviewHistoryParams,
  buildStockHistoryParams,
  dedupeHistoryItems,
  includeSelectedReport,
  resetStockHistoryState,
} from './historyHelpers';
import { requestSeq } from './requestControl';
import type { FetchHistoryOptions, StockPoolState } from './types';

export async function fetchStockHistory(
  get: () => StockPoolState,
  set: (partial: Partial<StockPoolState>) => void,
  options: { reset?: boolean } = {},
): Promise<HistoryListResponse | null> {
  const { reset = true } = options;
  const state = get();
  const report = state.selectedReport;

  if (!report || !report.meta.stockCode) {
    resetStockHistoryState(set);
    set({
      isHistoryTrendOpen: false,
    });
    return null;
  }

  const page = reset ? 1 : state.stockHistoryPage + 1;
  const requestId = ++requestSeq.stockHistory;
  set(
    reset
      ? { isLoadingStockHistory: true, isLoadingMoreStockHistory: false, stockHistoryError: null }
      : { isLoadingMoreStockHistory: true, stockHistoryError: null },
  );

  try {
    const response = await historyApi.getList(
      buildStockHistoryParams(report.meta.stockCode, page, state.stockHistoryFilters),
    );
    if (requestId !== requestSeq.stockHistory) {
      return null;
    }

    const nextItems = reset
      ? dedupeHistoryItems(includeSelectedReport(response.items, report, state.stockHistoryFilters.range))
      : dedupeHistoryItems([...get().stockHistoryItems, ...response.items]);
    const nextTotal = Math.max(response.total, nextItems.length);
    set({
      stockHistoryItems: nextItems,
      stockHistoryTotal: nextTotal,
      stockHistoryPage: page,
      stockHistoryHasMore: nextItems.length < nextTotal,
    });
    return response;
  } catch (error) {
    if (requestId !== requestSeq.stockHistory) {
      return null;
    }
    set({ stockHistoryError: getParsedApiError(error) });
    return null;
  } finally {
    if (requestId === requestSeq.stockHistory) {
      set({
        isLoadingStockHistory: false,
        isLoadingMoreStockHistory: false,
      });
    }
  }
}

export async function fetchHistory(
  get: () => StockPoolState,
  set: (partial: Partial<StockPoolState>) => void,
  options: FetchHistoryOptions = {},
): Promise<HistoryListResponse | null> {
  const {
    autoSelectFirst = false,
    reset = true,
    silent = false,
    selectLatestForStockCode,
    selectLatestForStockAssetType,
  } = options;
  const currentState = get();
  const page = reset ? 1 : currentState.currentPage + 1;
  if (reset) {
    queueCompletedTaskSelection(
      selectLatestForStockCode,
      currentState.selectedReport,
      selectLatestForStockAssetType,
    );
  }
  const requestId = ++requestSeq.history;

  if (!silent) {
    set(
      reset
        ? { isLoadingHistory: true, isLoadingMore: false, currentPage: 1 }
        : { isLoadingMore: true },
    );
  }

  try {
    const response = await historyApi.getList(buildHistoryParams(page));
    if (requestId !== requestSeq.history) {
      return null;
    }

    if (silent && reset) {
      const existingIds = new Set(get().historyItems.map((item) => item.id));
      const newItems = response.items.filter((item) => !existingIds.has(item.id));
      if (newItems.length > 0) {
        set({ historyItems: [...newItems, ...get().historyItems] });
      }
    } else if (reset) {
      set({
        historyItems: response.items,
        currentPage: 1,
      });
    } else {
      set({
        historyItems: [...get().historyItems, ...response.items],
        currentPage: page,
      });
    }

    if (!silent) {
      const totalLoaded = reset ? response.items.length : get().historyItems.length;
      set({ hasMore: totalLoaded < response.total });
    }

    const visibleIds = new Set(get().historyItems.map((item) => item.id));
    set({
      selectedHistoryIds: get().selectedHistoryIds.filter((id) => visibleIds.has(id)),
    });

    if (reset) {
      const latestCompletedTaskItem = consumeCompletedTaskSelection(response.items, get().selectedReport);
      const selectedReport = get().selectedReport;
      if (latestCompletedTaskItem && latestCompletedTaskItem.id !== selectedReport?.meta.id) {
        await get().selectHistoryItem(latestCompletedTaskItem.id, false);
      } else if (autoSelectFirst && response.items.length > 0 && !selectedReport) {
        await get().selectHistoryItem(response.items[0].id, false);
      }
    }

    return response;
  } catch (error) {
    if (requestId !== requestSeq.history) {
      return null;
    }
    set({ error: getParsedApiError(error) });
    return null;
  } finally {
    if (requestId === requestSeq.history) {
      set({
        isLoadingHistory: false,
        isLoadingMore: false,
      });
    }
  }
}

export async function fetchMarketReviewHistory(
  get: () => StockPoolState,
  set: (partial: Partial<StockPoolState>) => void,
  options: FetchHistoryOptions = {},
): Promise<HistoryListResponse | null> {
  const { reset = true, silent = false } = options;
  const currentState = get();
  const page = reset ? 1 : currentState.marketReviewHistoryPage + 1;
  const requestId = ++requestSeq.marketReviewHistory;

  if (!silent) {
    set(
      reset
        ? { isLoadingMarketReviewHistory: true, isLoadingMoreMarketReviewHistory: false, marketReviewHistoryPage: 1 }
        : { isLoadingMoreMarketReviewHistory: true },
    );
  }

  try {
    const response = await historyApi.getList(buildMarketReviewHistoryParams(page));
    if (requestId !== requestSeq.marketReviewHistory) {
      return null;
    }

    if (silent && reset) {
      const existingIds = new Set(get().marketReviewHistoryItems.map((item) => item.id));
      const newItems = response.items.filter((item) => !existingIds.has(item.id));
      if (newItems.length > 0) {
        set({ marketReviewHistoryItems: [...newItems, ...get().marketReviewHistoryItems] });
      }
    } else if (reset) {
      set({
        marketReviewHistoryItems: response.items,
        marketReviewHistoryPage: 1,
      });
    } else {
      set({
        marketReviewHistoryItems: dedupeHistoryItems([...get().marketReviewHistoryItems, ...response.items]),
        marketReviewHistoryPage: page,
      });
    }

    const totalLoaded = reset ? response.items.length : get().marketReviewHistoryItems.length;
    set({ marketReviewHistoryHasMore: totalLoaded < response.total });

    const visibleIds = new Set(get().marketReviewHistoryItems.map((item) => item.id));
    set({
      selectedMarketReviewHistoryIds: get().selectedMarketReviewHistoryIds.filter((id) => visibleIds.has(id)),
    });

    return response;
  } catch (error) {
    if (requestId !== requestSeq.marketReviewHistory) {
      return null;
    }
    set({ error: getParsedApiError(error) });
    return null;
  } finally {
    if (requestId === requestSeq.marketReviewHistory) {
      set({
        isLoadingMarketReviewHistory: false,
        isLoadingMoreMarketReviewHistory: false,
      });
    }
  }
}
