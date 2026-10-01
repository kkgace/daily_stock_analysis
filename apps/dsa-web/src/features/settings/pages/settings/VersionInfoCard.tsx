import type React from 'react';
import { Button } from '@/components/ui';
import { SettingsAlert, SettingsSectionCard } from '@/features/settings/components/settings';
import { WEB_BUILD_INFO } from '@/utils/constants';
import type { DesktopUpdateNotice } from '@/desktop/updateState';
import type { SettingsTranslate } from './settingsConfigKeys';

type VersionInfoCardProps = {
  desktopAppVersion: string | null;
  canCheckDesktopUpdate: boolean;
  isDesktopUpdateBusy: boolean;
  isCheckingDesktopUpdate: boolean;
  desktopUpdateNotice: DesktopUpdateNotice | null;
  onCheckDesktopUpdate: () => void | Promise<void>;
  onInstallDesktopUpdate: () => void | Promise<void>;
  onOpenDesktopReleasePage: () => void | Promise<void>;
  t: SettingsTranslate;
};

export const VersionInfoCard: React.FC<VersionInfoCardProps> = ({
  desktopAppVersion,
  canCheckDesktopUpdate,
  isDesktopUpdateBusy,
  isCheckingDesktopUpdate,
  desktopUpdateNotice,
  onCheckDesktopUpdate,
  onInstallDesktopUpdate,
  onOpenDesktopReleasePage,
  t,
}) => {
  const shouldShowDesktopVersionCard = Boolean(desktopAppVersion);

  return (
    <div id="desktop-version-info">
    <SettingsSectionCard
      title={t('settings.versionInfo')}
      description={t('settings.versionInfoDescription')}
    >
      <div
        className={`grid grid-cols-1 gap-3 ${shouldShowDesktopVersionCard ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}
      >
        <div className="rounded-2xl border settings-border bg-background/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-text">
            {t('settings.versionWebui')}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {WEB_BUILD_INFO.version}
          </p>
        </div>
        <div className="rounded-2xl border settings-border bg-background/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-text">
            {t('settings.versionRevision')}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {WEB_BUILD_INFO.revision}
          </p>
        </div>
        <div className="rounded-2xl border settings-border bg-background/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-text">
            {t('settings.versionBuildTime')}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {WEB_BUILD_INFO.buildTime}
          </p>
        </div>
        {shouldShowDesktopVersionCard ? (
          <div className="rounded-2xl border settings-border bg-background/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-text">
              {t('settings.versionDesktop')}
            </p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">
              {desktopAppVersion}
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-xs leading-6 text-muted-text">
        {t('settings.updateBuildDescription')}
      </p>
      {canCheckDesktopUpdate ? (
        <div className="mt-4 space-y-3 rounded-2xl border settings-border bg-background/30 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t('settings.desktopUpdate')}</p>
              <p className="text-xs leading-6 text-muted-text">
                {t('settings.desktopUpdateDescription')}
              </p>
            </div>
            <Button
              type="button"
              variant="settings-secondary"
              onClick={() => void onCheckDesktopUpdate()}
              disabled={isDesktopUpdateBusy}
              isLoading={isCheckingDesktopUpdate}
              loadingText={t('settings.checkingDesktopUpdate')}
            >
              {t('settings.checkDesktopUpdate')}
            </Button>
          </div>
          {desktopUpdateNotice ? (
            <SettingsAlert
              title={desktopUpdateNotice.title}
              message={desktopUpdateNotice.message}
              variant={desktopUpdateNotice.variant}
              actionLabel={desktopUpdateNotice.actionLabel}
              onAction={desktopUpdateNotice.actionLabel ? () => {
                if (desktopUpdateNotice.actionKind === 'install') {
                  void onInstallDesktopUpdate();
                  return;
                }
                void onOpenDesktopReleasePage();
              } : undefined}
            />
          ) : (
            <p className="text-xs leading-6 text-muted-text">
              {t('settings.desktopCurrentNoStatus')}
            </p>
          )}
        </div>
      ) : null}
      {WEB_BUILD_INFO.isFallbackVersion ? (
        <p className="text-xs leading-6 text-warning">
          {t('settings.fallbackVersionWarning')}
        </p>
      ) : null}
    </SettingsSectionCard>
    </div>
  );
};
