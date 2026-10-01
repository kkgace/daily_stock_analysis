import { useCallback, useEffect, useRef, useState } from 'react';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import { analysisApi } from '@/features/dashboard/api/analysis';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import type { SetupStatusResponse } from '@/features/settings/types/systemConfig';
import { createParsedApiError } from '@/api/error';
import type { SettingsTranslate } from '@/features/settings/pages/settings/settingsConfigKeys';

/**
 * 加载与刷新首次配置向导状态（/setup/status），带请求序号防陈旧响应。
 */
export function useSetupStatus() {
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);
  const [isRefreshingSetupStatus, setIsRefreshingSetupStatus] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState<ParsedApiError | null>(null);
  const setupStatusRequestIdRef = useRef(0);

  const refreshSetupStatus = useCallback(async () => {
    const requestId = setupStatusRequestIdRef.current + 1;
    setupStatusRequestIdRef.current = requestId;
    setSetupStatusError(null);
    setIsRefreshingSetupStatus(true);
    try {
      const status = await systemConfigApi.getSetupStatus();
      if (setupStatusRequestIdRef.current !== requestId) {
        return;
      }
      setSetupStatus(status);
    } catch (error: unknown) {
      if (setupStatusRequestIdRef.current !== requestId) {
        return;
      }
      setSetupStatusError(getParsedApiError(error));
    } finally {
      if (setupStatusRequestIdRef.current === requestId) {
        setIsRefreshingSetupStatus(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  return {
    setupStatus,
    isRefreshingSetupStatus,
    setupStatusError,
    refreshSetupStatus,
  };
}

/**
 * 首次配置向导的冒烟分析触发逻辑。
 */
export function useSetupSmoke(options: {
  setupStatus: SetupStatusResponse | null;
  firstStockCode: string;
  t: SettingsTranslate;
  onSmokeStarted?: () => void;
}) {
  const { setupStatus, firstStockCode, t, onSmokeStarted } = options;
  const [isRunningSetupSmoke, setIsRunningSetupSmoke] = useState(false);
  const [setupSmokeError, setSetupSmokeError] = useState<ParsedApiError | null>(null);
  const [setupSmokeSuccess, setSetupSmokeSuccess] = useState('');

  const runSetupSmoke = useCallback(async () => {
    setSetupSmokeError(null);
    setSetupSmokeSuccess('');

    if (!setupStatus?.readyForSmoke) {
      setSetupSmokeError(createParsedApiError({
        title: t('settings.setupGuideSmokeUnavailableTitle'),
        message: t('settings.setupGuideSmokeNotReady'),
        rawMessage: t('settings.setupGuideSmokeNotReady'),
        category: 'missing_params',
      }));
      return;
    }

    if (!firstStockCode) {
      setSetupSmokeError(createParsedApiError({
        title: t('settings.setupGuideSmokeUnavailableTitle'),
        message: t('settings.setupGuideSmokeNeedsStock'),
        rawMessage: t('settings.setupGuideSmokeNeedsStock'),
        category: 'missing_params',
      }));
      return;
    }

    setIsRunningSetupSmoke(true);
    try {
      const result = await analysisApi.analyzeAsync({
        stockCode: firstStockCode,
        reportType: 'brief',
        asyncMode: true,
        notify: false,
        originalQuery: firstStockCode,
        selectionSource: 'manual',
      });
      const taskId = 'taskId' in result ? result.taskId : result.accepted?.[0]?.taskId;
      setSetupSmokeSuccess(
        taskId
          ? t('settings.setupGuideSmokeAcceptedWithTask', { stock: firstStockCode, taskId })
          : t('settings.setupGuideSmokeAccepted', { stock: firstStockCode }),
      );
      onSmokeStarted?.();
    } catch (error: unknown) {
      setSetupSmokeError(getParsedApiError(error));
    } finally {
      setIsRunningSetupSmoke(false);
    }
  }, [firstStockCode, onSmokeStarted, setupStatus, t]);

  return {
    isRunningSetupSmoke,
    setupSmokeError,
    setupSmokeSuccess,
    runSetupSmoke,
  };
}
