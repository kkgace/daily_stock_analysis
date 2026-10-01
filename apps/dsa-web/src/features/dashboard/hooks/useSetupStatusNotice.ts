import { useEffect, useMemo, useState } from 'react';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import type { SetupStatusResponse } from '@/features/settings/types/systemConfig';
import type { UiLanguage } from '@/i18n/uiText';

export function useSetupStatusNotice(uiLanguage: UiLanguage) {
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);

  useEffect(() => {
    let active = true;
    systemConfigApi.getSetupStatus()
      .then((status) => {
        if (active) {
          setSetupStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setSetupStatus(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setupNeedsAction = setupStatus ? !setupStatus.isComplete : false;
  const setupMissingLabels = useMemo(() => {
    if (!setupStatus) {
      return '';
    }
    const requiredNeedsAction = setupStatus.checks
      .filter((check) => check.required && check.status === 'needs_action')
      .map((check) => check.title);
    return requiredNeedsAction.slice(0, 3).join(uiLanguage === 'en' ? ', ' : '、');
  }, [setupStatus, uiLanguage]);

  return { setupNeedsAction, setupMissingLabels };
}
