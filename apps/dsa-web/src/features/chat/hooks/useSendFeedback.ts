import { useCallback, useEffect, useRef, useState } from 'react';

export type SendToast = {
  type: 'success' | 'error';
  message: string;
};

export const useSendFeedback = () => {
  const [sendToast, setSendToast] = useState<SendToast | null>(null);
  const sendToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sendToastTimerRef.current !== null) {
        window.clearTimeout(sendToastTimerRef.current);
      }
    };
  }, []);

  const showSendFeedback = useCallback((nextToast: SendToast, durationMs: number) => {
    if (sendToastTimerRef.current !== null) {
      window.clearTimeout(sendToastTimerRef.current);
    }
    setSendToast(nextToast);
    sendToastTimerRef.current = window.setTimeout(() => {
      setSendToast(null);
      sendToastTimerRef.current = null;
    }, durationMs);
  }, []);

  return { sendToast, setSendToast, showSendFeedback };
};
