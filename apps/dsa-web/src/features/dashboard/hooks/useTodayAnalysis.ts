import { useEffect, useMemo, useState } from 'react';
import type { StockBarItem } from '@/types/analysis';
import { getTodayInShanghai } from '@/utils/format';
import {
  getShanghaiDateKey,
  getShanghaiTimeValue,
  getTodayAnalysisItems,
} from '@/features/dashboard/pages/home/homeUtils';

type SettledTodayRequest = {
  key: string;
  items: StockBarItem[];
  failed: boolean;
};

export function useTodayAnalysis(isEnabled: boolean, refreshVersion: number) {
  const todayDateKey = getTodayInShanghai();
  const requestKey = `${refreshVersion}:${todayDateKey}`;
  const [settledRequest, setSettledRequest] = useState<SettledTodayRequest | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }

    let active = true;
    getTodayAnalysisItems(todayDateKey)
      .then((items) => {
        if (active) {
          setSettledRequest({ key: requestKey, items, failed: false });
        }
      })
      .catch(() => {
        if (active) {
          setSettledRequest({ key: requestKey, items: [], failed: true });
        }
      });

    return () => {
      active = false;
    };
  }, [isEnabled, requestKey, todayDateKey]);

  // Loading / failure / items are derived from the settled request, so the
  // effect above never needs a synchronous setState when a fetch starts.
  const isSettledForCurrentRequest = settledRequest?.key === requestKey;
  const isLoadingTodayAnalysisItems = isEnabled && !isSettledForCurrentRequest;
  const todayHistoryItems = useMemo<StockBarItem[]>(
    () => (isSettledForCurrentRequest && settledRequest ? settledRequest.items : []),
    [isSettledForCurrentRequest, settledRequest],
  );
  const todayAnalysisLoadFailed = Boolean(isSettledForCurrentRequest && settledRequest?.failed);

  const todayAnalysisItems = useMemo(() => {
    const itemsById = new Map<number, StockBarItem>();
    const addItem = (item: StockBarItem) => {
      if (item.stockCode === 'MARKET' || item.reportType === 'market_review') {
        return;
      }
      if (getShanghaiDateKey(item.lastAnalysisTime) !== todayDateKey) {
        return;
      }
      itemsById.set(item.id, item);
    };

    for (const item of todayHistoryItems) {
      addItem(item);
    }

    return Array.from(itemsById.values())
      .sort((left, right) => {
        const leftScore = typeof left.sentimentScore === 'number' ? left.sentimentScore : -1;
        const rightScore = typeof right.sentimentScore === 'number' ? right.sentimentScore : -1;
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
        const leftTime = getShanghaiTimeValue(left.lastAnalysisTime);
        const rightTime = getShanghaiTimeValue(right.lastAnalysisTime);
        return rightTime - leftTime;
      });
  }, [todayDateKey, todayHistoryItems]);

  return {
    todayDateKey,
    todayAnalysisItems,
    isLoadingTodayAnalysisItems,
    todayAnalysisLoadFailed,
  };
}
