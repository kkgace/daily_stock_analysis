import { useCallback, useEffect, useRef, useState } from 'react';
import { decisionSignalsApi } from '@/features/decision-signals/api/decisionSignals';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import type { DecisionSignalOutcomeStatsResponse } from '@/features/decision-signals/types/decisionSignals';

export function useOutcomeStats() {
  const [outcomeStats, setOutcomeStats] = useState<DecisionSignalOutcomeStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<ParsedApiError | null>(null);
  const statsRequestIdRef = useRef(0);

  const loadOutcomeStats = useCallback(async () => {
    const requestId = statsRequestIdRef.current + 1;
    statsRequestIdRef.current = requestId;
    setStatsLoading(true);
    try {
      const response = await decisionSignalsApi.getOutcomeStats();
      if (statsRequestIdRef.current !== requestId) return;
      setOutcomeStats(response);
      setStatsError(null);
    } catch (err) {
      if (statsRequestIdRef.current !== requestId) return;
      setOutcomeStats(null);
      setStatsError(getParsedApiError(err));
    } finally {
      if (statsRequestIdRef.current === requestId) {
        setStatsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadOutcomeStats();
    return () => {
      statsRequestIdRef.current += 1;
    };
  }, [loadOutcomeStats]);

  return { outcomeStats, statsLoading, statsError, loadOutcomeStats };
}
