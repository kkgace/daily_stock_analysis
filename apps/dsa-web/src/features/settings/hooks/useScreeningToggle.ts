import { useCallback, useState } from 'react';
import { getParsedApiError, type ParsedApiError } from '@/api/error';
import {
  notifyScreeningConfigChanged,
  screeningApi,
} from '@/features/screening/api/screening';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import type { SettingsTranslate } from '@/features/settings/pages/settings/settingsConfigKeys';

type UseScreeningToggleOptions = {
  configVersion: string;
  maskToken: string;
  t: SettingsTranslate;
  refreshAfterExternalSave: (keys: string[]) => Promise<unknown>;
};

/**
 * 选股筛选（SCREENING_ENABLED）的启用 / 停用逻辑：
 * 启用走专用 API，停用走通用配置更新；失败也会回读真实状态。
 */
export function useScreeningToggle(options: UseScreeningToggleOptions) {
  const { configVersion, maskToken, t, refreshAfterExternalSave } = options;
  const [screeningActionError, setScreeningActionError] = useState<ParsedApiError | null>(null);
  const [screeningActionSuccess, setScreeningActionSuccess] = useState<string>('');
  const [isUpdatingScreening, setIsUpdatingScreening] = useState(false);

  const applyScreeningEnabled = useCallback(async (nextEnabled: boolean) => {
    setScreeningActionError(null);
    setScreeningActionSuccess('');
    try {
      if (nextEnabled) {
        await screeningApi.enable();
        await refreshAfterExternalSave(['SCREENING_ENABLED']);
        setScreeningActionSuccess(t('settings.enabledScreeningSuccess'));
        return;
      }

      notifyScreeningConfigChanged();
      setScreeningActionSuccess(t('settings.disabledScreeningSuccess'));
    } catch (error: unknown) {
      setScreeningActionError(getParsedApiError(error));
      await refreshAfterExternalSave(['SCREENING_ENABLED']);
    }
  }, [refreshAfterExternalSave, t]);

  const updateScreeningEnabled = useCallback(async (nextEnabled: boolean) => {
    setScreeningActionError(null);
    setScreeningActionSuccess('');
    setIsUpdatingScreening(true);
    try {
      if (nextEnabled) {
        await screeningApi.enable();
        await refreshAfterExternalSave(['SCREENING_ENABLED']);
        setScreeningActionSuccess(t('settings.enabledScreeningSuccess'));
        return;
      }

      await systemConfigApi.update({
        configVersion,
        maskToken,
        reloadNow: true,
        items: [{ key: 'SCREENING_ENABLED', value: 'false' }],
      });
      notifyScreeningConfigChanged();
      await refreshAfterExternalSave(['SCREENING_ENABLED']);
      setScreeningActionSuccess(t('settings.disabledScreeningSuccess'));
    } catch (error: unknown) {
      setScreeningActionError(getParsedApiError(error));
      await refreshAfterExternalSave(['SCREENING_ENABLED']);
    } finally {
      setIsUpdatingScreening(false);
    }
  }, [configVersion, maskToken, refreshAfterExternalSave, t]);

  /**
   * 保存配置后根据已保存的 SCREENING_ENABLED 值同步外部开关状态。
   */
  const syncScreeningAfterSave = useCallback(async (savedValue: string) => {
    const isScreeningEnabled = savedValue.trim().toLowerCase() === 'true';
    await applyScreeningEnabled(isScreeningEnabled);
  }, [applyScreeningEnabled]);

  return {
    screeningActionError,
    screeningActionSuccess,
    isUpdatingScreening,
    updateScreeningEnabled,
    syncScreeningAfterSave,
  };
}
