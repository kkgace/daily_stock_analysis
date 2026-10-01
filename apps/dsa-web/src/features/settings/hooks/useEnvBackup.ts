import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { createParsedApiError, getParsedApiError, type ParsedApiError } from '@/api/error';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import { notifySystemConfigChanged } from '@/features/screening/api/screening';
import {
  formatEnvBackupFilename,
  SCHEDULER_SETTING_KEYS,
  type SettingsTranslate,
} from '@/features/settings/pages/settings/settingsConfigKeys';

type UseEnvBackupOptions = {
  configVersion: string;
  isDesktopRuntime: boolean;
  t: SettingsTranslate;
  /** 导入成功后重新加载配置；返回是否成功。 */
  load: () => Promise<boolean>;
  /** 导入的键命中调度配置时回调（用于触发调度状态刷新）。 */
  onSchedulerSettingsImported?: () => void;
  /** 导入/保存完成后回调（用于刷新 setup status 等外部状态）。 */
  onImported?: () => void;
};

/**
 * `.env` 配置备份的导出 / 导入逻辑（含导入前 dirty 确认与文件选择）。
 */
export function useEnvBackup(options: UseEnvBackupOptions) {
  const {
    configVersion,
    isDesktopRuntime,
    t,
    load,
    onSchedulerSettingsImported,
    onImported,
  } = options;
  const [envBackupActionError, setEnvBackupActionError] = useState<ParsedApiError | null>(null);
  const [envBackupActionSuccess, setEnvBackupActionSuccess] = useState<string>('');
  const [isExportingEnv, setIsExportingEnv] = useState(false);
  const [isImportingEnv, setIsImportingEnv] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const envBackupImportRef = useRef<HTMLInputElement | null>(null);

  const downloadEnvBackup = useCallback(async () => {
    setEnvBackupActionError(null);
    setEnvBackupActionSuccess('');
    setIsExportingEnv(true);
    try {
      const payload = await systemConfigApi.exportEnv();
      const blob = new Blob([payload.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = formatEnvBackupFilename(isDesktopRuntime);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setEnvBackupActionSuccess(t('settings.envExported'));
    } catch (error: unknown) {
      setEnvBackupActionError(getParsedApiError(error));
    } finally {
      setIsExportingEnv(false);
    }
  }, [isDesktopRuntime, t]);

  const beginEnvBackupImport = useCallback((hasDirty: boolean) => {
    setEnvBackupActionError(null);
    setEnvBackupActionSuccess('');
    if (hasDirty) {
      setShowImportConfirm(true);
      return;
    }
    envBackupImportRef.current?.click();
  }, []);

  const confirmEnvBackupImport = useCallback(() => {
    setShowImportConfirm(false);
    envBackupImportRef.current?.click();
  }, []);

  const cancelEnvBackupImport = useCallback(() => {
    setShowImportConfirm(false);
  }, []);

  const handleEnvBackupImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setShowImportConfirm(false);
    if (!file) {
      return;
    }

    setEnvBackupActionError(null);
    setEnvBackupActionSuccess('');
    setIsImportingEnv(true);
    try {
      const content = await file.text();
      const importResult = await systemConfigApi.importEnv({
        configVersion,
        content,
        reloadNow: true,
      });
      const reloaded = await load();
      if (!reloaded) {
        setEnvBackupActionError(createParsedApiError({
          title: t('settings.envImportedRefreshFailedTitle'),
          message: t('settings.envImportedRefreshFailedMessage'),
          rawMessage: t('settings.envImportedRefreshFailedRaw'),
          category: 'http_error',
        }));
        return;
      }
      if (importResult.updatedKeys.some((key) => SCHEDULER_SETTING_KEYS.has(key))) {
        onSchedulerSettingsImported?.();
      }
      notifySystemConfigChanged();
      onImported?.();
      setEnvBackupActionSuccess(t('settings.envImported'));
    } catch (error: unknown) {
      setEnvBackupActionError(getParsedApiError(error));
    } finally {
      setIsImportingEnv(false);
    }
  }, [configVersion, load, onImported, onSchedulerSettingsImported, t]);

  return {
    envBackupActionError,
    envBackupActionSuccess,
    isExportingEnv,
    isImportingEnv,
    showImportConfirm,
    envBackupImportRef,
    downloadEnvBackup,
    beginEnvBackupImport,
    confirmEnvBackupImport,
    cancelEnvBackupImport,
    handleEnvBackupImportFile,
  };
}
