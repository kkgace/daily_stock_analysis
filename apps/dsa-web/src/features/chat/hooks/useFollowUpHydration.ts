import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  buildFollowUpPrompt,
  parseFollowUpRecordId,
  resolveChatFollowUpContext,
  sanitizeFollowUpStockCode,
  sanitizeFollowUpStockName,
} from '@/features/chat/utils/chatFollowUp';
import type { ChatFollowUpContext } from '@/features/chat/utils/chatFollowUp';
import { resolveRegisteredIndexCanonical } from '@/utils/stockCode';
import type { StockIndexItem } from '@/types/stockIndex';
import type { ActiveStockContext } from '@/features/chat/pages/chat/types';

type UseFollowUpHydrationArgs = {
  stockIndex: StockIndexItem[];
  stockIndexLoading: boolean;
  agentStatusChecking: boolean;
  setInput: Dispatch<SetStateAction<string>>;
  setActiveStockCode: Dispatch<SetStateAction<string | null>>;
  setActiveStockContext: Dispatch<SetStateAction<ActiveStockContext | null>>;
};

type FollowUpSeed = {
  stock: string;
  name: string | null;
  recordId: number | undefined;
};

// Purely resolve the follow-up seed from the URL so the render pass and the
// hydration effect agree on what (if anything) should be hydrated.
const resolveFollowUpSeed = (
  searchParams: URLSearchParams,
  stockIndex: StockIndexItem[],
): FollowUpSeed | null => {
  const rawStockCode = searchParams.get('stock');
  if (!rawStockCode) {
    return null;
  }
  // Registry canonical first for explicit index follow-ups (sh000016 /
  // 000016.SH / 930955.CSI / csi930955) so the report-follow-up canonical is
  // preserved end-to-end; the sanitize contract is untouched and remains the
  // stock fail-open when the registry is unavailable or the code unregistered.
  const registryCanonical = resolveRegisteredIndexCanonical(stockIndex, rawStockCode);
  const stock = registryCanonical ?? sanitizeFollowUpStockCode(rawStockCode);
  if (!stock) {
    return null;
  }
  return {
    stock,
    name: sanitizeFollowUpStockName(searchParams.get('name')),
    recordId: parseFollowUpRecordId(searchParams.get('recordId')),
  };
};

// Handle follow-up from report page: ?stock=600519&name=贵州茅台&recordId=xxx
export const useFollowUpHydration = ({
  stockIndex,
  stockIndexLoading,
  agentStatusChecking,
  setInput,
  setActiveStockCode,
  setActiveStockContext,
}: UseFollowUpHydrationArgs) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingHydrationRecordId, setPendingHydrationRecordId] = useState<number | null>(null);
  const followUpHydrationTokenRef = useRef(0);
  const followUpContextRef = useRef<ChatFollowUpContext | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const followUpSeed = resolveFollowUpSeed(searchParams, stockIndex);
  const gatedRecordId =
    !stockIndexLoading && !agentStatusChecking && followUpSeed?.recordId !== undefined
      ? followUpSeed.recordId
      : null;

  // Derived-state adjustment during render: remember that a report-context
  // hydration is pending. It is cleared asynchronously when hydration settles
  // or is cancelled, keeping the effect below free of synchronous setState.
  if (gatedRecordId !== null && gatedRecordId !== pendingHydrationRecordId) {
    setPendingHydrationRecordId(gatedRecordId);
  }

  const isFollowUpContextLoading = pendingHydrationRecordId !== null;

  useEffect(() => {
    const rawStockCode = searchParams.get('stock');
    if (!rawStockCode) {
      // Nothing to follow up — only clear when there actually ARE stale query
      // params. Skipping the empty case avoids redundant `replace: true`
      // navigations on every effect re-run (the gate below legitimately re-runs
      // as status/registry state settles), which would otherwise clobber
      // subsequent RouterProvider navigation state asserted by other tests.
      if (searchParams.size === 0) {
        return;
      }
      setSearchParams({}, { replace: true });
      return;
    }

    if (stockIndexLoading) {
      return;
    }
    if (agentStatusChecking) {
      return;
    }

    const seed = resolveFollowUpSeed(searchParams, stockIndex);
    if (!seed) {
      setSearchParams({}, { replace: true });
      return;
    }
    const { stock, name, recordId } = seed;

    const hydrationToken = ++followUpHydrationTokenRef.current;
    setInput(buildFollowUpPrompt(stock, name));
    setActiveStockCode(stock);
    setActiveStockContext({
      stock_code: stock,
      stock_name: name,
    });
    followUpContextRef.current = {
      stock_code: stock,
      stock_name: name,
    };
    void resolveChatFollowUpContext({
      stockCode: stock,
      stockName: name,
      recordId,
    }).then((context) => {
      if (!isMountedRef.current || followUpHydrationTokenRef.current !== hydrationToken) {
        return;
      }
      followUpContextRef.current = context;
    }).finally(() => {
      if (
        isMountedRef.current
        && followUpHydrationTokenRef.current === hydrationToken
        && recordId !== undefined
      ) {
        setPendingHydrationRecordId((current) => (current === recordId ? null : current));
      }
    });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, stockIndex, stockIndexLoading, agentStatusChecking, setInput, setActiveStockCode, setActiveStockContext]);

  const cancelFollowUpHydration = useCallback(() => {
    followUpHydrationTokenRef.current += 1;
    followUpContextRef.current = null;
    setPendingHydrationRecordId(null);
  }, []);

  return {
    followUpContextRef,
    isFollowUpContextLoading,
    cancelFollowUpHydration,
  };
};
