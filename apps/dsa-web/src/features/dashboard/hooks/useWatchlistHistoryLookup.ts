import { useCallback, useEffect, useState } from 'react';
import type { StockBarItem } from '@/types/analysis';
import {
  lookupWatchlistHistory,
  toStockBarItemFromHistoryItem,
  type WatchlistHistoryLookupState,
} from '@/features/dashboard/pages/home/homeUtils';

type Options = {
  canLookupWatchlistHistory: boolean;
  watchlistMissingHistoryEntries: Array<[string, string]>;
  watchlistMissingHistorySignature: string;
  getWatchlistCodeKey: (code: string | null | undefined) => string;
};

export function useWatchlistHistoryLookup({
  canLookupWatchlistHistory,
  watchlistMissingHistoryEntries,
  watchlistMissingHistorySignature,
  getWatchlistCodeKey,
}: Options) {
  const emptyLookupState = (): WatchlistHistoryLookupState => ({
    signature: '',
    settledKeys: new Set(),
    failedKeys: new Set(),
  });
  const [watchlistHistoryItemsByCode, setWatchlistHistoryItemsByCode] = useState<Map<string, StockBarItem>>(new Map());
  const [watchlistHistoryLookupState, setWatchlistHistoryLookupState] = useState<WatchlistHistoryLookupState>(emptyLookupState);
  const [watchlistHistoryRetryVersion, setWatchlistHistoryRetryVersion] = useState(0);

  const retryWatchlistHistoryLookup = useCallback(() => {
    setWatchlistHistoryRetryVersion((version) => version + 1);
  }, []);

  // The lookup state tracks a request key derived from the inputs through a
  // render-phase adjustment, so the effect below only starts async work and
  // never calls setState synchronously.
  const activeRequestKey = canLookupWatchlistHistory && watchlistMissingHistoryEntries.length > 0
    ? `${watchlistMissingHistorySignature}\nretry:${watchlistHistoryRetryVersion}`
    : '';
  const [appliedRequestKey, setAppliedRequestKey] = useState(activeRequestKey);
  if (appliedRequestKey !== activeRequestKey) {
    setAppliedRequestKey(activeRequestKey);
    setWatchlistHistoryItemsByCode(new Map());
    setWatchlistHistoryLookupState(
      activeRequestKey
        ? { signature: watchlistMissingHistorySignature, settledKeys: new Set(), failedKeys: new Set() }
        : emptyLookupState(),
    );
  }

  useEffect(() => {
    if (!activeRequestKey) {
      return undefined;
    }

    const missingCodes = watchlistMissingHistoryEntries.map(([, code]) => code);
    const missingKeys = watchlistMissingHistoryEntries.map(([key]) => key);
    const currentSignature = watchlistMissingHistorySignature;

    let isCanceled = false;
    const abortController = new AbortController();
    void (async () => {
      try {
        const results = await lookupWatchlistHistory(
          missingCodes,
          () => isCanceled,
          abortController.signal,
        );

        if (isCanceled) {
          return;
        }

        const next = new Map<string, StockBarItem>();
        const failedKeys = new Set<string>();
        for (const entry of results) {
          const key = getWatchlistCodeKey(entry.code);
          if (!key) {
            continue;
          }
          if (entry.failed) {
            failedKeys.add(key);
            continue;
          }
          if (entry.item) {
            next.set(key, toStockBarItemFromHistoryItem(entry.item));
          }
        }
        setWatchlistHistoryItemsByCode(next);
        setWatchlistHistoryLookupState({
          signature: currentSignature,
          settledKeys: new Set(missingKeys),
          failedKeys,
        });
      } catch {
        if (!isCanceled) {
          setWatchlistHistoryItemsByCode(new Map());
          setWatchlistHistoryLookupState({
            signature: currentSignature,
            settledKeys: new Set(missingKeys),
            failedKeys: new Set(missingKeys),
          });
        }
      }
    })();

    return () => {
      isCanceled = true;
      abortController.abort();
    };
  }, [activeRequestKey, getWatchlistCodeKey, watchlistMissingHistoryEntries, watchlistMissingHistorySignature]);

  return {
    watchlistHistoryItemsByCode,
    watchlistHistoryLookupState,
    retryWatchlistHistoryLookup,
  };
}
