import { useRef, useState } from 'react';
import type React from 'react';
import { decisionSignalsApi } from '@/features/decision-signals/api/decisionSignals';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import type {
  AppliedTimelineContext,
  ListFilters,
  PendingStatusChange,
  SelectedSignal,
} from '@/features/decision-signals/pages/signals/types';
import { parseSourceReportId } from '@/features/decision-signals/pages/signals/signalPageUtils';

type UseSignalStatusOptions = {
  setSelected: React.Dispatch<React.SetStateAction<SelectedSignal | null>>;
  setError: React.Dispatch<React.SetStateAction<ParsedApiError | null>>;
  setLatestItems: React.Dispatch<React.SetStateAction<DecisionSignalItem[]>>;
  setTimelineItems: React.Dispatch<React.SetStateAction<DecisionSignalItem[]>>;
  appliedTimelineContext: AppliedTimelineContext | null;
  appliedFilters: ListFilters;
  page: number;
  loadSignalsForPage: (page: number) => Promise<void>;
  loadOutcomeStats: () => Promise<void>;
};

export function useSignalStatus({
  setSelected,
  setError,
  setLatestItems,
  setTimelineItems,
  appliedTimelineContext,
  appliedFilters,
  page,
  loadSignalsForPage,
  loadOutcomeStats,
}: UseSignalStatusOptions) {
  const [pendingStatus, setPendingStatus] = useState<PendingStatusChange | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const statusUpdateInFlightRef = useRef(false);

  const handleStatusUpdate = async () => {
    if (!pendingStatus || statusUpdateInFlightRef.current) return;
    statusUpdateInFlightRef.current = true;
    setStatusUpdating(true);
    try {
      const updated = await decisionSignalsApi.updateStatus(pendingStatus.item.id, {
        status: pendingStatus.status,
      });
      setPendingStatus(null);
      setLatestItems((current) => current.flatMap((item) => {
        if (item.id !== updated.id) return [item];
        return updated.status === 'active' ? [updated] : [];
      }));
      setTimelineItems((current) => current.flatMap((item) => {
        if (item.id !== updated.id) return [item];
        return appliedTimelineContext?.status === 'active' && updated.status !== 'active' ? [] : [updated];
      }));
      setSelected((current) => {
        if (!current || current.item.id !== updated.id) return current;
        if (current.source === 'latest') {
          return updated.status === 'active' ? { source: 'latest', item: updated } : null;
        }
        if (current.source === 'timeline') {
          return appliedTimelineContext?.status === 'active' && updated.status !== 'active'
            ? null
            : { source: 'timeline', item: updated };
        }
        if (current.source === 'persisted') {
          return { source: 'persisted', item: updated };
        }
        if (!parseSourceReportId(appliedFilters.sourceReportId) && appliedFilters.status && updated.status !== appliedFilters.status) return null;
        return { source: 'list', item: updated };
      });
      setError(null);
      await loadSignalsForPage(page);
      await loadOutcomeStats();
    } catch (err) {
      setError(getParsedApiError(err));
      setPendingStatus(null);
    } finally {
      setStatusUpdating(false);
      statusUpdateInFlightRef.current = false;
    }
  };

  return {
    pendingStatus,
    setPendingStatus,
    statusUpdating,
    handleStatusUpdate,
  };
}
