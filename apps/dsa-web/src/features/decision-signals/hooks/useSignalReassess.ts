import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  decisionSignalsApi,
  getDecisionSignalReassessBlockedError,
} from '@/features/decision-signals/api/decisionSignals';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import type {
  DecisionProfile,
  DecisionSignalItem,
  DecisionSignalReassessBlockedError,
  DecisionSignalReassessResponse,
} from '@/features/decision-signals/types/decisionSignals';
import type {
  AppliedTimelineContext,
  SelectedSignal,
  StockContext,
  TimelineFilters,
} from '@/features/decision-signals/pages/signals/types';
import {
  isRecord,
  itemMatchesAppliedTimeline,
  itemMatchesStockContext,
  upsertDecisionSignal,
} from '@/features/decision-signals/pages/signals/signalPageUtils';

type UseSignalReassessOptions = {
  setSelected: React.Dispatch<React.SetStateAction<SelectedSignal | null>>;
  selected: SelectedSignal | null;
  appliedSourceReportId: number | undefined;
  activeStockContext: StockContext | null;
  appliedTimelineContext: AppliedTimelineContext | null;
  latestLimit: number;
  setLatestItems: React.Dispatch<React.SetStateAction<DecisionSignalItem[]>>;
  setTimelineItems: React.Dispatch<React.SetStateAction<DecisionSignalItem[]>>;
  loadLatestForContext: (context: StockContext) => Promise<void>;
  loadTimelineForContext: (context: StockContext, filters: TimelineFilters) => Promise<void>;
  loadSignalsForPage: (page: number) => Promise<void>;
  page: number;
};

export function useSignalReassess({
  setSelected,
  selected,
  appliedSourceReportId,
  activeStockContext,
  appliedTimelineContext,
  latestLimit,
  setLatestItems,
  setTimelineItems,
  loadLatestForContext,
  loadTimelineForContext,
  loadSignalsForPage,
  page,
}: UseSignalReassessOptions) {
  const [reassessProfile, setReassessProfile] = useState<DecisionProfile>('balanced');
  const [reassessResponse, setReassessResponse] = useState<DecisionSignalReassessResponse | null>(null);
  const [reassessLoading, setReassessLoading] = useState(false);
  const [reassessPersisting, setReassessPersisting] = useState(false);
  const [reassessPersistConfirm, setReassessPersistConfirm] = useState(false);
  const [reassessPersistBlocked, setReassessPersistBlocked] = useState<DecisionSignalReassessBlockedError | null>(null);
  const [reassessError, setReassessError] = useState<ParsedApiError | null>(null);
  const reassessRequestIdRef = useRef(0);

  const selectedSourceReportId = selected?.item.sourceReportId ?? undefined;
  const reassessSourceReportId = selected ? selectedSourceReportId : appliedSourceReportId;
  const reassessContextKey = [
    reassessSourceReportId ?? '',
    reassessProfile,
  ].join(':');

  useEffect(() => {
    reassessRequestIdRef.current += 1;
    setReassessResponse(null);
    setReassessError(null);
    setReassessLoading(false);
    setReassessPersisting(false);
    setReassessPersistConfirm(false);
    setReassessPersistBlocked(null);
  }, [reassessContextKey]);

  const handleReassess = useCallback(async () => {
    if (!reassessSourceReportId) return;
    const requestId = reassessRequestIdRef.current + 1;
    reassessRequestIdRef.current = requestId;
    setReassessLoading(true);
    setReassessError(null);
    setReassessPersistBlocked(null);
    try {
      const response = await decisionSignalsApi.reassess({
        sourceReportId: reassessSourceReportId,
        decisionProfile: reassessProfile,
        persist: false,
      });
      if (reassessRequestIdRef.current !== requestId) return;
      setReassessResponse(response);
    } catch (err) {
      if (reassessRequestIdRef.current !== requestId) return;
      setReassessResponse(null);
      setReassessError(getParsedApiError(err));
    } finally {
      if (reassessRequestIdRef.current === requestId) {
        setReassessLoading(false);
      }
    }
  }, [reassessProfile, reassessSourceReportId]);

  const handlePersistReassess = useCallback(async () => {
    const preview = reassessResponse?.preview;
    const guardrail = preview && isRecord(preview.metadata.guardrail_result)
      ? preview.metadata.guardrail_result
      : null;
    if (!reassessSourceReportId || !preview || guardrail?.passed !== true) return;

    const requestId = reassessRequestIdRef.current + 1;
    reassessRequestIdRef.current = requestId;
    setReassessPersistConfirm(false);
    setReassessPersisting(true);
    setReassessError(null);
    setReassessPersistBlocked(null);
    try {
      const response = await decisionSignalsApi.reassess({
        sourceReportId: reassessSourceReportId,
        decisionProfile: reassessProfile,
        persist: true,
      });
      if (reassessRequestIdRef.current !== requestId) return;
      if (!response.item || !response.persistStatus) {
        throw new Error('DecisionSignal reassess persist response item and persist_status are required');
      }
      const authoritativeItem = response.item;
      const shouldOptimisticallyUpsert = response.persistStatus !== 'existing';
      setReassessResponse(response);
      setSelected((current) => (
        current
          ? { source: 'persisted', item: authoritativeItem }
          : null
      ));
      if (
        shouldOptimisticallyUpsert
        &&
        activeStockContext
        && authoritativeItem.status === 'active'
        && itemMatchesStockContext(authoritativeItem, activeStockContext)
      ) {
        setLatestItems((current) => upsertDecisionSignal(current, authoritativeItem, latestLimit));
        void loadLatestForContext(activeStockContext);
      }
      if (
        shouldOptimisticallyUpsert
        &&
        appliedTimelineContext
        && itemMatchesStockContext(authoritativeItem, {
          code: appliedTimelineContext.stockCode,
          market: appliedTimelineContext.market || undefined,
        })
      ) {
        if (itemMatchesAppliedTimeline(authoritativeItem, appliedTimelineContext)) {
          setTimelineItems((current) => upsertDecisionSignal(current, authoritativeItem));
        }
        void loadTimelineForContext(
          {
            code: appliedTimelineContext.stockCode,
            market: appliedTimelineContext.market || undefined,
          },
          appliedTimelineContext,
        );
      }
      void loadSignalsForPage(page);
    } catch (err) {
      if (reassessRequestIdRef.current !== requestId) return;
      const blocked = getDecisionSignalReassessBlockedError(err);
      if (blocked) {
        setReassessPersistBlocked(blocked);
        setReassessError(null);
      } else {
        setReassessError(getParsedApiError(err));
      }
    } finally {
      if (reassessRequestIdRef.current === requestId) {
        setReassessPersisting(false);
      }
    }
  }, [
    activeStockContext,
    appliedTimelineContext,
    latestLimit,
    loadLatestForContext,
    loadSignalsForPage,
    loadTimelineForContext,
    page,
    reassessProfile,
    reassessResponse,
    reassessSourceReportId,
    setLatestItems,
    setSelected,
    setTimelineItems,
  ]);

  return {
    reassessProfile,
    setReassessProfile,
    reassessResponse,
    reassessLoading,
    reassessPersisting,
    reassessPersistConfirm,
    setReassessPersistConfirm,
    reassessPersistBlocked,
    reassessError,
    reassessSourceReportId,
    handleReassess,
    handlePersistReassess,
  };
}
