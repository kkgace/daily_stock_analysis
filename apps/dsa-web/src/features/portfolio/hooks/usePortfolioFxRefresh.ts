import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { ParsedApiError } from '@/api/error';
import { getParsedApiError } from '@/api/error';
import { portfolioApi } from '@/features/portfolio/api/portfolio';
import type {
  PortfolioCostMethod,
  PortfolioRiskResponse,
  PortfolioSnapshotResponse,
} from '@/features/portfolio/types/portfolio';
import type { FxRefreshFeedback } from '@/features/portfolio/utils/portfolioFormat';
import { buildFxRefreshFeedback } from '@/features/portfolio/utils/portfolioFormat';

type FxRefreshContext = {
  viewKey: string;
  requestId: number;
};

type UsePortfolioFxRefreshOptions = {
  hasAccounts: boolean;
  isLoading: boolean;
  queryAccountId: number | undefined;
  costMethod: PortfolioCostMethod;
  refreshViewKey: string;
  setSnapshot: React.Dispatch<React.SetStateAction<PortfolioSnapshotResponse | null>>;
  setRisk: React.Dispatch<React.SetStateAction<PortfolioRiskResponse | null>>;
  setError: React.Dispatch<React.SetStateAction<ParsedApiError | null>>;
  setRiskWarning: React.Dispatch<React.SetStateAction<string | null>>;
};

export function usePortfolioFxRefresh({
  hasAccounts,
  isLoading,
  queryAccountId,
  costMethod,
  refreshViewKey,
  setSnapshot,
  setRisk,
  setError,
  setRiskWarning,
}: UsePortfolioFxRefreshOptions) {
  const [fxRefreshing, setFxRefreshing] = useState(false);
  const [fxRefreshFeedback, setFxRefreshFeedback] = useState<FxRefreshFeedback | null>(null);
  const refreshContextRef = useRef<FxRefreshContext>({ viewKey: refreshViewKey, requestId: 0 });

  const isActiveRefreshContext = (requestedViewKey: string, requestedRequestId: number) => {
    return (
      refreshContextRef.current.viewKey === requestedViewKey
      && refreshContextRef.current.requestId === requestedRequestId
    );
  };

  useEffect(() => {
    refreshContextRef.current = {
      viewKey: refreshViewKey,
      requestId: refreshContextRef.current.requestId + 1,
    };
    setFxRefreshing(false);
    setFxRefreshFeedback(null);
  }, [refreshViewKey]);

  const reloadSnapshotAndRiskForScope = useCallback(async (
    requestedViewKey: string,
    requestedRequestId: number,
    requestedAccountId: number | undefined,
    requestedCostMethod: PortfolioCostMethod,
  ): Promise<boolean> => {
    if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
      return false;
    }

    setRiskWarning(null);

    try {
      const snapshotData = await portfolioApi.getSnapshot({
        accountId: requestedAccountId,
        costMethod: requestedCostMethod,
        includeRealtime: false,
      });
      if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        return false;
      }
      setSnapshot(snapshotData);
      setError(null);

      try {
        const riskData = await portfolioApi.getRisk({
          accountId: requestedAccountId,
          costMethod: requestedCostMethod,
          includeRealtime: false,
        });
        if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
          return false;
        }
        setRisk(riskData);
        setRiskWarning(null);
      } catch (riskErr) {
        if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
          return false;
        }
        setRisk(null);
        const parsed = getParsedApiError(riskErr);
        setRiskWarning(parsed.message || '风险数据获取失败，已降级为仅展示快照数据。');
      }
      return true;
    } catch (err) {
      if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        return false;
      }
      setSnapshot(null);
      setRisk(null);
      setError(getParsedApiError(err));
      return false;
    }
  }, [setSnapshot, setRisk, setError, setRiskWarning]);

  const handleRefreshFx = async () => {
    if (!hasAccounts || isLoading || fxRefreshing) {
      return;
    }

    const requestedViewKey = refreshViewKey;
    const requestedAccountId = queryAccountId;
    const requestedCostMethod = costMethod;
    const requestedRequestId = refreshContextRef.current.requestId + 1;
    refreshContextRef.current = {
      viewKey: requestedViewKey,
      requestId: requestedRequestId,
    };

    try {
      setFxRefreshing(true);
      setFxRefreshFeedback(null);
      const result = await portfolioApi.refreshFx({
        accountId: requestedAccountId,
      });
      if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        return;
      }
      const reloaded = await reloadSnapshotAndRiskForScope(
        requestedViewKey,
        requestedRequestId,
        requestedAccountId,
        requestedCostMethod,
      );
      if (!reloaded || !isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        return;
      }
      setFxRefreshFeedback(buildFxRefreshFeedback(result));
    } catch (err) {
      if (!isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        return;
      }
      setError(getParsedApiError(err));
    } finally {
      if (isActiveRefreshContext(requestedViewKey, requestedRequestId)) {
        setFxRefreshing(false);
      }
    }
  };

  return { fxRefreshing, fxRefreshFeedback, handleRefreshFx };
}
