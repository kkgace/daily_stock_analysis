import type React from 'react';
import type { ChangeEvent, RefObject } from 'react';
import type { ParsedApiError } from '@/api/error';
import { ApiErrorAlert, Button } from '@/components/ui';
import { SettingsAlert, SettingsSectionCard } from '@/features/settings/components/settings';
import type { SettingsTranslate } from './settingsConfigKeys';

type ConfigBackupCardProps = {
  isEnvBackupAllowed: boolean;
  envBackupActionDisabled: boolean;
  isExportingEnv: boolean;
  isImportingEnv: boolean;
  actionError: ParsedApiError | null;
  actionSuccess: string;
  importInputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void | Promise<void>;
  onBeginImport: () => void;
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onReloadAfterVersionConflict: () => void | Promise<void>;
  t: SettingsTranslate;
};

export const ConfigBackupCard: React.FC<ConfigBackupCardProps> = ({
  isEnvBackupAllowed,
  envBackupActionDisabled,
  isExportingEnv,
  isImportingEnv,
  actionError,
  actionSuccess,
  importInputRef,
  onExport,
  onBeginImport,
  onImportFile,
  onReloadAfterVersionConflict,
  t,
}) => (
  <SettingsSectionCard
    title={t('settings.configBackup')}
    description={t('settings.configBackupDescription')}
  >
    <div className="space-y-4">
      {!isEnvBackupAllowed ? (
        <p className="text-xs leading-6 text-warning">
          {t('settings.disabledAuthBackupWarning')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="settings-secondary"
          onClick={() => void onExport()}
          disabled={envBackupActionDisabled}
          isLoading={isExportingEnv}
          loadingText={t('settings.exportingEnv')}
        >
          {t('settings.exportEnv')}
        </Button>
        <Button
          type="button"
          variant="settings-primary"
          onClick={onBeginImport}
          disabled={envBackupActionDisabled}
          isLoading={isImportingEnv}
          loadingText={t('settings.importingEnv')}
        >
          {t('settings.importEnv')}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".env,.txt"
          className="hidden"
          onChange={(event) => {
            void onImportFile(event);
          }}
        />
      </div>
      <p className="text-xs leading-6 text-muted-text">
        {t('settings.envExportNote')}
      </p>
      <p className="text-xs leading-6 text-muted-text">
        {t('settings.envDockerNote')}
      </p>
      {actionError ? (
        <ApiErrorAlert
          error={actionError}
          actionLabel={actionError.status === 409 ? t('settings.reload') : undefined}
          onAction={actionError.status === 409 ? () => void onReloadAfterVersionConflict() : undefined}
        />
      ) : null}
      {!actionError && actionSuccess ? (
        <SettingsAlert title={t('settings.actionSuccess')} message={actionSuccess} variant="success" />
      ) : null}
    </div>
  </SettingsSectionCard>
);
