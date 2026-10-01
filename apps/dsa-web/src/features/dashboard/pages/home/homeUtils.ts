import { historyApi } from '@/features/dashboard/api/history';
import type { RunFlowSnapshotSource } from '@/types/runFlow';
import type {
  AnalyzeAsyncResponse,
  HistoryItem,
  StockBarItem,
} from '@/types/analysis';
import { toAssetAwareCodeKey, type AssetAwareAssetType } from '@/utils/stockCode';

export type MarketReviewNotice = {
  variant: 'success' | 'warning' | 'danger';
  title: string;
  message: string;
} | null;

export type RunFlowDrawerState =
  | { open: false }
  | { open: true; source: RunFlowSnapshotSource; title: string };

export type StockAnalysisNavigationState = {
  stockCode?: string;
  stockName?: string;
  autoAnalyze?: boolean;
  selectionSource?: string;
  skills?: string[];
};

export const DUPLICATE_BANNER_AUTO_DISMISS_MS = 5000;
const BATCH_ANALYSIS_CHUNK_SIZE = 50;
const TODAY_ANALYSIS_PAGE_SIZE = 100;
const WATCHLIST_HISTORY_LOOKUP_CONCURRENCY = 4;
const TASK_PANEL_COLLAPSED_STORAGE_KEY = 'dsa.home.taskPanelCollapsed';
const SERVER_LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

export type BatchAnalyzeStatus = {
  variant: 'success' | 'warning' | 'danger';
  message: string;
} | null;

export type WatchlistHistoryLookupState = {
  signature: string;
  settledKeys: Set<string>;
  failedKeys: Set<string>;
};

type WatchlistHistoryLookupResult = {
  code: string;
  item: HistoryItem | null;
  failed: boolean;
};

async function lookupWatchlistHistory(
  codes: string[],
  isCanceled: () => boolean,
  signal: AbortSignal,
): Promise<WatchlistHistoryLookupResult[]> {
  const results: Array<WatchlistHistoryLookupResult | undefined> = new Array(codes.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (!isCanceled()) {
      const index = nextIndex;
      if (index >= codes.length) {
        return;
      }
      nextIndex += 1;
      const code = codes[index];
      try {
        const response = await historyApi.getList(
          { stockCode: code, limit: 1 },
          { signal },
        );
        results[index] = { code, item: response.items[0] ?? null, failed: false };
      } catch {
        results[index] = { code, item: null, failed: true };
      }
    }
  };

  const workerCount = Math.min(WATCHLIST_HISTORY_LOOKUP_CONCURRENCY, codes.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results.filter((entry): entry is WatchlistHistoryLookupResult => entry !== undefined);
}

export { lookupWatchlistHistory };

export function getShanghaiDateKey(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  const normalized = SERVER_LOCAL_DATE_TIME_PATTERN.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}+08:00`
    : trimmed;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date);
}

export function getShanghaiTimeValue(value?: string | null): number {
  if (!value) return 0;
  const trimmed = value.trim();
  const normalized = SERVER_LOCAL_DATE_TIME_PATTERN.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}+08:00`
    : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getStockCodeKey(code?: string | null, assetType?: AssetAwareAssetType | null): string {
  // Direct delegation: `toAssetAwareCodeKey` already treats unknown/stock codes
  // with the existing stock normalization, so no extra branching is needed.
  return toAssetAwareCodeKey(code, assetType);
}

export function chunkStockCodes(codes: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < codes.length; index += BATCH_ANALYSIS_CHUNK_SIZE) {
    chunks.push(codes.slice(index, index + BATCH_ANALYSIS_CHUNK_SIZE));
  }
  return chunks;
}

export function readTaskPanelCollapsedPreference(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const rawValue = window.sessionStorage.getItem(TASK_PANEL_COLLAPSED_STORAGE_KEY);
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function writeTaskPanelCollapsedPreference(collapsed: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(TASK_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Session storage is best-effort; keep the in-memory toggle state working.
  }
}

export function countBatchAccepted(result: AnalyzeAsyncResponse): { accepted: number; duplicates: number; rejected: number } {
  if ('accepted' in result) {
    return {
      accepted: result.accepted.length,
      duplicates: result.duplicates.length,
      rejected: result.rejected?.length ?? 0,
    };
  }
  return { accepted: 1, duplicates: 0, rejected: 0 };
}

export function toStockBarItemFromHistoryItem(item: HistoryItem): StockBarItem {
  return {
    id: item.id,
    stockCode: item.stockCode,
    stockName: item.stockName,
    reportType: item.reportType,
    sentimentScore: item.sentimentScore,
    operationAdvice: item.operationAdvice,
    action: item.action ?? null,
    actionLabel: item.actionLabel ?? null,
    analysisCount: 0,
    lastAnalysisTime: item.createdAt,
    modelUsed: item.modelUsed,
    marketPhaseSummary: item.marketPhaseSummary ?? null,
    assetType: item.assetType,
  };
}

export async function getTodayAnalysisItems(dateKey: string): Promise<StockBarItem[]> {
  const items: StockBarItem[] = [];
  let loadedRecordCount = 0;
  let page = 1;

  while (true) {
    const response = await historyApi.getList({
      // History dates are filtered in the server's local timezone. Query the
      // adjacent dates too, then apply the exact Shanghai-day filter below.
      startDate: shiftDateKey(dateKey, -1),
      endDate: shiftDateKey(dateKey, 1),
      page,
      limit: TODAY_ANALYSIS_PAGE_SIZE,
    });

    loadedRecordCount += response.items.length;
    for (const item of response.items) {
      if (item.stockCode === 'MARKET' || item.reportType === 'market_review') {
        continue;
      }
      items.push(toStockBarItemFromHistoryItem(item));
    }

    if (
      response.items.length === 0
      || response.items.length < TODAY_ANALYSIS_PAGE_SIZE
      || loadedRecordCount >= response.total
    ) {
      break;
    }

    page += 1;
  }

  return items;
}
