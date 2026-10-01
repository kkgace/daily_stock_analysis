import type React from 'react';
import { X } from 'lucide-react';
import { Button, InlineAlert } from '@/components/ui';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';

type TranslateFn = (key: UiTextKey, params?: UiTextParams) => string;

type HomeAlertsProps = {
  inputError: string | null;
  duplicateError: string | null;
  duplicateBannerVisible: boolean;
  onDismissDuplicateBanner: () => void;
  setupNeedsAction: boolean;
  setupMissingLabels: string;
  onGoSettings: () => void;
  t: TranslateFn;
};

export const HomeAlerts: React.FC<HomeAlertsProps> = ({
  inputError,
  duplicateError,
  duplicateBannerVisible,
  onDismissDuplicateBanner,
  setupNeedsAction,
  setupMissingLabels,
  onGoSettings,
  t,
}) => (
  <>
    {inputError || (duplicateError && duplicateBannerVisible) ? (
      <div className="px-3 pb-2 md:px-4">
        {inputError ? (
          <InlineAlert
            variant="danger"
            title={t('home.inputInvalid')}
            message={inputError}
            className="rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}
        {!inputError && duplicateError && duplicateBannerVisible ? (
          <InlineAlert
            variant="warning"
            title={t('home.duplicateTask')}
            message={duplicateError}
            action={(
              <button
                type="button"
                onClick={onDismissDuplicateBanner}
                aria-label={t('common.close')}
                className="-my-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-70 transition-colors hover:bg-warning/15 hover:opacity-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            className="rounded-xl px-3 py-2 text-xs shadow-none"
          />
        ) : null}
      </div>
    ) : null}

    {setupNeedsAction ? (
      <div className="px-3 pb-2 md:px-4">
        <InlineAlert
          variant="warning"
          title={t('home.setupIncomplete')}
          message={
            setupMissingLabels
              ? t('home.setupMissingWithLabels', { labels: setupMissingLabels })
              : t('home.setupMissingGeneric')
          }
          action={(
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onGoSettings}
            >
              {t('home.goSettings')}
            </Button>
          )}
          className="rounded-xl px-3 py-2 text-xs shadow-none"
        />
      </div>
    ) : null}
  </>
);
