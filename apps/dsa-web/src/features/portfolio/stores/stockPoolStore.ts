import { create } from 'zustand';
import { createAnalysisActions } from './stockPool/analysisActions';
import { createHistoryActions } from './stockPool/historyActions';
import { pendingCompletedTaskSelectionKeys } from './stockPool/completedTaskSelection';
import { resetRequestControl } from './stockPool/requestControl';
import { initialState } from './stockPool/types';
import type { SelectionSource, StockPoolState } from './stockPool/types';

export type { StockPoolState } from './stockPool/types';

export const useStockPoolStore = create<StockPoolState>((set, get) => ({
  ...initialState,

  setQuery: (query) => {
    set({
      query,
      selectionSource: 'manual' as SelectionSource,
      inputError: undefined,
      duplicateError: null,
    });
  },

  clearError: () => set({ error: null }),

  clearInlineMessages: () => set({ inputError: undefined, duplicateError: null }),

  setNotify: (notify) => set({ notify }),

  openMarkdownDrawer: () => set({ markdownDrawerOpen: true }),

  closeMarkdownDrawer: () => set({ markdownDrawerOpen: false }),

  resetDashboardState: () => {
    resetRequestControl();
    pendingCompletedTaskSelectionKeys.clear();
    set({ ...initialState });
  },

  ...createHistoryActions(set, get),
  ...createAnalysisActions(set, get),
}));
