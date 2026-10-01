import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import { analysisApi, DuplicateTaskError } from '@/features/dashboard/api/analysis';
import { historyApi } from '@/features/dashboard/api/history';
import type {
  HomeWatchlistRow,
  HomeWorkspaceTab,
  WatchlistAnalyzeMode,
} from '@/features/dashboard/components/watchlist/HomeStockWorkspace';
import { useDashboardLifecycle, useHomeDashboardState } from '@/hooks';
import { HomeHeader } from '@/features/dashboard/pages/home/HomeHeader';
import { useStrategyMenu } from '@/features/dashboard/hooks/useStrategyMenu';
import { useDuplicateBanner } from '@/features/dashboard/hooks/useDuplicateBanner';
import { useTaskPanelCollapse } from '@/features/dashboard/hooks/useTaskPanelCollapse';
import { useSetupStatusNotice } from '@/features/dashboard/hooks/useSetupStatusNotice';
import { useTodayAnalysis } from '@/features/dashboard/hooks/useTodayAnalysis';
import { useWatchlistHistoryLookup } from '@/features/dashboard/hooks/useWatchlistHistoryLookup';
import { useMarketReviewRunner } from '@/features/dashboard/hooks/useMarketReviewRunner';
import { HomeSidebar } from '@/features/dashboard/pages/home/HomeSidebar';
import { HomeDrawers } from '@/features/dashboard/pages/home/HomeDrawers';
import { HomeAlerts } from '@/features/dashboard/pages/home/HomeAlerts';
import { HomeAnalysisSection } from '@/features/dashboard/pages/home/HomeAnalysisSection';
import { useWatchlist } from '@/features/dashboard/hooks/useWatchlist';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { normalizeReportLanguage } from '@/utils/reportLanguage';
import type {
  StockBarItem,
  TaskInfo,
} from '@/types/analysis';
import { useStockIndex } from '@/hooks/useStockIndex';
import { resolveRegisteredIndexCanonical, type AssetAwareAssetType } from '@/utils/stockCode';

import {
  getShanghaiDateKey,
  getStockCodeKey,
  chunkStockCodes,
  countBatchAccepted,
  type RunFlowDrawerState,
  type StockAnalysisNavigationState,
  type BatchAnalyzeStatus,
} from '@/features/dashboard/pages/home/homeUtils';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { language: uiLanguage, t } = useUiLanguage();
  const {
    index: stockIndexItems,
    fallback: isStockIndexFallback,
    loaded: isStockIndexLoaded,
  } = useStockIndex();
  // Registry is "ready" once loaded — or once an explicit fallback happened
  // (load failure), which keeps the existing fail-open stock semantics.
  const isStockIndexReady = isStockIndexLoaded || isStockIndexFallback;

  // PR #2312: raw watchlist strings carry no asset type — only an exact
  // canonical/display/alias hit on a loaded ``assetType=index`` registry row
  // buckets the code as an index; anything else keeps the legacy stock
  // normalization (fail-open). Backend-tagged items/tasks/reports never touch
  // the registry — they use their explicit asset type directly.
  const getWatchlistCodeIdentity = useCallback(
    (code: string | null | undefined): { key: string; assetType: AssetAwareAssetType } => {
      const trimmed = (code ?? '').trim();
      if (!trimmed) {
        return { key: '', assetType: 'stock' };
      }
      const indexCanonical = resolveRegisteredIndexCanonical(stockIndexItems, trimmed);
      if (indexCanonical) {
        return { key: indexCanonical, assetType: 'index' };
      }
      return { key: getStockCodeKey(trimmed, 'stock'), assetType: 'stock' };
    },
    [stockIndexItems],
  );

  const getWatchlistCodeKey = useCallback(
    (code: string | null | undefined): string => getWatchlistCodeIdentity(code).key,
    [getWatchlistCodeIdentity],
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const strategy = useStrategyMenu(t);
  const { selectedAnalysisSkills } = strategy;
  const [runFlowDrawer, setRunFlowDrawer] = useState<RunFlowDrawerState>({ open: false });
  const [sidebarWorkspaceTab, setSidebarWorkspaceTab] = useState<HomeWorkspaceTab>('history');
  const [isBatchAnalyzingWatchlist, setIsBatchAnalyzingWatchlist] = useState(false);
  const [batchAnalyzeStatus, setBatchAnalyzeStatus] = useState<BatchAnalyzeStatus>(null);
  const [todayAnalysisRefreshVersion, setTodayAnalysisRefreshVersion] = useState(0);
  const [isStockBarInitialLoadSettled, setIsStockBarInitialLoadSettled] = useState(false);
  const [completedTaskRefreshPendingCounts, setCompletedTaskRefreshPendingCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const stockBarLoadStartedRef = useRef(false);

  const {
    query,
    inputError,
    duplicateError,
    error,
    isAnalyzing,
    selectedReport,
    isLoadingReport,
    isHistoryTrendOpen,
    marketReviewHistoryItems,
    stockHistoryItems,
    stockHistoryTotal,
    stockHistoryHasMore,
    isLoadingStockHistory,
    isLoadingMoreStockHistory,
    stockHistoryError,
    stockHistoryFilters,
    activeTasks,
    markdownDrawerOpen,
    setQuery,
    clearError,
    loadInitialHistory,
    refreshHistory,
    refreshHistoryForCompletedTask,
    loadMarketReviewHistory,
    refreshMarketReviewHistory,
    selectHistoryItem,
    submitAnalysis,
    notify,
    setNotify,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    refreshActiveTasks,
    removeTask,
    openMarkdownDrawer,
    closeMarkdownDrawer,
    openHistoryTrend,
    closeHistoryTrend,
    setStockHistoryRange,
    loadMoreStockHistory,
    stockBarItems,
    isLoadingStockBar,
    stockBarRefreshFailed,
    loadStockBar,
    refreshStockBar,
  } = useHomeDashboardState();

  const { duplicateBannerVisible, dismissDuplicateBanner } = useDuplicateBanner(duplicateError);
  const { isTaskPanelCollapsed, handleTaskPanelCollapsedChange } = useTaskPanelCollapse(activeTasks.length);
  const { setupNeedsAction, setupMissingLabels } = useSetupStatusNotice(uiLanguage);

  useEffect(() => {
    document.title = t('home.pageTitle');
  }, [t]);

  const reportLanguage = normalizeReportLanguage(selectedReport?.meta.reportLanguage);
  const isHistoryTrendUnavailable = !selectedReport || !selectedReport.meta.stockCode;

  useEffect(() => {
    if (!isHistoryTrendUnavailable || !isHistoryTrendOpen) {
      return;
    }
    closeHistoryTrend();
  }, [closeHistoryTrend, isHistoryTrendOpen, isHistoryTrendUnavailable]);


  const handleCompletedTaskDataRefreshStarted = useCallback((task: TaskInfo) => {
    if (task.reportType === 'market_review') {
      return;
    }
    const key = getStockCodeKey(task.stockCode, task.assetType);
    if (!key) {
      return;
    }
    setCompletedTaskRefreshPendingCounts((current) => {
      const next = new Map(current);
      next.set(key, (next.get(key) ?? 0) + 1);
      return next;
    });
  }, []);

  const handleCompletedTaskDataRefreshed = useCallback((task: TaskInfo) => {
    if (task.reportType === 'market_review') {
      return;
    }
    const key = getStockCodeKey(task.stockCode, task.assetType);
    if (key) {
      setCompletedTaskRefreshPendingCounts((current) => {
        const pendingCount = current.get(key) ?? 0;
        if (pendingCount === 0) {
          return current;
        }
        const next = new Map(current);
        if (pendingCount === 1) {
          next.delete(key);
        } else {
          next.set(key, pendingCount - 1);
        }
        return next;
      });
    }
    setTodayAnalysisRefreshVersion((version) => version + 1);
  }, []);

  const handleDashboardDataRefresh = useCallback(() => {
    setTodayAnalysisRefreshVersion((version) => version + 1);
  }, []);

  useDashboardLifecycle({
    loadInitialHistory,
    refreshHistory,
    refreshHistoryForCompletedTask,
    loadMarketReviewHistory,
    refreshMarketReviewHistory,
    loadStockBar,
    refreshStockBar,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    refreshActiveTasks,
    removeTask,
    onDashboardDataRefresh: handleDashboardDataRefresh,
    onCompletedTaskDataRefreshStarted: handleCompletedTaskDataRefreshStarted,
    onCompletedTaskDataRefreshed: handleCompletedTaskDataRefreshed,
  });

  useEffect(() => {
    if (isLoadingStockBar) {
      stockBarLoadStartedRef.current = true;
      return;
    }
    if (stockBarLoadStartedRef.current || stockBarItems.length > 0) {
      setIsStockBarInitialLoadSettled(true);
    }
  }, [isLoadingStockBar, stockBarItems.length]);

  const watchlistState = useWatchlist();
  const refreshWatchlist = watchlistState.refresh;
  const watchlistCodesByNormalized = useMemo(() => {
    const codesByNormalized = new Map<string, string>();
    for (const code of watchlistState.watchlistCodes) {
      const key = getWatchlistCodeKey(code);
      if (!key || key === 'MARKET' || codesByNormalized.has(key)) {
        continue;
      }
      codesByNormalized.set(key, code);
    }
    return Array.from(codesByNormalized.entries());
  }, [getWatchlistCodeKey, watchlistState.watchlistCodes]);

  const stockBarItemByCode = useMemo(() => {
    const itemsByCode = new Map<string, StockBarItem>();
    for (const item of stockBarItems) {
      if (item.stockCode === 'MARKET') {
        continue;
      }
      const key = getStockCodeKey(item.stockCode, item.assetType);
      if (key) {
        itemsByCode.set(key, item);
      }
    }
    return itemsByCode;
  }, [stockBarItems]);

  // Watchlist identity resolution must never run while the stock index registry
  // is still loading: a raw index string (`sh000016`) would transiently fall
  // into the stock bucket and cross-link with the same-code stock. The lookup
  // stays off until the registry is loaded (or an explicit fallback happened),
  // at which point the existing fail-open semantics apply.
  const canLookupWatchlistHistory = isStockIndexReady && !isLoadingStockBar && isStockBarInitialLoadSettled;

  const watchlistMissingHistoryEntries = useMemo(
    () => (
      canLookupWatchlistHistory
        ? watchlistCodesByNormalized.filter(([key]) => !stockBarItemByCode.has(key))
        : []
    ),
    [canLookupWatchlistHistory, stockBarItemByCode, watchlistCodesByNormalized],
  );

  const watchlistMissingHistorySignature = useMemo(
    () => watchlistMissingHistoryEntries.map(([key]) => key).join('\n'),
    [watchlistMissingHistoryEntries],
  );

  const {
    watchlistHistoryItemsByCode,
    watchlistHistoryLookupState,
    retryWatchlistHistoryLookup,
  } = useWatchlistHistoryLookup({
    canLookupWatchlistHistory,
    watchlistMissingHistoryEntries,
    watchlistMissingHistorySignature,
    getWatchlistCodeKey,
  });

  const {
    dashboardScrollRef,
    isSubmittingMarketReview,
    marketReviewNotice,
    marketReviewError,
    setMarketReviewError,
    marketReviewReport,
    marketReviewPayload,
    liveMarketReviewLanguage,
    marketReviewRegionOverride,
    setMarketReviewRegionOverride,
    clearMarketReviewState,
    handleTriggerMarketReview,
  } = useMarketReviewRunner({ t, notify, refreshMarketReviewHistory });

  const handleHistoryItemClick = useCallback((recordId: number) => {
    clearMarketReviewState();
    void selectHistoryItem(recordId);
    setSidebarOpen(false);
  }, [clearMarketReviewState, selectHistoryItem]);

  const handleRefreshWatchlist = useCallback(async () => {
    await Promise.all([
      refreshWatchlist(),
      refreshStockBar(),
    ]);
    retryWatchlistHistoryLookup();
  }, [refreshStockBar, refreshWatchlist, retryWatchlistHistoryLookup]);

  const [isDeletingStock, setIsDeletingStock] = useState(false);
  const handleDeleteStock = useCallback(async (stockCode: string) => {
    if (isDeletingStock) return;
    setIsDeletingStock(true);
    try {
      await historyApi.deleteByCode(stockCode);
      await refreshStockBar();
      await refreshHistory(true);
      if (stockCode === 'MARKET') {
        await refreshMarketReviewHistory(false);
      }
    } catch {
      // error silently ignored
    } finally {
      setIsDeletingStock(false);
    }
  }, [isDeletingStock, refreshMarketReviewHistory, refreshStockBar, refreshHistory]);

  const handleSubmitAnalysis = useCallback(
    (
      stockCode?: string,
      stockName?: string,
      selectionSource?: 'manual' | 'autocomplete' | 'import' | 'image',
      analysisSkills?: string[],
    ) => {
      void submitAnalysis({
        stockCode,
        stockName,
        originalQuery: query,
        selectionSource: selectionSource ?? 'manual',
        skills: analysisSkills ?? selectedAnalysisSkills,
      });
    },
    [query, selectedAnalysisSkills, submitAnalysis],
  );

  useEffect(() => {
    const state = location.state as StockAnalysisNavigationState | null;
    const stockCode = typeof state?.stockCode === 'string' ? state.stockCode.trim() : '';
    if (!stockCode) {
      return;
    }
    const stockName = typeof state?.stockName === 'string' ? state.stockName.trim() : '';
    setQuery(stockCode);
    navigate(location.pathname, { replace: true, state: null });
    if (state?.autoAnalyze) {
      handleSubmitAnalysis(stockCode, stockName || undefined, 'import', state.skills);
    }
  }, [handleSubmitAnalysis, location.pathname, location.state, navigate, setQuery]);

  const handleAskFollowUp = useCallback(() => {
    if (selectedReport?.meta.id === undefined || selectedReport.meta.reportType === 'market_review') {
      return;
    }

    const code = selectedReport.meta.stockCode;
    const name = selectedReport.meta.stockName;
    const rid = selectedReport.meta.id;
    navigate(`/chat?stock=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&recordId=${rid}`);
  }, [navigate, selectedReport]);

  const handleReanalyze = useCallback(() => {
    if (!selectedReport || selectedReport.meta.reportType === 'market_review') {
      return;
    }

    void submitAnalysis({
      stockCode: selectedReport.meta.stockCode,
      stockName: selectedReport.meta.stockName,
      originalQuery: selectedReport.meta.stockCode,
      selectionSource: 'manual',
      forceRefresh: true,
      skills: selectedAnalysisSkills,
    });
  }, [selectedAnalysisSkills, selectedReport, submitAnalysis]);

  const openTaskRunFlow = useCallback((task: TaskInfo) => {
    const stock = task.stockName || task.stockCode || task.taskId;
    setRunFlowDrawer({
      open: true,
      source: { type: 'task', taskId: task.taskId },
      title: t('runFlow.taskDrawerTitle', { stock }),
    });
  }, [t]);

  const openHistoryRunFlow = useCallback((recordId: number) => {
    const meta = selectedReport?.meta.id === recordId ? selectedReport.meta : null;
    const stock = meta?.stockName || meta?.stockCode || String(recordId);
    setRunFlowDrawer({
      open: true,
      source: { type: 'history', recordId },
      title: t('runFlow.historyDrawerTitle', { stock }),
    });
  }, [selectedReport, t]);

  const closeRunFlowDrawer = useCallback(() => {
    setRunFlowDrawer({ open: false });
  }, []);


  const {
    todayDateKey,
    todayAnalysisItems,
    isLoadingTodayAnalysisItems,
    todayAnalysisLoadFailed,
  } = useTodayAnalysis(sidebarWorkspaceTab === 'today', todayAnalysisRefreshVersion);

  const activeTaskByCode = useMemo(() => {
    const tasksByCode = new Map<string, TaskInfo>();
    for (const task of activeTasks) {
      if (!['pending', 'processing', 'cancel_requested'].includes(task.status)) {
        continue;
      }
      if (task.reportType === 'market_review') {
        continue;
      }
      const key = getStockCodeKey(task.stockCode, task.assetType);
      if (key) {
        tasksByCode.set(key, task);
      }
    }
    return tasksByCode;
  }, [activeTasks]);

  const watchlistRows = useMemo<HomeWatchlistRow[]>(() => (
    watchlistState.watchlistCodes.map((code) => {
      const identity = getWatchlistCodeIdentity(code);
      const key = identity.key;
      const latestItemCandidate = key
        ? stockBarItemByCode.get(key) ?? watchlistHistoryItemsByCode.get(key)
        : undefined;
      const isMissingFromStockBar = Boolean(key && !stockBarItemByCode.has(key));
      const hasPendingHistoryLookup = Boolean(
        isMissingFromStockBar
        && (
          !canLookupWatchlistHistory
          ||
          watchlistHistoryLookupState.signature !== watchlistMissingHistorySignature
          || !watchlistHistoryLookupState.settledKeys.has(key)
        ),
      );
      const hasFailedHistoryLookup = Boolean(
        isMissingFromStockBar
        && canLookupWatchlistHistory
        && watchlistHistoryLookupState.signature === watchlistMissingHistorySignature
        && watchlistHistoryLookupState.failedKeys.has(key)
      );
      const isTodayStatusLoading = Boolean(
        isLoadingStockBar
        || hasPendingHistoryLookup
        || (key && completedTaskRefreshPendingCounts.has(key))
      );
      const isTodayStatusUnknown = Boolean(
        hasFailedHistoryLookup
        || (stockBarRefreshFailed && !hasPendingHistoryLookup)
      );
      const latestItem = isTodayStatusLoading || isTodayStatusUnknown
        ? undefined
        : latestItemCandidate;
      return {
        code,
        assetType: identity.assetType,
        // Registry-derived canonical identity: lets the workspace match a
        // canonical selected report against an alias-form raw watchlist row
        // (e.g. `000016.SH` -> identityKey `sh000016`) without re-parsing.
        identityKey: identity.key,
        latestItem,
        analyzedToday: !isTodayStatusLoading && !isTodayStatusUnknown && getShanghaiDateKey(latestItem?.lastAnalysisTime) === todayDateKey,
        isTodayStatusLoading,
        isTodayStatusUnknown,
        activeTask: key ? activeTaskByCode.get(key) : undefined,
      };
    })
  ), [
    activeTaskByCode,
    canLookupWatchlistHistory,
    completedTaskRefreshPendingCounts,
    isLoadingStockBar,
    stockBarRefreshFailed,
    getWatchlistCodeIdentity,
    stockBarItemByCode,
    todayDateKey,
    watchlistHistoryItemsByCode,
    watchlistHistoryLookupState,
    watchlistMissingHistorySignature,
    watchlistState.watchlistCodes,
  ]);

  const watchlistAnalyzedTodayCount = useMemo(
    () => watchlistRows.filter((row) => row.analyzedToday).length,
    [watchlistRows],
  );

  const pendingWatchlistCodes = useMemo(
    () => watchlistRows
      .filter((row) => !row.analyzedToday && !row.isTodayStatusLoading && !row.isTodayStatusUnknown)
      .map((row) => row.code),
    [watchlistRows],
  );

  const watchlistTodayStatusBlocked = useMemo(
    () => watchlistRows.some((row) => row.isTodayStatusLoading || row.isTodayStatusUnknown),
    [watchlistRows],
  );


  const handleAnalyzeWatchlist = useCallback(async (mode: WatchlistAnalyzeMode) => {
    // The workspace button is disabled while the registry loads, but keep this
    // guard at the action boundary so no alternate caller can dedupe an index
    // alias with a same-code stock using the temporary fail-open key.
    if (!isStockIndexReady) {
      return;
    }
    if (mode === 'pending' && watchlistTodayStatusBlocked) {
      setBatchAnalyzeStatus({
        variant: 'warning',
        message: t('watchlist.pendingStatusUnavailable'),
      });
      return;
    }

    const sourceCodes = mode === 'pending' ? pendingWatchlistCodes : watchlistState.watchlistCodes;
    const seen = new Set<string>();
    const targetCodes = sourceCodes.filter((code) => {
      const key = getWatchlistCodeKey(code);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    if (targetCodes.length === 0) {
      setBatchAnalyzeStatus({
        variant: 'warning',
        message: mode === 'pending' ? t('watchlist.noPendingAnalyze') : t('watchlist.noStocksAnalyze'),
      });
      return;
    }

    setIsBatchAnalyzingWatchlist(true);
    setBatchAnalyzeStatus(null);
    let acceptedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let rejectedReasons: string[] = [];
    let confirmedCodeCount = 0;
    let submissionError: ParsedApiError | null = null;
    try {
      for (const chunk of chunkStockCodes(targetCodes)) {
        try {
          const result = await analysisApi.analyzeAsync({
            stockCodes: chunk,
            reportType: 'detailed',
            notify,
            skills: selectedAnalysisSkills,
          });
          const counts = countBatchAccepted(result);
          acceptedCount += counts.accepted;
          duplicateCount += counts.duplicates;
          rejectedCount += counts.rejected;
          if (counts.rejected > 0 && 'rejected' in result && result.rejected) {
            rejectedReasons = rejectedReasons.concat(
              result.rejected.map((entry) => `${entry.stockCode}: ${entry.message}`),
            );
          }
          // accepted + duplicates + rejected is the server's full disposition of
          // this chunk. Rejected entries are an explicit server response (not a
          // short/partial response), so they count toward "confirmed" and must
          // not be mistaken for an incomplete response that halts later chunks.
          const confirmedInChunk = counts.accepted + counts.duplicates + counts.rejected;
          confirmedCodeCount += Math.min(confirmedInChunk, chunk.length);
          if (confirmedInChunk !== chunk.length) {
            submissionError = getParsedApiError(new Error(t('watchlist.batchIncompleteResponse', {
              confirmed: confirmedInChunk,
              requested: chunk.length,
            })));
            break;
          }
        } catch (error: unknown) {
          if (error instanceof DuplicateTaskError && chunk.length === 1) {
            duplicateCount += 1;
            confirmedCodeCount += 1;
            continue;
          }
          submissionError = getParsedApiError(error);
          break;
        }
      }

      // Reconcile even after a failed request: a timeout or disconnect may occur
      // after the server has accepted tasks, and earlier chunks may be running.
      await refreshActiveTasks();
      setSidebarWorkspaceTab('watchlist');

      if (submissionError) {
        if (acceptedCount > 0 || duplicateCount > 0 || rejectedCount > 0) {
          const partialKey = rejectedCount > 0
            ? 'watchlist.batchPartiallySubmittedWithRejected'
            : 'watchlist.batchPartiallySubmitted';
          setBatchAnalyzeStatus({
            variant: 'warning',
            message: t(partialKey, {
              accepted: acceptedCount,
              duplicates: duplicateCount,
              rejected: rejectedCount,
              unconfirmed: targetCodes.length - confirmedCodeCount,
              error: submissionError.message || t('watchlist.batchFailed'),
            }),
          });
        } else {
          setBatchAnalyzeStatus({
            variant: 'danger',
            message: submissionError.message || t('watchlist.batchFailed'),
          });
        }
        return;
      }

      if (rejectedCount > 0) {
        setBatchAnalyzeStatus({
          variant: 'warning',
          message: t('watchlist.batchSubmittedWithRejected', {
            accepted: acceptedCount,
            duplicates: duplicateCount,
            rejected: rejectedCount,
            reason: rejectedReasons[0] ?? t('watchlist.batchFailed'),
          }),
        });
        return;
      }

      setBatchAnalyzeStatus({
        variant: acceptedCount > 0 ? 'success' : 'warning',
        message: t('watchlist.batchSubmitted', {
          accepted: acceptedCount,
          duplicates: duplicateCount,
        }),
      });
    } catch (error: unknown) {
      const parsed = getParsedApiError(error);
      setBatchAnalyzeStatus({
        variant: 'danger',
        message: parsed.message || t('watchlist.batchFailed'),
      });
    } finally {
      setIsBatchAnalyzingWatchlist(false);
    }
  }, [
    getWatchlistCodeKey,
    isStockIndexReady,
    notify,
    pendingWatchlistCodes,
    refreshActiveTasks,
    selectedAnalysisSkills,
    t,
    watchlistTodayStatusBlocked,
    watchlistState.watchlistCodes,
  ]);

  const mergedStockBarItems = useMemo<StockBarItem[]>(() => {
    const latestMarketReview = marketReviewHistoryItems[0];
    const stockItems = stockBarItems.filter((item) => item.stockCode !== 'MARKET');
    if (!latestMarketReview) {
      return stockItems;
    }

    const marketReviewItem: StockBarItem = {
      id: latestMarketReview.id,
      stockCode: 'MARKET',
      stockName: latestMarketReview.stockName || t('home.marketReview'),
      reportType: 'market_review',
      sentimentScore: latestMarketReview.sentimentScore,
      operationAdvice: latestMarketReview.operationAdvice,
      analysisCount: Math.max(marketReviewHistoryItems.length, 1),
      lastAnalysisTime: latestMarketReview.createdAt,
      modelUsed: latestMarketReview.modelUsed,
      marketPhaseSummary: latestMarketReview.marketPhaseSummary,
    };

    return [marketReviewItem, ...stockItems].sort((left, right) => {
      const leftTime = left.lastAnalysisTime ? Date.parse(left.lastAnalysisTime) : 0;
      const rightTime = right.lastAnalysisTime ? Date.parse(right.lastAnalysisTime) : 0;
      return rightTime - leftTime;
    });
  }, [marketReviewHistoryItems, stockBarItems, t]);

  const sidebarContent = useMemo(
    () => (
      <HomeSidebar
        tasks={activeTasks}
        onOpenRunFlow={openTaskRunFlow}
        isTaskPanelCollapsed={isTaskPanelCollapsed}
        onTaskPanelCollapsedChange={handleTaskPanelCollapsedChange}
        workspace={{
          activeTab: sidebarWorkspaceTab,
          onTabChange: setSidebarWorkspaceTab,
          watchlistRows,
          watchlistLoading: watchlistState.isLoading || !isStockIndexReady,
          watchlistActioning: watchlistState.isActioning,
          watchlistMessage: watchlistState.actionMessage,
          onAddToWatchlist: watchlistState.addToWatchlist,
          onRemoveFromWatchlist: watchlistState.removeFromWatchlist,
          onRefreshWatchlist: handleRefreshWatchlist,
          onAnalyzeWatchlist: handleAnalyzeWatchlist,
          isBatchAnalyzing: isBatchAnalyzingWatchlist,
          batchStatus: batchAnalyzeStatus,
          todayItems: todayAnalysisItems,
          isLoadingTodayItems: isLoadingTodayAnalysisItems,
          todayLoadError: todayAnalysisLoadFailed,
          watchlistAnalyzedTodayCount,
          historyItems: mergedStockBarItems,
          isLoadingHistory: isLoadingStockBar,
          selectedStockCode: selectedReport?.meta.stockCode,
          selectedAssetType: selectedReport?.meta.assetType ?? null,
          selectedRecordId: selectedReport?.meta.id,
          onHistoryItemClick: handleHistoryItemClick,
          onDeleteStock: handleDeleteStock,
          isDeleting: isDeletingStock,
        }}
      />
    ),
    [
      activeTasks,
      batchAnalyzeStatus,
      handleAnalyzeWatchlist,
      handleDeleteStock,
      handleHistoryItemClick,
      handleRefreshWatchlist,
      handleTaskPanelCollapsedChange,
      isBatchAnalyzingWatchlist,
      isDeletingStock,
      isLoadingStockBar,
      isLoadingTodayAnalysisItems,
      isStockIndexReady,
      isTaskPanelCollapsed,
      todayAnalysisLoadFailed,
      mergedStockBarItems,
      openTaskRunFlow,
      selectedReport?.meta.id,
      selectedReport?.meta.assetType,
      selectedReport?.meta.stockCode,
      sidebarWorkspaceTab,
      todayAnalysisItems,
      watchlistAnalyzedTodayCount,
      watchlistRows,
      watchlistState.actionMessage,
      watchlistState.addToWatchlist,
      watchlistState.isActioning,
      watchlistState.isLoading,
      watchlistState.removeFromWatchlist,
    ],
  );

  return (
    <div
      data-testid="home-dashboard"
      className="flex h-[calc(100vh-5rem)] w-full flex-col overflow-hidden md:flex-row sm:h-[calc(100vh-5.5rem)] lg:h-[calc(100vh-2rem)]"
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full lg:max-w-6xl mx-auto w-full">
        <HomeHeader
          query={query}
          onQueryChange={setQuery}
          inputError={inputError ?? null}
          isAnalyzing={isAnalyzing}
          onSubmitAnalysis={(stockCode, stockName, selectionSource) => {
            handleSubmitAnalysis(stockCode, stockName, selectionSource);
          }}
          onOpenSidebar={() => setSidebarOpen(true)}
          strategy={strategy}
          marketReviewRegionOverride={marketReviewRegionOverride}
          onMarketReviewRegionChange={setMarketReviewRegionOverride}
          notify={notify}
          onNotifyChange={setNotify}
          isSubmittingMarketReview={isSubmittingMarketReview}
          onTriggerMarketReview={() => void handleTriggerMarketReview()}
          t={t}
        />

        <HomeAlerts
          inputError={inputError ?? null}
          duplicateError={duplicateError ?? null}
          duplicateBannerVisible={duplicateBannerVisible}
          onDismissDuplicateBanner={dismissDuplicateBanner}
          setupNeedsAction={setupNeedsAction}
          setupMissingLabels={setupMissingLabels}
          onGoSettings={() => navigate('/settings')}
          t={t}
        />

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="hidden min-h-0 w-64 shrink-0 flex-col overflow-hidden pl-4 pb-4 md:flex lg:w-72">
            {sidebarContent}
          </div>

          {sidebarOpen ? (
            <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
              <div className="page-drawer-overlay absolute inset-0" />
              <div
                className="dashboard-card absolute bottom-0 left-0 top-0 flex w-72 flex-col overflow-hidden !rounded-none !rounded-r-xl p-3 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                {sidebarContent}
              </div>
            </div>
          ) : null}

          <HomeAnalysisSection
            scrollRef={dashboardScrollRef}
            t={t}
            marketReviewNotice={marketReviewNotice}
            marketReviewError={marketReviewError}
            onDismissMarketReviewError={() => setMarketReviewError(null)}
            marketReviewReport={marketReviewReport}
            marketReviewPayload={marketReviewPayload}
            liveMarketReviewLanguage={liveMarketReviewLanguage}
            error={error}
            onClearError={clearError}
            isLoadingReport={isLoadingReport}
            selectedReport={selectedReport}
            isHistoryTrendOpen={isHistoryTrendOpen}
            isHistoryTrendUnavailable={isHistoryTrendUnavailable}
            isAnalyzing={isAnalyzing}
            isSubmittingMarketReview={isSubmittingMarketReview}
            onReanalyze={handleReanalyze}
            onAskFollowUp={handleAskFollowUp}
            onTriggerMarketReview={() => void handleTriggerMarketReview()}
            onToggleHistoryTrend={() => {
              if (isHistoryTrendOpen) {
                closeHistoryTrend();
                return;
              }
              void openHistoryTrend();
            }}
            stockHistoryItems={stockHistoryItems}
            stockHistoryTotal={stockHistoryTotal}
            stockHistoryHasMore={stockHistoryHasMore}
            isLoadingStockHistory={isLoadingStockHistory}
            isLoadingMoreStockHistory={isLoadingMoreStockHistory}
            stockHistoryError={stockHistoryError}
            stockHistoryFilters={stockHistoryFilters}
            onCloseHistoryTrend={closeHistoryTrend}
            onStockHistoryRangeChange={(range) => void setStockHistoryRange(range)}
            onLoadMoreStockHistory={() => void loadMoreStockHistory()}
            onSelectHistoryRecord={(recordId) => void selectHistoryItem(recordId)}
            onRetryHistoryTrend={() => void openHistoryTrend()}
            onOpenMarkdownDrawer={openMarkdownDrawer}
            onOpenHistoryRunFlow={openHistoryRunFlow}
            watchlist={{
              isInWatchlist: watchlistState.isInWatchlist,
              onToggle: watchlistState.toggleWatchlist,
              isActioning: watchlistState.isActioning,
              actionMessage: watchlistState.actionMessage,
            }}
          />
        </div>
      </div>

      <HomeDrawers
        t={t}
        markdownDrawerOpen={markdownDrawerOpen}
        selectedReport={selectedReport}
        reportLanguage={reportLanguage}
        onCloseMarkdownDrawer={closeMarkdownDrawer}
        runFlowDrawer={runFlowDrawer}
        onCloseRunFlowDrawer={closeRunFlowDrawer}
      />

    </div>
  );
};

export default HomePage;
