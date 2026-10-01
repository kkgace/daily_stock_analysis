import type React from 'react';
import type { ParsedApiError } from '@/api/error';
import { ApiErrorAlert, Button } from '@/components/ui';
import { SettingsAlert, SettingsSectionCard } from '@/features/settings/components/settings';
import type { SettingsTranslate } from './settingsConfigKeys';

type ScreeningSettingsCardProps = {
  screeningEnabled: boolean;
  disabled: boolean;
  isUpdating: boolean;
  actionError: ParsedApiError | null;
  actionSuccess: string;
  onToggle: (nextEnabled: boolean) => void | Promise<void>;
  t: SettingsTranslate;
};

export const ScreeningSettingsCard: React.FC<ScreeningSettingsCardProps> = ({
  screeningEnabled,
  disabled,
  isUpdating,
  actionError,
  actionSuccess,
  onToggle,
  t,
}) => (
  <SettingsSectionCard
    title={t('settings.screening')}
    description={t('settings.screeningDescription')}
  >
    <div className="flex flex-col gap-4 rounded-2xl border settings-border bg-background/35 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {screeningEnabled ? t('settings.screeningEnabled') : t('settings.screeningDisabled')}
        </p>
        <p className="mt-1 text-xs leading-6 text-muted-text">
          {t('settings.screeningSummary')}
        </p>
        <p className="mt-2 text-xs leading-6 text-warning">
          {t('settings.screeningRisk')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={screeningEnabled ? 'settings-secondary' : 'settings-primary'}
          onClick={() => void onToggle(!screeningEnabled)}
          disabled={disabled || isUpdating}
          isLoading={isUpdating}
          loadingText={screeningEnabled ? t('settings.disablingScreening') : t('settings.enablingScreening')}
        >
          {screeningEnabled ? t('settings.disableScreening') : t('settings.enableScreening')}
        </Button>
      </div>
    </div>
    {actionError ? (
      <div className="mt-3">
        <ApiErrorAlert error={actionError} />
      </div>
    ) : null}
    {!actionError && actionSuccess ? (
      <div className="mt-3">
        <SettingsAlert title={t('settings.actionSuccess')} message={actionSuccess} variant="success" />
      </div>
    ) : null}
  </SettingsSectionCard>
);
