import type { AnalysisReport, HistoryItem } from '@/types/analysis';
import type { AssetAwareAssetType } from '@/utils/stockCode';
import { normalizeStockCodeKey } from './historyHelpers';
import { requestSeq } from './requestControl';
import type { CompletedTaskSelectionIntent } from './types';

export const pendingCompletedTaskSelectionKeys = new Map<string, CompletedTaskSelectionIntent>();

export function queueCompletedTaskSelection(
  stockCode: string | undefined,
  selectedReport: AnalysisReport | null,
  assetType?: AssetAwareAssetType | null,
): void {
  const key = normalizeStockCodeKey(stockCode, assetType);
  if (key) {
    // Matching only consumes the already-constructed identity key; the stored
    // intent carries no assetType (it was only ever used to build the key).
    pendingCompletedTaskSelectionKeys.set(key, {
      manualSelectionSeq: requestSeq.manualSelectionRequest,
      selectedReportId: selectedReport?.meta.id,
    });
  }
}

export function consumeCompletedTaskSelection(items: HistoryItem[], selectedReport: AnalysisReport | null): HistoryItem | undefined {
  if (pendingCompletedTaskSelectionKeys.size === 0) {
    return undefined;
  }
  if (requestSeq.manualSelectionRequestId !== 0) {
    pendingCompletedTaskSelectionKeys.clear();
    return undefined;
  }

  if (selectedReport?.meta.reportType === 'market_review') {
    pendingCompletedTaskSelectionKeys.clear();
    return undefined;
  }

  if (selectedReport) {
    const selectedStockCode = normalizeStockCodeKey(
      selectedReport.meta.stockCode,
      selectedReport.meta.assetType,
    );
    const pendingSelectionIntent = selectedStockCode
      ? pendingCompletedTaskSelectionKeys.get(selectedStockCode)
      : undefined;
    if (!selectedStockCode || pendingSelectionIntent === undefined) {
      pendingCompletedTaskSelectionKeys.clear();
      return undefined;
    }
    if (pendingSelectionIntent.manualSelectionSeq !== requestSeq.manualSelectionRequest) {
      pendingCompletedTaskSelectionKeys.clear();
      return undefined;
    }
    if (pendingSelectionIntent.selectedReportId !== selectedReport.meta.id) {
      pendingCompletedTaskSelectionKeys.clear();
      return undefined;
    }

    for (const key of Array.from(pendingCompletedTaskSelectionKeys.keys())) {
      if (key !== selectedStockCode) {
        pendingCompletedTaskSelectionKeys.delete(key);
      }
    }

    const latestItem = items.find(
      (item) =>
        item.reportType !== 'market_review' &&
        normalizeStockCodeKey(item.stockCode, item.assetType) === selectedStockCode,
    );
    if (latestItem) {
      pendingCompletedTaskSelectionKeys.delete(selectedStockCode);
    }
    return latestItem;
  }

  const latestItem = items.find((item) => {
    if (item.reportType === 'market_review') {
      return false;
    }
    const stockCode = normalizeStockCodeKey(item.stockCode, item.assetType);
    const pendingSelectionIntent = pendingCompletedTaskSelectionKeys.get(stockCode);
    return stockCode.length > 0 && pendingSelectionIntent?.manualSelectionSeq === requestSeq.manualSelectionRequest;
  });
  if (latestItem) {
    pendingCompletedTaskSelectionKeys.clear();
  }
  return latestItem;
}
