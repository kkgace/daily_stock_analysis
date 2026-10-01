import { getParsedApiError } from '@/api/error';
import { historyApi } from '@/features/dashboard/api/history';
import { fetchHistory, fetchMarketReviewHistory, fetchStockHistory } from './historyFetchers';
import { normalizeSelectedReport, resetStockHistoryState } from './historyHelpers';
import { requestSeq } from './requestControl';
import type { StockPoolState } from './types';

export type StockPoolGet = () => StockPoolState;
export type StockPoolSet = (partial: Partial<StockPoolState>) => void;

export function createHistoryActions(set: StockPoolSet, get: StockPoolGet) {
  return {
    openHistoryTrend: async () => {
      if (!get().selectedReport || !get().selectedReport?.meta.stockCode) {
        return;
      }
      set({ isHistoryTrendOpen: true });
      await fetchStockHistory(get, set, { reset: true });
    },

    closeHistoryTrend: () => {
      requestSeq.stockHistory += 1;
      resetStockHistoryState(set);
      set({
        isHistoryTrendOpen: false,
      });
    },

    setStockHistoryRange: async (range: StockPoolState['stockHistoryFilters']['range']) => {
      set({
        stockHistoryFilters: {
          ...get().stockHistoryFilters,
          range,
        },
      });
      if (get().isHistoryTrendOpen) {
        await fetchStockHistory(get, set, { reset: true });
      }
    },

    loadMoreStockHistory: async () => {
      const state = get();
      if (!state.isHistoryTrendOpen || state.isLoadingMoreStockHistory || !state.stockHistoryHasMore) {
        return;
      }
      await fetchStockHistory(get, set, { reset: false });
    },

    loadInitialHistory: async () => {
      await fetchHistory(get, set, { autoSelectFirst: true, reset: true });
    },

    refreshHistory: async (silent = false) => {
      await fetchHistory(get, set, { reset: true, silent });
    },

    refreshHistoryForCompletedTask: async (task: Parameters<StockPoolState['refreshHistoryForCompletedTask']>[0]) => {
      await fetchHistory(get, set, {
        reset: true,
        silent: true,
        selectLatestForStockCode: task.reportType === 'market_review' ? undefined : task.stockCode,
        selectLatestForStockAssetType: task.reportType === 'market_review' ? null : (task.assetType ?? null),
      });
    },

    loadMoreHistory: async () => {
      const state = get();
      if (state.isLoadingMore || !state.hasMore) {
        return;
      }
      await fetchHistory(get, set, { reset: false });
    },

    loadMarketReviewHistory: async () => {
      await fetchMarketReviewHistory(get, set, { reset: true });
    },

    refreshMarketReviewHistory: async (silent = false) => {
      await fetchMarketReviewHistory(get, set, { reset: true, silent });
    },

    loadMoreMarketReviewHistory: async () => {
      const state = get();
      if (state.isLoadingMoreMarketReviewHistory || !state.marketReviewHistoryHasMore) {
        return;
      }
      await fetchMarketReviewHistory(get, set, { reset: false });
    },

    selectHistoryItem: async (recordId: number, isUserInitiated = true) => {
      const requestId = ++requestSeq.report;
      if (isUserInitiated) {
        requestSeq.manualSelectionRequest += 1;
        requestSeq.manualSelectionRequestId = requestId;
      }
      const shouldShowInitialLoading = !get().selectedReport;

      if (shouldShowInitialLoading) {
        set({ isLoadingReport: true });
      }

      try {
        const report = normalizeSelectedReport(await historyApi.getDetail(recordId));
        if (requestId !== requestSeq.report) {
          return;
        }

        set({
          selectedReport: report,
          error: null,
          isLoadingReport: false,
        });

        if (!report.meta.stockCode) {
          requestSeq.stockHistory += 1;
          resetStockHistoryState(set);
          set({ isHistoryTrendOpen: false });
          return;
        }

        if (get().isHistoryTrendOpen) {
          await fetchStockHistory(get, set, { reset: true });
        }
      } catch (error) {
        if (requestId !== requestSeq.report) {
          return;
        }

        set({
          error: getParsedApiError(error),
          isLoadingReport: false,
        });
      } finally {
        if (isUserInitiated && requestSeq.manualSelectionRequestId === requestId) {
          requestSeq.manualSelectionRequestId = 0;
        }
      }
    },

    toggleHistorySelection: (recordId: number) => {
      const selected = new Set(get().selectedHistoryIds);
      if (selected.has(recordId)) {
        selected.delete(recordId);
      } else {
        selected.add(recordId);
      }

      set({ selectedHistoryIds: Array.from(selected) });
    },

    toggleSelectAllVisible: () => {
      const visibleIds = get().historyItems.map((item) => item.id);
      const selectedIds = get().selectedHistoryIds;
      const visibleSet = new Set(visibleIds);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

      set({
        selectedHistoryIds: allSelected
          ? selectedIds.filter((id) => !visibleSet.has(id))
          : Array.from(new Set([...selectedIds, ...visibleIds])),
      });
    },

    deleteSelectedHistory: async () => {
      const state = get();
      const recordIds = Array.from(new Set(state.selectedHistoryIds));
      if (recordIds.length === 0 || state.isDeletingHistory) {
        return;
      }

      set({ isDeletingHistory: true });
      try {
        await historyApi.deleteRecords(recordIds);

        const deletedIds = new Set(recordIds);
        const selectedWasDeleted = state.selectedReport?.meta.id !== undefined
          && deletedIds.has(state.selectedReport.meta.id);

        set({ selectedHistoryIds: [] });

        const freshPage = await fetchHistory(get, set, { reset: true });

        if (selectedWasDeleted) {
          const nextItem = freshPage?.items?.[0];
          if (nextItem) {
            await get().selectHistoryItem(nextItem.id, false);
          } else {
            requestSeq.stockHistory += 1;
            resetStockHistoryState(set);
            set({
              isHistoryTrendOpen: false,
              selectedReport: null,
            });
          }
        }
      } catch (error) {
        set({ error: getParsedApiError(error) });
      } finally {
        set({ isDeletingHistory: false });
      }
    },

    toggleMarketReviewHistorySelection: (recordId: number) => {
      const selected = new Set(get().selectedMarketReviewHistoryIds);
      if (selected.has(recordId)) {
        selected.delete(recordId);
      } else {
        selected.add(recordId);
      }

      set({ selectedMarketReviewHistoryIds: Array.from(selected) });
    },

    toggleSelectAllVisibleMarketReviewHistory: () => {
      const visibleIds = get().marketReviewHistoryItems.map((item) => item.id);
      const selectedIds = get().selectedMarketReviewHistoryIds;
      const visibleSet = new Set(visibleIds);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

      set({
        selectedMarketReviewHistoryIds: allSelected
          ? selectedIds.filter((id) => !visibleSet.has(id))
          : Array.from(new Set([...selectedIds, ...visibleIds])),
      });
    },

    deleteSelectedMarketReviewHistory: async () => {
      const state = get();
      const recordIds = Array.from(new Set(state.selectedMarketReviewHistoryIds));
      if (recordIds.length === 0 || state.isDeletingMarketReviewHistory) {
        return;
      }

      set({ isDeletingMarketReviewHistory: true });
      try {
        await historyApi.deleteRecords(recordIds);

        const deletedIds = new Set(recordIds);
        const selectedWasDeleted = state.selectedReport?.meta.id !== undefined
          && state.selectedReport.meta.reportType === 'market_review'
          && deletedIds.has(state.selectedReport.meta.id);

        set({ selectedMarketReviewHistoryIds: [] });

        const freshPage = await fetchMarketReviewHistory(get, set, { reset: true });

        if (selectedWasDeleted) {
          const nextItem = freshPage?.items?.[0];
          if (nextItem) {
            await get().selectHistoryItem(nextItem.id, false);
          } else {
            set({ selectedReport: null });
          }
        }
      } catch (error) {
        set({ error: getParsedApiError(error) });
      } finally {
        set({ isDeletingMarketReviewHistory: false });
      }
    },
  };
}
