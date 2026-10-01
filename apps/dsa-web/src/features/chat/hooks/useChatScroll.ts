import { useCallback, useEffect, useRef, useState } from 'react';
import { isNearBottom } from '@/features/chat/utils/chatScroll';

type UseChatScrollArgs = {
  messages: unknown[];
  progressSteps: unknown[];
  loading: boolean;
  sessionId: string | null;
};

// Snapshot of the content identity captured at the last scroll sync. The
// jump-to-bottom button is derived from this snapshot instead of being toggled
// by a synchronous setState inside an effect: it appears when the user is away
// from the bottom AND the content has changed since that position was recorded.
type AwaySnapshot = {
  away: boolean;
  messages: unknown[];
  progressSteps: unknown[];
  loading: boolean;
  sessionId: string | null;
};

export const useChatScroll = ({ messages, progressSteps, loading, sessionId }: UseChatScrollArgs) => {
  const [awaySnapshot, setAwaySnapshot] = useState<AwaySnapshot>({
    away: false,
    messages,
    progressSteps,
    loading,
    sessionId,
  });
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('auto');

  const showJumpToBottom =
    awaySnapshot.away &&
    (awaySnapshot.messages !== messages ||
      awaySnapshot.progressSteps !== progressSteps ||
      awaySnapshot.loading !== loading ||
      awaySnapshot.sessionId !== sessionId) &&
    (messages.length > 0 || progressSteps.length > 0 || loading);

  const syncScrollState = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const nearBottom = isNearBottom({
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    shouldStickToBottomRef.current = nearBottom;
    setAwaySnapshot((prev) => {
      if (nearBottom) {
        return prev.away
          ? { away: false, messages, progressSteps, loading, sessionId }
          : prev;
      }
      return prev.away
        ? prev
        : { away: true, messages, progressSteps, loading, sessionId };
    });
  }, [messages, progressSteps, loading, sessionId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const requestScrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      shouldStickToBottomRef.current = true;
      pendingScrollBehaviorRef.current = behavior;
      setAwaySnapshot({ away: false, messages, progressSteps, loading, sessionId });
    },
    [messages, progressSteps, loading, sessionId],
  );

  const handleMessagesScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, sessionId]);

  useEffect(() => {
    const behavior = pendingScrollBehaviorRef.current;
    const shouldAutoScroll = shouldStickToBottomRef.current;
    if (!shouldAutoScroll) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      pendingScrollBehaviorRef.current = loading ? 'auto' : 'smooth';
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, progressSteps, loading, sessionId, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      pendingScrollBehaviorRef.current = 'smooth';
    }
  }, [loading]);

  return {
    messagesViewportRef,
    messagesEndRef,
    showJumpToBottom,
    scrollToBottom,
    requestScrollToBottom,
    handleMessagesScroll,
  };
};
