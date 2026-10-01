import { useCallback, useEffect, useRef, useState } from 'react';
import { DUPLICATE_BANNER_AUTO_DISMISS_MS } from '@/features/dashboard/pages/home/homeUtils';

export function useDuplicateBanner(duplicateError: string | null) {
  const [duplicateBannerVisible, setDuplicateBannerVisible] = useState(false);
  const duplicateBannerTimer = useRef<number | null>(null);

  const clearDuplicateBannerTimer = useCallback(() => {
    if (duplicateBannerTimer.current !== null) {
      window.clearTimeout(duplicateBannerTimer.current);
      duplicateBannerTimer.current = null;
    }
  }, []);

  const dismissDuplicateBanner = useCallback(() => {
    clearDuplicateBannerTimer();
    setDuplicateBannerVisible(false);
  }, [clearDuplicateBannerTimer]);

  // Visibility follows `duplicateError` through a render-phase adjustment:
  // any new error value re-opens the banner, a cleared error hides it, without
  // a synchronous setState inside an effect.
  const [trackedDuplicateError, setTrackedDuplicateError] = useState(duplicateError);
  if (duplicateError !== trackedDuplicateError) {
    setTrackedDuplicateError(duplicateError);
    setDuplicateBannerVisible(duplicateError !== null);
  }

  useEffect(() => {
    if (!duplicateError || !duplicateBannerVisible) {
      clearDuplicateBannerTimer();
      return undefined;
    }

    clearDuplicateBannerTimer();
    duplicateBannerTimer.current = window.setTimeout(() => {
      duplicateBannerTimer.current = null;
      setDuplicateBannerVisible(false);
    }, DUPLICATE_BANNER_AUTO_DISMISS_MS);

    return clearDuplicateBannerTimer;
  }, [clearDuplicateBannerTimer, duplicateBannerVisible, duplicateError]);

  return { duplicateBannerVisible, dismissDuplicateBanner };
}
