import { useEffect, useMemo, useRef, useState } from 'react';
import { decisionSignalsApi } from '@/features/decision-signals/api/decisionSignals';
import { getParsedApiError } from '@/api/error';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import {
  isNewerSignal,
  mapWithConcurrency,
  PORTFOLIO_SIGNAL_LOOKUP_CONCURRENCY,
  toDecisionSignalMarket,
  toPositionSignalLookupKey,
} from '@/features/portfolio/pages/portfolio/shared';
import type {
  FlatPosition,
  PortfolioSignalLookup,
  PortfolioSignalLookupResult,
} from '@/features/portfolio/pages/portfolio/shared';
import { formatUiText, type UiTextKey, type UiTextParams } from '@/i18n/uiText';
import { areStockCodesEquivalent } from '@/utils/stockCode';

async function loadPortfolioSignalLookup(lookup: PortfolioSignalLookup): Promise<PortfolioSignalLookupResult> {
  try {
    const response = await decisionSignalsApi.getLatest(lookup.stockCode, {
      market: lookup.market,
      limit: 1,
    });
    return { items: response.items, error: null };
  } catch (err) {
    return { items: [], error: getParsedApiError(err).message };
  }
}

type UsePortfolioSignalsOptions = {
  positionRows: FlatPosition[];
  snapshotMatchesAccountScope: boolean;
  t: (key: UiTextKey, params?: UiTextParams) => string;
};

export function usePortfolioSignals({
  positionRows,
  snapshotMatchesAccountScope,
  t,
}: UsePortfolioSignalsOptions) {
  const [portfolioSignals, setPortfolioSignals] = useState<DecisionSignalItem[]>([]);
  const [portfolioSignalsLoading, setPortfolioSignalsLoading] = useState(false);
  const [portfolioSignalsWarning, setPortfolioSignalsWarning] = useState<string | null>(null);
  const [portfolioSignalsRefreshKey, setPortfolioSignalsRefreshKey] = useState(0);
  const portfolioSignalsRequestRef = useRef(0);

  const positionSignalLookups = useMemo(() => {
    const lookups = new Map<string, PortfolioSignalLookup>();
    for (const row of positionRows) {
      const stockCode = String(row.symbol || '').trim();
      if (!stockCode) continue;
      const market = toDecisionSignalMarket(row.market);
      const key = toPositionSignalLookupKey(stockCode, market);
      if (!lookups.has(key)) {
        lookups.set(key, { stockCode, market });
      }
    }
    return Array.from(lookups.values());
  }, [positionRows]);

  useEffect(() => {
    const requestId = portfolioSignalsRequestRef.current + 1;
    portfolioSignalsRequestRef.current = requestId;

    // 异步微任务里再 setState，避免在 effect 中同步触发级联渲染（react-hooks/set-state-in-effect）。
    const schedule = (fn: () => void) => {
      void Promise.resolve().then(() => {
        if (portfolioSignalsRequestRef.current === requestId) {
          fn();
        }
      });
    };

    if (positionSignalLookups.length === 0 || !snapshotMatchesAccountScope) {
      schedule(() => {
        setPortfolioSignals([]);
        setPortfolioSignalsWarning(null);
        setPortfolioSignalsLoading(false);
      });
      return;
    }

    const isActiveRequest = () => portfolioSignalsRequestRef.current === requestId;

    const loadPortfolioSignals = async () => {
      setPortfolioSignalsLoading(true);
      setPortfolioSignalsWarning(null);
      const results = await mapWithConcurrency(
        positionSignalLookups,
        PORTFOLIO_SIGNAL_LOOKUP_CONCURRENCY,
        loadPortfolioSignalLookup,
      );
      if (!isActiveRequest()) return;
      const collected = results.flatMap((result) => result.items);
      const failures = results.flatMap((result) => (result.error ? [result.error] : []));
      setPortfolioSignals(collected);
      setPortfolioSignalsWarning(
        failures.length > 0
          ? (
              collected.length > 0
                ? formatUiText(t('decisionSignals.portfolioPartialWarning'), { message: failures[0] })
                : failures[0]
            )
          : null,
      );
      if (isActiveRequest()) {
        setPortfolioSignalsLoading(false);
      }
    };

    void loadPortfolioSignals();

    return () => {
      portfolioSignalsRequestRef.current += 1;
    };
  }, [portfolioSignalsRefreshKey, positionSignalLookups, snapshotMatchesAccountScope, t]);

  const signalByPositionKey = useMemo(() => {
    const mapped = new Map<string, DecisionSignalItem>();
    for (const row of positionRows) {
      const rowMarket = String(row.market || '').toLowerCase();
      for (const signal of portfolioSignals) {
        const signalMarket = String(signal.market || '').toLowerCase();
        if (rowMarket && signalMarket && rowMarket !== signalMarket) {
          continue;
        }
        if (!areStockCodesEquivalent(row.symbol, signal.stockCode)) {
          continue;
        }
        const key = `${row.accountId}-${row.symbol}-${row.market}`;
        const existing = mapped.get(key);
        if (isNewerSignal(existing, signal)) {
          mapped.set(key, signal);
        }
      }
    }
    return mapped;
  }, [portfolioSignals, positionRows]);

  return {
    portfolioSignalsLoading,
    portfolioSignalsWarning,
    signalByPositionKey,
    refreshPortfolioSignals: () => setPortfolioSignalsRefreshKey((current) => current + 1),
  };
}
