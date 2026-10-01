import { analysisApi, DuplicateTaskError } from '@/features/dashboard/api/analysis';
import { getParsedApiError } from '@/api/error';
import { historyApi } from '@/features/dashboard/api/history';
import type { TaskInfo } from '@/types/analysis';
import { getRecentStartDate, getTodayInShanghai } from '@/utils/format';
import { isObviouslyInvalidStockQuery, looksLikeStockCode, validateStockCode } from '@/utils/validation';
import { requestSeq, dismissedTaskIds } from './requestControl';
import type { StockPoolGet, StockPoolSet } from './historyActions';
import type { StockPoolState, SubmitAnalysisOptions } from './types';

export function createAnalysisActions(set: StockPoolSet, get: StockPoolGet) {
  return {
    submitAnalysis: async (options?: SubmitAnalysisOptions) => {
      const state = get();
      const rawStockCode = options?.stockCode ?? state.query;
      const stockCodeInput = rawStockCode.trim();
      const stockName = options?.stockName;
      const selectionSource = options?.selectionSource ?? state.selectionSource;
      const originalQuery = (options?.originalQuery ?? state.query).trim();
      const notify = options?.notify ?? state.notify;
      const forceRefresh = options?.forceRefresh ?? false;
      const skills = options?.skills;

      if (!stockCodeInput) {
        set({ inputError: '请输入股票代码', duplicateError: null });
        return;
      }

      if (selectionSource !== 'autocomplete' && isObviouslyInvalidStockQuery(stockCodeInput)) {
        set({ inputError: '请输入有效的股票代码或股票名称', duplicateError: null });
        return;
      }

      let normalizedStockCode = stockCodeInput;
      if (selectionSource === 'autocomplete' || looksLikeStockCode(stockCodeInput)) {
        const { valid, message, normalized } = validateStockCode(stockCodeInput);
        if (!valid) {
          set({ inputError: message, duplicateError: null });
          return;
        }
        normalizedStockCode = normalized;
      }

      set({
        inputError: undefined,
        duplicateError: null,
        error: null,
        isAnalyzing: true,
      });

      const requestId = ++requestSeq.analyze;
      try {
        await analysisApi.analyzeAsync({
          stockCode: normalizedStockCode,
          reportType: 'detailed',
          stockName,
          originalQuery: originalQuery || stockCodeInput,
          selectionSource,
          notify,
          forceRefresh,
          skills,
          ...(options?.reportLanguage !== undefined && { reportLanguage: options.reportLanguage }),
        });

        if (requestId !== requestSeq.analyze) {
          return;
        }

        set({
          query: '',
          selectionSource: 'manual',
        });
      } catch (error) {
        if (requestId !== requestSeq.analyze) {
          return;
        }

        if (error instanceof DuplicateTaskError) {
          set({
            duplicateError: `股票 ${error.stockCode} 正在分析中，请等待完成`,
          });
          return;
        }

        set({ error: getParsedApiError(error) });
      } finally {
        if (requestId === requestSeq.analyze) {
          set({ isAnalyzing: false });
        }
      }
    },

    syncTaskCreated: (task: TaskInfo) => {
      if (dismissedTaskIds.has(task.taskId)) {
        return;
      }
      if (get().activeTasks.some((item) => item.taskId === task.taskId)) {
        return;
      }
      requestSeq.activeTaskLocalRevision += 1;
      set({ activeTasks: [...get().activeTasks, task] });
    },

    syncTaskUpdated: (task: TaskInfo) => {
      if (dismissedTaskIds.has(task.taskId)) {
        return;
      }
      const nextTasks = [...get().activeTasks];
      const index = nextTasks.findIndex((item) => item.taskId === task.taskId);
      if (index >= 0) {
        nextTasks[index] = task;
        requestSeq.activeTaskLocalRevision += 1;
        set({ activeTasks: nextTasks });
      }
    },

    syncTaskFailed: (task: TaskInfo) => {
      get().syncTaskUpdated(task);
      set({ error: getParsedApiError(task.error || '分析失败') });
    },

    refreshActiveTasks: async () => {
      const requestId = ++requestSeq.activeTask;
      const localRevisionAtRequest = requestSeq.activeTaskLocalRevision;
      try {
        const response = await analysisApi.getTasks({
          status: 'pending,processing,cancel_requested',
          limit: 100,
        });
        if (requestId !== requestSeq.activeTask) {
          return;
        }

        const remoteTasks = response.tasks.filter(
          (task) => !dismissedTaskIds.has(task.taskId),
        );
        const remoteTaskIds = new Set(remoteTasks.map((task) => task.taskId));
        const remoteTaskById = new Map(remoteTasks.map((task) => [task.taskId, task]));
        const activeTaskCount = response.pending
          + response.processing
          + response.tasks.filter((task) => task.status === 'cancel_requested').length;
        const isCompleteSnapshot = response.tasks.length === activeTaskCount;
        const canPruneLocalTasks = isCompleteSnapshot && requestSeq.activeTaskLocalRevision === localRevisionAtRequest;

        const currentTasks = get().activeTasks;
        const nextTasks = currentTasks
          .filter((task) => !dismissedTaskIds.has(task.taskId))
          .filter((task) => !canPruneLocalTasks || remoteTaskIds.has(task.taskId))
          .map((task) => remoteTaskById.get(task.taskId) ?? task);

        const localTaskIds = new Set(nextTasks.map((task) => task.taskId));
        for (const task of remoteTasks) {
          if (!localTaskIds.has(task.taskId)) {
            nextTasks.push(task);
          }
        }

        const hasActiveTaskChanges = nextTasks.length !== currentTasks.length
          || nextTasks.some((task, index) => task !== currentTasks[index]);
        if (hasActiveTaskChanges) {
          requestSeq.activeTaskLocalRevision += 1;
          set({ activeTasks: nextTasks });
        }
      } catch {
        // Keep the current task panel when reconciliation cannot reach the API.
      }
    },

    removeTask: (taskId: string) => {
      dismissedTaskIds.add(taskId);
      const currentTasks = get().activeTasks;
      const nextTasks = currentTasks.filter((task) => task.taskId !== taskId);
      if (nextTasks.length !== currentTasks.length) {
        requestSeq.activeTaskLocalRevision += 1;
      }
      set({ activeTasks: nextTasks });
    },

    loadStockBar: async () => {
      const state = get();
      if (state.isLoadingStockBar) return;
      const requestId = ++requestSeq.stockBar;
      set({ isLoadingStockBar: true });
      try {
        const response = await historyApi.getStockBarList({
          startDate: getRecentStartDate(90),
          endDate: getTodayInShanghai(),
        });
        if (requestId !== requestSeq.stockBar) {
          return;
        }
        set({ stockBarItems: response.items, stockBarRefreshFailed: false });
      } catch {
        if (requestId !== requestSeq.stockBar) {
          return;
        }
        set({ stockBarRefreshFailed: true });
      } finally {
        if (requestId === requestSeq.stockBar) {
          set({ isLoadingStockBar: false });
        }
      }
    },

    refreshStockBar: async () => {
      const requestId = ++requestSeq.stockBar;
      set({ isLoadingStockBar: true });
      try {
        const response = await historyApi.getStockBarList({
          startDate: getRecentStartDate(90),
          endDate: getTodayInShanghai(),
        });
        if (requestId !== requestSeq.stockBar) {
          return;
        }
        set({ stockBarItems: response.items, stockBarRefreshFailed: false });
      } catch {
        if (requestId !== requestSeq.stockBar) {
          return;
        }
        set({ stockBarRefreshFailed: true });
      } finally {
        if (requestId === requestSeq.stockBar) {
          set({ isLoadingStockBar: false });
        }
      }
    },
  } satisfies Partial<StockPoolState>;
}
