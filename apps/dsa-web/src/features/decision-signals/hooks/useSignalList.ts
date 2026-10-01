import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { decisionSignalsApi } from '@/features/decision-signals/api/decisionSignals';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import { PAGE_SIZE, type ListFilters, type SelectedSignal } from '@/features/decision-signals/pages/signals/types';
import { getInitialFilters, parseSourceReportId, toListParams } from '@/features/decision-signals/pages/signals/signalPageUtils';

type UseSignalListOptions = {
  setSelected: React.Dispatch<React.SetStateAction<SelectedSignal | null>>;
};

export function useSignalList({ setSelected }: UseSignalListOptions) {
  const [filters, setFilters] = useState<ListFilters>(() => getInitialFilters());
  const [appliedFilters, setAppliedFilters] = useState<ListFilters>(() => getInitialFilters());
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DecisionSignalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const requestIdRef = useRef(0);

  const loadSignalsForPage = useCallback(async (nextPage: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const response = await decisionSignalsApi.list(toListParams(appliedFilters, nextPage));
      if (requestIdRef.current !== requestId) return;
      const lastPage = Math.max(1, Math.ceil(response.total / PAGE_SIZE));
      if (response.total > 0 && nextPage > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(response.items);
      setTotal(response.total);
      setError(null);
      setSelected((current) => {
        if (!current) return current;
        if (current.source !== 'list') return current;
        const refreshed = response.items.find((item) => item.id === current.item.id);
        return refreshed ? { source: 'list', item: refreshed } : null;
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(getParsedApiError(err));
      setItems([]);
      setTotal(0);
      setSelected((current) => (current?.source === 'list' ? null : current));
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [appliedFilters, setSelected]);

  const loadSignals = useCallback(async () => {
    await loadSignalsForPage(page);
  }, [loadSignalsForPage, page]);

  useEffect(() => {
    void loadSignals();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadSignals]);

  const handleApplyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedFilters(filters);
    setPage(1);
  };

  const appliedSourceReportId = useMemo(
    () => parseSourceReportId(appliedFilters.sourceReportId),
    [appliedFilters.sourceReportId],
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    filters,
    setFilters,
    appliedFilters,
    appliedSourceReportId,
    page,
    setPage,
    items,
    total,
    totalPages,
    loading,
    error,
    setError,
    loadSignals,
    loadSignalsForPage,
    handleApplyFilters,
  };
}
