import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth, useDesktopUpdate, useSystemConfig } from '@/hooks';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { createParsedApiError, getParsedApiError, type ParsedApiError } from '@/api/error';
import { analysisApi } from '@/features/dashboard/api/analysis';
import { screeningApi, notifyScreeningConfigChanged, notifySystemConfigChanged } from '@/features/screening/api/screening';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import { ApiErrorAlert, Button, ConfirmDialog } from '@/components/ui';
import {
  AgentBackendStatusPanel,
  AuthSettingsCard,
  ChangePasswordCard,
  DataAnomalyStatusPanel,
  GenerationBackendStatusPanel,
  IntelligentImport,
  LLMChannelEditor,
  NotificationTestPanel,
  SettingsCategoryNav,
  SettingsAlert,
  SettingsLoading,
  SettingsPanelErrorBoundary,
  SettingsSectionCard,
} from '@/features/settings/components/settings';
import { parseStockListValue } from '@/utils/stockList';
import { getCategoryDescription, getCategoryTitle } from '@/features/settings/utils/systemConfigI18n';
import type { ConfigValidationIssue, SetupStatusResponse, SystemConfigCategory, SystemConfigUpdateItem } from '@/features/settings/types/systemConfig';
import { FirstRunSetupCard } from '@/features/settings/pages/settings/FirstRunSetupCard';
import { SchedulerSettingsCard } from '@/features/settings/pages/settings/SchedulerSettingsCard';
import { ConfigBackupCard } from '@/features/settings/pages/settings/ConfigBackupCard';
import { ScreeningSettingsCard } from '@/features/settings/pages/settings/ScreeningSettingsCard';
import { VersionInfoCard } from '@/features/settings/pages/settings/VersionInfoCard';
import { ActiveConfigPanel } from '@/features/settings/pages/settings/ActiveConfigPanel';
import {
  AGENT_BACKEND_STATUS_KEYS,
  formatEnvBackupFilename,
  getConfigItem,
  isPromptCacheAdvancedSetting,
  mergeGenerationBackendDraftItems,
  SCHEDULER_SETTING_KEYS,
} from '@/features/settings/pages/settings/settingsConfigKeys';

function parseSetupStockList(value: unknown) {
  return parseStockListValue(String(value ?? ''));
}

const SettingsPage: React.FC = () => {
  const { authEnabled, passwordChangeable } = useAuth();
  const location = useLocation();
  const { language: uiLanguage, t } = useUiLanguage();
  const [envBackupActionError, setEnvBackupActionError] = useState<ParsedApiError | null>(null);
  const [envBackupActionSuccess, setEnvBackupActionSuccess] = useState<string>('');
  const [screeningActionError, setScreeningActionError] = useState<ParsedApiError | null>(null);
  const [screeningActionSuccess, setScreeningActionSuccess] = useState<string>('');
  const [isExportingEnv, setIsExportingEnv] = useState(false);
  const [isImportingEnv, setIsImportingEnv] = useState(false);
  const [isUpdatingScreening, setIsUpdatingScreening] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [schedulerStatusRefreshToken, setSchedulerStatusRefreshToken] = useState(0);
  const [schedulerRuntimeEnabled, setSchedulerRuntimeEnabled] = useState<boolean | null>(null);
  const [schedulerOverrideFromUi, setSchedulerOverrideFromUi] = useState<boolean | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);
  const [isRefreshingSetupStatus, setIsRefreshingSetupStatus] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState<ParsedApiError | null>(null);
  const [isRunningSetupSmoke, setIsRunningSetupSmoke] = useState(false);
  const [setupSmokeError, setSetupSmokeError] = useState<ParsedApiError | null>(null);
  const [setupSmokeSuccess, setSetupSmokeSuccess] = useState('');
  const [llmChannelDraftItems, setLlmChannelDraftItems] = useState<SystemConfigUpdateItem[]>([]);
  const envBackupImportRef = useRef<HTMLInputElement | null>(null);
  const setupStatusRequestIdRef = useRef(0);
  const {
    isDesktopRuntime,
    canCheckDesktopUpdate,
    desktopAppVersion,
    isBusy: isDesktopUpdateBusy,
    isChecking: isCheckingDesktopUpdate,
    notice: desktopUpdateNotice,
    checkForUpdates: handleDesktopUpdateCheck,
    openReleasePage: openDesktopReleasePage,
    installDownloadedUpdate: installDesktopUpdate,
  } = useDesktopUpdate();

  // Set page title
  useEffect(() => {
    document.title = t('settings.pageTitleDocument');
  }, [t]);

  const {
    categories,
    itemsByCategory,
    issueByKey,
    activeCategory,
    setActiveCategory,
    hasDirty,
    dirtyCount,
    toast,
    clearToast,
    isLoading,
    isSaving,
    loadError,
    saveError,
    retryAction,
    load,
    retry,
    save,
    resetDraft,
    setDraftValue,
    getChangedItems,
    refreshAfterExternalSave,
    configVersion,
    maskToken,
    llmModelProviders,
  } = useSystemConfig();

  const currentChangedItems = getChangedItems();
  const currentChangedItemsFingerprint = JSON.stringify(currentChangedItems);
  const llmChannelDraftItemsFingerprint = JSON.stringify(llmChannelDraftItems);
  const generationBackendDraftItems = useMemo(
    () => mergeGenerationBackendDraftItems(currentChangedItems, llmChannelDraftItems),
    // Fingerprints keep the status panel from refreshing when parent renders do not change draft content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentChangedItemsFingerprint, llmChannelDraftItemsFingerprint],
  );
  const agentBackendDraftItems = useMemo(
    () => {
      const merged = new Map(
        generationBackendDraftItems.map((item) => [item.key.trim().toUpperCase(), item]),
      );
      for (const item of currentChangedItems) {
        const key = item.key.trim().toUpperCase();
        if (AGENT_BACKEND_STATUS_KEYS.has(key)) {
          merged.set(key, item);
        }
      }
      return Array.from(merged.values());
    },
    // The fingerprint changes only when the draft content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentChangedItemsFingerprint, generationBackendDraftItems],
  );
  const handleLlmChannelDraftItemsChange = useCallback((items: Array<{ key: string; value: string }>) => {
    setLlmChannelDraftItems(items);
  }, []);

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
    void load();
  }, [load]);

  useEffect(() => {
    const requestedCategory = new URLSearchParams(location.search).get('category');
    if (requestedCategory && categories.some((category) => category.category === requestedCategory)) {
      setActiveCategory(requestedCategory);
    }
  }, [categories, location.search, setActiveCategory]);

  useEffect(() => {
    if (isLoading || activeCategory !== 'system' || location.hash !== '#desktop-version-info') {
      return;
    }

    const node = document.getElementById('desktop-version-info');
    node?.scrollIntoView({ block: 'start' });
  }, [activeCategory, isLoading, location.hash]);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearToast();
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearToast, toast]);

  const rawActiveItems = itemsByCategory[activeCategory] || [];
  const rawActiveItemMap = new Map(rawActiveItems.map((item) => [item.key, String(item.value ?? '')]));
  const firstSetupStockCode = parseSetupStockList(getConfigItem(itemsByCategory.base || [], 'STOCK_LIST')?.value)[0] || '';
  const screeningItem = (itemsByCategory.base || []).find((item) => item.key === 'SCREENING_ENABLED');
  const screeningEnabled = String(screeningItem?.value ?? '').trim().toLowerCase() === 'true';
  const shouldShowFirstRunSetup = activeCategory === 'base';
  const shouldShowScreeningSettings = activeCategory === 'base' && Boolean(screeningItem);
  const hasConfiguredChannels = Boolean((rawActiveItemMap.get('LLM_CHANNELS') || '').trim());
  const hasLitellmConfig = Boolean((rawActiveItemMap.get('LITELLM_CONFIG') || '').trim());
  const hasRuntimeSchedulerMismatch =
    schedulerRuntimeEnabled !== null
    && schedulerOverrideFromUi !== null
    && schedulerOverrideFromUi !== schedulerRuntimeEnabled;
  const hasRuntimeSchedulerMismatchInDraft = hasRuntimeSchedulerMismatch
    && !currentChangedItems.some((item) => item.key === 'SCHEDULE_ENABLED');
  const effectiveHasDirty = hasDirty || hasRuntimeSchedulerMismatchInDraft;
  const effectiveDirtyCount = dirtyCount + (hasRuntimeSchedulerMismatchInDraft ? 1 : 0);

  const handleSchedulerRuntimeStateChange = useCallback(({ runtimeEnabled, overrideEnabled }: {
    runtimeEnabled: boolean | null;
    overrideEnabled: boolean | null;
  }) => {
    setSchedulerRuntimeEnabled(runtimeEnabled);
    setSchedulerOverrideFromUi(overrideEnabled);
  }, []);

  // UI rendering rule only: hide channel-managed and legacy provider-specific
  // LLM keys from generic fields when channel mode is active. This does not
  // alter save/refresh payloads or config migration/rollback behavior.
  const LLM_CHANNEL_KEY_RE = /^LLM_[A-Z0-9_]+_(PROTOCOL|API_SURFACE|BASE_URL|API_KEY|API_KEYS|MODELS|EXTRA_HEADERS|ENABLED)$/;
  const AI_MODEL_HIDDEN_KEYS = new Set([
    'LLM_CHANNELS',
    'LLM_TEMPERATURE',
    'LITELLM_MODEL',
    'AGENT_LITELLM_MODEL',
    'LITELLM_FALLBACK_MODELS',
    'AIHUBMIX_KEY',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_API_KEYS',
    'GEMINI_API_KEY',
    'GEMINI_API_KEYS',
    'GEMINI_MODEL',
    'GEMINI_MODEL_FALLBACK',
    'GEMINI_TEMPERATURE',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_API_KEYS',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_TEMPERATURE',
    'ANTHROPIC_MAX_TOKENS',
    'OPENAI_API_KEY',
    'OPENAI_API_KEYS',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'OPENAI_VISION_MODEL',
    'OPENAI_TEMPERATURE',
    'VISION_MODEL',
  ]);
  const SYSTEM_HIDDEN_KEYS = new Set([
    'ADMIN_AUTH_ENABLED',
    ...SCHEDULER_SETTING_KEYS,
  ]);
  const BASE_HIDDEN_KEYS = new Set([
    'SCREENING_ENABLED',
  ]);
  const AGENT_HIDDEN_KEYS = new Set(['AGENT_GENERATION_BACKEND']);
  const activeItems =
    activeCategory === 'base'
      ? rawActiveItems.filter((item) => !BASE_HIDDEN_KEYS.has(item.key))
    : activeCategory === 'ai_model'
      ? rawActiveItems.filter((item) => {
        if (hasConfiguredChannels && LLM_CHANNEL_KEY_RE.test(item.key)) {
          return false;
        }
        if (hasConfiguredChannels && !hasLitellmConfig && AI_MODEL_HIDDEN_KEYS.has(item.key)) {
          return false;
        }
        return true;
      })
      : activeCategory === 'system'
        ? rawActiveItems.filter((item) => !SYSTEM_HIDDEN_KEYS.has(item.key))
      : activeCategory === 'agent'
        ? rawActiveItems.filter((item) => !AGENT_HIDDEN_KEYS.has(item.key))
      : rawActiveItems;
  const promptCacheAdvancedItems = activeCategory === 'ai_model'
    ? activeItems.filter(isPromptCacheAdvancedSetting)
    : [];
  const visibleActiveItems = activeCategory === 'ai_model'
    ? activeItems.filter((item) => !isPromptCacheAdvancedSetting(item))
    : activeItems;
  const hasActiveConfigItems = visibleActiveItems.length > 0 || promptCacheAdvancedItems.length > 0;
  const isEnvBackupAllowed = isDesktopRuntime || authEnabled;
  const envBackupActionDisabled = isLoading || isSaving || isExportingEnv || isImportingEnv || !isEnvBackupAllowed;

  const downloadEnvBackup = async () => {
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
  };

  const beginEnvBackupImport = () => {
    setEnvBackupActionError(null);
    setEnvBackupActionSuccess('');
    if (hasDirty) {
      setShowImportConfirm(true);
      return;
    }
    envBackupImportRef.current?.click();
  };

  const handleEnvBackupImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
        setSchedulerStatusRefreshToken((current) => current + 1);
      }
      notifySystemConfigChanged();
      void refreshSetupStatus();
      setEnvBackupActionSuccess(t('settings.envImported'));
    } catch (error: unknown) {
      setEnvBackupActionError(getParsedApiError(error));
    } finally {
      setIsImportingEnv(false);
    }
  };

  const updateScreeningEnabled = async (nextEnabled: boolean) => {
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
  };

  const handleSaveConfig = async () => {
    const changedItems = getChangedItems();
    const syncRuntimeSchedulerState =
      schedulerOverrideFromUi !== null
      && schedulerRuntimeEnabled !== null
      && schedulerOverrideFromUi !== schedulerRuntimeEnabled
      && !changedItems.some((item) => item.key === 'SCHEDULE_ENABLED');
    const schedulerSyncItem: SystemConfigUpdateItem[] = syncRuntimeSchedulerState
      ? [{ key: 'SCHEDULE_ENABLED', value: schedulerOverrideFromUi ? 'true' : 'false' }]
      : [];
    const changedItemsToSave = [...changedItems, ...schedulerSyncItem];
    const changedScreeningItem = changedItems.find((item) => item.key === 'SCREENING_ENABLED');
    const changedSchedulerSettings = changedItemsToSave.some((item) => SCHEDULER_SETTING_KEYS.has(item.key));
    const result = await save(changedItemsToSave);
    if (!result.success) {
      return;
    }
    notifySystemConfigChanged();
    if (changedSchedulerSettings) {
      setSchedulerStatusRefreshToken((current) => current + 1);
    }
    void refreshSetupStatus();
    if (!changedScreeningItem) {
      return;
    }

    setScreeningActionError(null);
    setScreeningActionSuccess('');
    try {
      const isScreeningEnabled = changedScreeningItem.value.trim().toLowerCase() === 'true';
      if (isScreeningEnabled) {
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
  };

  const handleRunSetupSmoke = async () => {
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

    if (!firstSetupStockCode) {
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
        stockCode: firstSetupStockCode,
        reportType: 'brief',
        asyncMode: true,
        notify: false,
        originalQuery: firstSetupStockCode,
        selectionSource: 'manual',
      });
      const taskId = 'taskId' in result ? result.taskId : result.accepted?.[0]?.taskId;
      setSetupSmokeSuccess(
        taskId
          ? t('settings.setupGuideSmokeAcceptedWithTask', { stock: firstSetupStockCode, taskId })
          : t('settings.setupGuideSmokeAccepted', { stock: firstSetupStockCode }),
      );
      void refreshSetupStatus();
    } catch (error: unknown) {
      setSetupSmokeError(getParsedApiError(error));
    } finally {
      setIsRunningSetupSmoke(false);
    }
  };

  const shouldGuardActiveConfigPanel = activeCategory === 'notification' || activeCategory === 'agent';
  const activeConfigPanelErrorTitle = activeCategory === 'agent' ? t('settings.agentSettings') : t('settings.notificationSettings');
  const settingsPanelDiagnosticHint = isDesktopRuntime
    ? uiLanguage === 'en'
      ? <>Check and provide the desktop log <code>desktop.log</code>, plus the release version, Windows version, and trigger path.</>
      : <>请查看并提供桌面端日志 <code>desktop.log</code>，同时补充 release 版本、Windows 版本和触发入口。</>
    : t('settings.diagnosticHintWeb');
  const activeCategoryTitle = getCategoryTitle(activeCategory as SystemConfigCategory, t('settings.activePanelTitle'), uiLanguage);
  const activeCategoryDescription = getCategoryDescription(activeCategory as SystemConfigCategory, '', uiLanguage);
  const selectedAgentBackend = (rawActiveItemMap.get('AGENT_BACKEND') || 'auto').trim().toLowerCase();
  const selectedAgentArch = (rawActiveItemMap.get('AGENT_ARCH') || 'single').trim().toLowerCase();
  const hasCodexArchitectureConflict = selectedAgentBackend === 'codex_app_server' && selectedAgentArch !== 'single';
  const codexArchitectureIssue: ConfigValidationIssue = {
    key: 'AGENT_ARCH',
    code: 'unsupported_agent_arch',
    message: t('settings.agentBackendSingleOnly'),
    severity: 'error',
    expected: 'single',
    actual: selectedAgentArch,
  };
  const activeConfigPanel = (
    <ActiveConfigPanel
      title={activeCategoryTitle}
      description={activeCategoryDescription}
      visibleItems={visibleActiveItems}
      promptCacheAdvancedItems={promptCacheAdvancedItems}
      isSaving={isSaving}
      issueByKey={issueByKey}
      hasCodexArchitectureConflict={hasCodexArchitectureConflict}
      codexArchitectureIssue={codexArchitectureIssue}
      onChange={setDraftValue}
      t={t}
    />
  );

  return (
    <div className="settings-page min-h-full px-4 pb-6 pt-4 md:px-6">
      <div className="mb-4 rounded-lg border settings-border bg-card/90 px-4 py-4 shadow-soft-card backdrop-blur-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('settings.pageTitle')}</h1>
            <p className="max-w-3xl text-xs leading-5 text-muted-text sm:text-sm sm:leading-6">
              {t('settings.pageDescription')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="settings-secondary"
              size="sm"
              className="px-2.5"
              onClick={resetDraft}
              disabled={isLoading || isSaving}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('settings.reset')}
            </Button>
            <Button
              type="button"
              variant="settings-primary"
              size="sm"
              className="px-2.5"
              onClick={() => void handleSaveConfig()}
              disabled={!effectiveHasDirty || isSaving || isLoading}
              isLoading={isSaving}
              loadingText={t('settings.saving')}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {isSaving
                ? t('settings.saving')
                : effectiveDirtyCount
                  ? t('settings.saveConfigWithCount', { count: effectiveDirtyCount })
                  : t('settings.saveConfig')}
            </Button>
          </div>
        </div>

        {saveError ? (
          <ApiErrorAlert
            className="mt-3"
            error={saveError}
            actionLabel={retryAction === 'save' ? t('settings.saveRetry') : undefined}
            onAction={retryAction === 'save' ? () => void retry() : undefined}
          />
        ) : null}
      </div>

      {loadError ? (
        <ApiErrorAlert
          error={loadError}
          actionLabel={retryAction === 'load' ? t('common.retry') : t('settings.reload')}
          onAction={() => void retry()}
          className="mb-4"
        />
      ) : null}

      {isLoading ? (
        <SettingsLoading />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SettingsCategoryNav
              categories={categories}
              itemsByCategory={itemsByCategory}
              activeCategory={activeCategory}
              onSelect={setActiveCategory}
            />
          </aside>

          <section className="space-y-4">
            {shouldShowFirstRunSetup ? (
              <FirstRunSetupCard
                status={setupStatus}
                isLoading={isRefreshingSetupStatus}
                error={setupStatusError}
                firstStockCode={firstSetupStockCode}
                isSaving={isSaving}
                isRunningSmoke={isRunningSetupSmoke}
                smokeError={setupSmokeError}
                smokeSuccess={setupSmokeSuccess}
                onRefresh={refreshSetupStatus}
                onSelectCategory={setActiveCategory}
                onRunSmoke={handleRunSetupSmoke}
                listSeparator={uiLanguage === 'en' ? ', ' : '、'}
                t={t}
              />
            ) : null}
            {shouldShowScreeningSettings ? (
              <ScreeningSettingsCard
                screeningEnabled={screeningEnabled}
                disabled={isSaving || isLoading || isUpdatingScreening}
                isUpdating={isUpdatingScreening}
                actionError={screeningActionError}
                actionSuccess={screeningActionSuccess}
                onToggle={async (next) => { await updateScreeningEnabled(next); }}
                t={t}
              />
            ) : null}
            {activeCategory === 'system' ? <AuthSettingsCard /> : null}
            {activeCategory === 'system' ? (
              <SchedulerSettingsCard
                items={rawActiveItems}
                disabled={isSaving || isLoading}
                issueByKey={issueByKey}
                statusRefreshToken={schedulerStatusRefreshToken}
                onSchedulerStateChange={handleSchedulerRuntimeStateChange}
                onChange={setDraftValue}
                t={t}
                language={uiLanguage}
              />
            ) : null}
            {activeCategory === 'system' ? (
              <VersionInfoCard
                desktopAppVersion={desktopAppVersion}
                canCheckDesktopUpdate={canCheckDesktopUpdate}
                isDesktopUpdateBusy={isDesktopUpdateBusy}
                isCheckingDesktopUpdate={isCheckingDesktopUpdate}
                desktopUpdateNotice={desktopUpdateNotice}
                onCheckDesktopUpdate={handleDesktopUpdateCheck}
                onInstallDesktopUpdate={installDesktopUpdate}
                onOpenDesktopReleasePage={openDesktopReleasePage}
                t={t}
              />
            ) : null}
            {activeCategory === 'system' ? (
              <ConfigBackupCard
                isEnvBackupAllowed={isEnvBackupAllowed}
                envBackupActionDisabled={envBackupActionDisabled}
                isExportingEnv={isExportingEnv}
                isImportingEnv={isImportingEnv}
                actionError={envBackupActionError}
                actionSuccess={envBackupActionSuccess}
                importInputRef={envBackupImportRef}
                onExport={downloadEnvBackup}
                onBeginImport={beginEnvBackupImport}
                onImportFile={handleEnvBackupImportFile}
                onReloadAfterVersionConflict={async () => { await load(); }}
                t={t}
              />
            ) : null}
            {activeCategory === 'base' ? (
              <SettingsSectionCard
                title={t('settings.intelligentImport')}
                description={t('settings.intelligentImportDescription')}
              >
                <IntelligentImport
                  stockListValue={
                    (activeItems.find((i) => i.key === 'STOCK_LIST')?.value as string) ?? ''
                  }
                  configVersion={configVersion}
                  maskToken={maskToken}
                  onMerged={async () => {
                    await refreshAfterExternalSave(['STOCK_LIST']);
                    void refreshSetupStatus();
                  }}
                  disabled={isSaving || isLoading}
                />
              </SettingsSectionCard>
            ) : null}
            {activeCategory === 'data_source' ? (
              <SettingsPanelErrorBoundary
                title={t('settings.dataAnomalyPanelTitle')}
                resetKey={`data-anomalies:${configVersion}`}
                diagnosticHint={settingsPanelDiagnosticHint}
              >
                <SettingsSectionCard
                  title={t('settings.dataAnomalySectionTitle')}
                  description={t('settings.dataAnomalySectionDescription')}
                >
                  <DataAnomalyStatusPanel disabled={isSaving || isLoading} />
                </SettingsSectionCard>
              </SettingsPanelErrorBoundary>
            ) : null}
            {activeCategory === 'ai_model' ? (
              <SettingsSectionCard
                title={t('settings.llmAccess')}
                description={t('settings.llmAccessDescription')}
              >
                <GenerationBackendStatusPanel
                  items={generationBackendDraftItems}
                  maskToken={maskToken}
                  disabled={isSaving || isLoading}
                />
                <LLMChannelEditor
                  items={rawActiveItems}
                  configVersion={configVersion}
                  maskToken={maskToken}
                  modelProviderPrefixes={llmModelProviders}
                  onDraftItemsChange={handleLlmChannelDraftItemsChange}
                  onSaved={async (updatedItems) => {
                    setLlmChannelDraftItems([]);
                    await refreshAfterExternalSave(updatedItems.map((item) => item.key));
                    void refreshSetupStatus();
                  }}
                  disabled={isSaving || isLoading}
                />
              </SettingsSectionCard>
            ) : null}
            {activeCategory === 'system' && passwordChangeable ? (
              <ChangePasswordCard />
            ) : null}
            {activeCategory === 'notification' ? (
              <SettingsPanelErrorBoundary
                title={t('settings.notificationTest')}
                resetKey={`notification-test:${configVersion}`}
                diagnosticHint={settingsPanelDiagnosticHint}
              >
                <NotificationTestPanel
                  items={rawActiveItems.map((item) => ({ key: item.key, value: String(item.value ?? '') }))}
                  maskToken={maskToken}
                  disabled={isSaving || isLoading}
                />
              </SettingsPanelErrorBoundary>
            ) : null}
            {activeCategory === 'agent' ? (
              <SettingsPanelErrorBoundary
                title={t('settings.agentBackendStatus')}
                resetKey={`agent-backend:${configVersion}`}
                diagnosticHint={settingsPanelDiagnosticHint}
              >
                <SettingsSectionCard
                  title={t('settings.agentBackendSectionTitle')}
                  description={t('settings.agentBackendSectionDescription')}
                >
                  <AgentBackendStatusPanel
                    items={agentBackendDraftItems}
                    maskToken={maskToken}
                    selectedBackend={selectedAgentBackend}
                    agentArch={selectedAgentArch}
                    disabled={isSaving || isLoading}
                    onUseSingleAgent={() => setDraftValue('AGENT_ARCH', 'single')}
                    onEnableAgentMode={() => setDraftValue('AGENT_MODE', 'true')}
                  />
                </SettingsSectionCard>
              </SettingsPanelErrorBoundary>
            ) : null}
            {shouldGuardActiveConfigPanel && hasActiveConfigItems ? (
              <SettingsPanelErrorBoundary
                title={activeConfigPanelErrorTitle}
                resetKey={`${activeCategory}:${configVersion}`}
                diagnosticHint={settingsPanelDiagnosticHint}
              >
                {activeConfigPanel}
              </SettingsPanelErrorBoundary>
            ) : activeConfigPanel}
          </section>
        </div>
      )}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 w-[320px] max-w-[calc(100vw-24px)]">
          {toast.type === 'success'
            ? (
                <SettingsAlert
                  title={t('settings.actionSuccess')}
                  message={toast.message}
                  variant="success"
                  presentation="toast"
                />
              )
            : <ApiErrorAlert error={toast.error} />}
        </div>
      ) : null}
      <ConfirmDialog
        isOpen={showImportConfirm}
        title={t('settings.importConfirmTitle')}
        message={t('settings.importConfirmMessage')}
        confirmText={t('settings.importConfirmContinue')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          setShowImportConfirm(false);
          envBackupImportRef.current?.click();
        }}
        onCancel={() => {
          setShowImportConfirm(false);
        }}
      />
    </div>
  );
};

export default SettingsPage;
