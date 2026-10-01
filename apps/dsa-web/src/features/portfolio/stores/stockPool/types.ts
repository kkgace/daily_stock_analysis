import type { ParsedApiError } from '@/api/error';
import type { AnalysisReport, HistoryItem, ReportLanguage, StockBarItem, StockHistoryFilters, StockHistoryRange, TaskInfo } from '@/types/analysis';
import type { AssetAwareAssetType } from '@/utils/stockCode';

export const PAGE_SIZE = 20;
export const STOCK_HISTORY_PAGE_SIZE = 20;
export const MARKET_REVIEW_HISTORY_PAGE_SIZE = 10;
export const MARKET_REVIEW_HISTORY_CODE = 'MARKET';

export type SelectionSource = 'manual' | 'autocomplete' | 'import' | 'image';

export type FetchHistoryOptions = {
  autoSelectFirst?: boolean;
  reset?: boolean;
  silent?: boolean;
  selectLatestForStockCode?: string;
  selectLatestForStockAssetType?: AssetAwareAssetType | null;
};

export type SubmitAnalysisOptions = {
  stockCode?: string;
  stockName?: string;
  originalQuery?: string;
  selectionSource?: SelectionSource;
  notify?: boolean;
  forceRefresh?: boolean;
  skills?: string[];
  reportLanguage?: ReportLanguage;
};

export type CompletedTaskSelectionIntent = {
  manualSelectionSeq: number;
  selectedReportId: number | undefined;
};

export interface StockPoolState {
  query: string;
  selectionSource: SelectionSource;
  notify: boolean;
  inputError?: string;
  duplicateError: string | null;
  error: ParsedApiError | null;
  isAnalyzing: boolean;
  historyItems: HistoryItem[];
  selectedHistoryIds: number[];
  isDeletingHistory: boolean;
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentPage: number;
  marketReviewHistoryItems: HistoryItem[];
  selectedMarketReviewHistoryIds: number[];
  isLoadingMarketReviewHistory: boolean;
  isLoadingMoreMarketReviewHistory: boolean;
  isDeletingMarketReviewHistory: boolean;
  marketReviewHistoryHasMore: boolean;
  marketReviewHistoryPage: number;
  selectedReport: AnalysisReport | null;
  isLoadingReport: boolean;
  isHistoryTrendOpen: boolean;
  stockHistoryItems: HistoryItem[];
  stockHistoryTotal: number;
  stockHistoryPage: number;
  stockHistoryHasMore: boolean;
  isLoadingStockHistory: boolean;
  isLoadingMoreStockHistory: boolean;
  stockHistoryError: ParsedApiError | null;
  stockHistoryFilters: StockHistoryFilters;
  activeTasks: TaskInfo[];
  markdownDrawerOpen: boolean;
  stockBarItems: StockBarItem[];
  isLoadingStockBar: boolean;
  stockBarRefreshFailed: boolean;
  setQuery: (query: string) => void;
  clearError: () => void;
  clearInlineMessages: () => void;
  openMarkdownDrawer: () => void;
  closeMarkdownDrawer: () => void;
  openHistoryTrend: () => Promise<void>;
  closeHistoryTrend: () => void;
  setStockHistoryRange: (range: StockHistoryRange) => Promise<void>;
  loadMoreStockHistory: () => Promise<void>;
  loadInitialHistory: () => Promise<void>;
  refreshHistory: (silent?: boolean) => Promise<void>;
  refreshHistoryForCompletedTask: (task: TaskInfo) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  loadMarketReviewHistory: () => Promise<void>;
  refreshMarketReviewHistory: (silent?: boolean) => Promise<void>;
  loadMoreMarketReviewHistory: () => Promise<void>;
  selectHistoryItem: (recordId: number, isUserInitiated?: boolean) => Promise<void>;
  toggleHistorySelection: (recordId: number) => void;
  toggleSelectAllVisible: () => void;
  deleteSelectedHistory: () => Promise<void>;
  toggleMarketReviewHistorySelection: (recordId: number) => void;
  toggleSelectAllVisibleMarketReviewHistory: () => void;
  deleteSelectedMarketReviewHistory: () => Promise<void>;
  submitAnalysis: (options?: SubmitAnalysisOptions) => Promise<void>;
  setNotify: (notify: boolean) => void;
  syncTaskCreated: (task: TaskInfo) => void;
  syncTaskUpdated: (task: TaskInfo) => void;
  syncTaskFailed: (task: TaskInfo) => void;
  refreshActiveTasks: () => Promise<void>;
  removeTask: (taskId: string) => void;
  resetDashboardState: () => void;
  loadStockBar: () => Promise<void>;
  refreshStockBar: () => Promise<void>;
}

export const initialState = {
  query: '',
  selectionSource: 'manual' as SelectionSource,
  notify: true,
  inputError: undefined,
  duplicateError: null,
  error: null,
  isAnalyzing: false,
  historyItems: [] as HistoryItem[],
  selectedHistoryIds: [] as number[],
  isDeletingHistory: false,
  isLoadingHistory: false,
  isLoadingMore: false,
  hasMore: true,
  currentPage: 1,
  marketReviewHistoryItems: [] as HistoryItem[],
  selectedMarketReviewHistoryIds: [] as number[],
  isLoadingMarketReviewHistory: false,
  isLoadingMoreMarketReviewHistory: false,
  isDeletingMarketReviewHistory: false,
  marketReviewHistoryHasMore: false,
  marketReviewHistoryPage: 1,
  selectedReport: null as AnalysisReport | null,
  isLoadingReport: false,
  isHistoryTrendOpen: false,
  stockHistoryItems: [] as HistoryItem[],
  stockHistoryTotal: 0,
  stockHistoryPage: 1,
  stockHistoryHasMore: false,
  isLoadingStockHistory: false,
  isLoadingMoreStockHistory: false,
  stockHistoryError: null as ParsedApiError | null,
  stockHistoryFilters: {
    range: 'all' as StockHistoryRange,
    model: 'all',
    sort: 'desc' as const,
  },
  activeTasks: [] as TaskInfo[],
  markdownDrawerOpen: false,
  stockBarItems: [] as StockBarItem[],
  isLoadingStockBar: false,
  stockBarRefreshFailed: false,
};
