import type React from 'react';
import { useMemo } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { ApiErrorAlert, InlineAlert } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import type { UiTextKey } from '@/i18n/uiText';
import type { useSignalReassess } from '@/features/decision-signals/hooks/useSignalReassess';
import type {
  DecisionProfile,
} from '@/features/decision-signals/types/decisionSignals';
import { cn } from '@/utils/cn';
import { buildDecisionActionLabelMap } from '@/utils/decisionAction';
import { REASSESS_PROFILES, STATUS_LABEL_KEYS } from './types';
import { isRecord } from './signalPageUtils';

type ReassessPanelProps = {
  reassess: ReturnType<typeof useSignalReassess>;
};

export const ReassessPanel: React.FC<ReassessPanelProps> = ({ reassess }) => {
  const { t } = useUiLanguage();
  const actionLabels = useMemo(() => buildDecisionActionLabelMap(t), [t]);
  const {
    reassessProfile,
    setReassessProfile,
    reassessResponse,
    reassessLoading,
    reassessPersisting,
    setReassessPersistConfirm,
    reassessPersistBlocked,
    reassessError,
    reassessSourceReportId,
    handleReassess,
  } = reassess;

  const preview = reassessResponse?.preview ?? null;
  const persistedItem = reassessResponse?.item ?? null;
  const persistStatus = reassessResponse?.persistStatus ?? null;
  const terminalExisting = persistStatus === 'existing' && persistedItem?.status !== 'active';
  const persistedAlertVariant = terminalExisting
    ? 'warning'
    : persistStatus === 'existing'
      ? 'info'
      : 'success';
  const persistedTitleKey: UiTextKey = terminalExisting
    ? 'decisionSignals.reassessPersistedTerminalTitle'
    : persistStatus === 'existing'
      ? 'decisionSignals.reassessPersistedExistingTitle'
      : persistStatus === 'refreshed'
        ? 'decisionSignals.reassessPersistedRefreshedTitle'
        : 'decisionSignals.reassessPersistedCreatedTitle';
  const persistedMessageKey: UiTextKey = terminalExisting
    ? 'decisionSignals.reassessPersistedTerminalExisting'
    : persistStatus === 'existing'
      ? 'decisionSignals.reassessPersistedExisting'
      : persistStatus === 'refreshed'
        ? 'decisionSignals.reassessPersistedRefreshed'
        : 'decisionSignals.reassessPersistedCreated';
  const metadata = preview?.metadata ?? {};
  const guardrail = isRecord(metadata.guardrail_result) ? metadata.guardrail_result : null;
  const rawAction = typeof guardrail?.raw_action === 'string' ? guardrail.raw_action : null;
  const finalAction = typeof guardrail?.final_action === 'string' ? guardrail.final_action : null;
  const passed = typeof guardrail?.passed === 'boolean' ? guardrail.passed : null;

  return (
    <div className="rounded-xl border border-border/60 bg-elevated/30 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{t('decisionSignals.reassessTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-secondary-text">
            {reassessSourceReportId
              ? t('decisionSignals.reassessSource', { id: reassessSourceReportId })
              : t('decisionSignals.reassessUnsupported')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="input-surface input-focus-glow h-10 rounded-xl border bg-transparent px-3 text-sm"
            value={reassessProfile}
            onChange={(event) => setReassessProfile(event.target.value as DecisionProfile)}
            aria-label={t('decisionSignals.reassessProfile')}
            disabled={!reassessSourceReportId || reassessLoading || reassessPersisting}
          >
            {REASSESS_PROFILES.map((profile) => (
              <option key={profile} value={profile}>
                {t(`decisionSignals.profile.${profile}` as UiTextKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary inline-flex h-10 items-center justify-center gap-2"
            onClick={() => void handleReassess()}
            disabled={!reassessSourceReportId || reassessLoading || reassessPersisting}
          >
            <RefreshCw className={cn('h-4 w-4', reassessLoading ? 'animate-spin' : '')} />
            {t('decisionSignals.reassessPreview')}
          </button>
        </div>
      </div>

      {!reassessSourceReportId ? (
        <InlineAlert
          className="mt-3"
          variant="warning"
          title={t('decisionSignals.reassessUnsupportedTitle')}
          message={t('decisionSignals.reassessUnsupported')}
        />
      ) : null}
      {reassessError ? <ApiErrorAlert className="mt-3" error={reassessError} /> : null}
      {reassessPersistBlocked ? (
        <div className="mt-3 space-y-2">
          <InlineAlert
            variant="danger"
            title={t('decisionSignals.reassessPersistBlockedTitle')}
            message={reassessPersistBlocked.blockedReason}
          />
          {reassessPersistBlocked.warnings.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-secondary-text">
              {reassessPersistBlocked.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message || warning.code}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {persistedItem ? (
        <InlineAlert
          className="mt-3"
          variant={persistedAlertVariant}
          title={t(persistedTitleKey)}
          message={t(
            persistedMessageKey,
            {
              id: persistedItem.id,
              status: t(STATUS_LABEL_KEYS[persistedItem.status]),
            },
          )}
        />
      ) : null}
      {preview ? (
        <div className="mt-4 space-y-3">
          {reassessResponse?.blockedReason ? (
            <InlineAlert
              variant="warning"
              title={t('decisionSignals.reassessBlockedTitle')}
              message={reassessResponse.blockedReason}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.action')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{actionLabels[preview.action]}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.score')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{preview.score ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.confidence')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{preview.confidence ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.horizon')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{preview.horizon ?? '-'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.entryRange')}</p>
              <p className="mt-1 text-sm text-foreground">
                {preview.entryLow || preview.entryHigh
                  ? `${preview.entryLow ?? '-'} ~ ${preview.entryHigh ?? '-'}`
                  : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.stopLoss')}</p>
              <p className="mt-1 text-sm text-foreground">{preview.stopLoss ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.targetPrice')}</p>
              <p className="mt-1 text-sm text-foreground">{preview.targetPrice ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-xs text-secondary-text">{t('decisionSignals.reassessRawFinal')}</p>
              <p className="mt-1 text-sm text-foreground">{rawAction ?? '-'} {'->'} {finalAction ?? '-'}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-secondary-text">
            {passed === false ? (
              <p className="font-medium text-warning">{t('decisionSignals.reassessBlockedNote')}</p>
            ) : null}
            {preview.invalidation ? <p><span className="text-foreground">{t('decisionSignals.invalidation')}:</span> {preview.invalidation}</p> : null}
            {preview.reason ? <p><span className="text-foreground">{t('decisionSignals.reason')}:</span> {preview.reason}</p> : null}
            {preview.riskSummary ? <p><span className="text-foreground">{t('decisionSignals.riskSummary')}:</span> {preview.riskSummary}</p> : null}
            {preview.watchConditions ? <p><span className="text-foreground">{t('decisionSignals.watchConditions')}:</span> {preview.watchConditions}</p> : null}
          </div>
          {reassessResponse?.warnings.length ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t('decisionSignals.reassessWarnings')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-secondary-text">
                {reassessResponse.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warning.message || warning.code}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {passed === true ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary inline-flex h-10 items-center justify-center gap-2"
                onClick={() => setReassessPersistConfirm(true)}
                disabled={reassessLoading || reassessPersisting}
              >
                <ShieldCheck className="h-4 w-4" />
                {reassessPersisting
                  ? t('decisionSignals.reassessPersisting')
                  : t('decisionSignals.reassessPersist')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {persistedItem && reassessResponse?.warnings.length ? (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t('decisionSignals.reassessWarnings')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-secondary-text">
            {reassessResponse.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message || warning.code}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default ReassessPanel;
