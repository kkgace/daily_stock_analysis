import type React from 'react';
import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { SettingsField, SettingsSectionCard } from '@/features/settings/components/settings';
import type {
  ConfigValidationIssue,
  SystemConfigItem,
} from '@/features/settings/types/systemConfig';
import type { SettingsTranslate } from './settingsConfigKeys';

type ActiveConfigPanelProps = {
  title: string;
  description: string;
  visibleItems: SystemConfigItem[];
  promptCacheAdvancedItems: SystemConfigItem[];
  isSaving: boolean;
  issueByKey: Record<string, ConfigValidationIssue[]>;
  hasCodexArchitectureConflict: boolean;
  codexArchitectureIssue: ConfigValidationIssue;
  onChange: (key: string, value: string) => void;
  t: SettingsTranslate;
};

export const ActiveConfigPanel: React.FC<ActiveConfigPanelProps> = ({
  title,
  description,
  visibleItems,
  promptCacheAdvancedItems,
  isSaving,
  issueByKey,
  hasCodexArchitectureConflict,
  codexArchitectureIssue,
  onChange,
  t,
}) => {
  const hasActiveConfigItems = visibleItems.length > 0 || promptCacheAdvancedItems.length > 0;
  const fallbackDescription = useMemo(
    () => description || t('settings.activePanelDescription'),
    [description, t],
  );

  if (!hasActiveConfigItems) {
    return (
      <EmptyState
        title={t('settings.currentCategoryEmptyTitle')}
        description={t('settings.currentCategoryEmptyDescription')}
        className="settings-surface-panel settings-border-strong border-none bg-transparent shadow-none"
      />
    );
  }

  return (
    <SettingsSectionCard
      title={title}
      description={fallbackDescription}
    >
      {visibleItems.length ? (
        <div className="divide-y divide-[var(--settings-border-soft)] overflow-hidden rounded-lg border border-[var(--settings-border)] bg-[var(--settings-surface)]">
          {visibleItems.map((item) => {
            const fieldIssues = item.key === 'AGENT_ARCH' && hasCodexArchitectureConflict
              ? [...(issueByKey[item.key] || []), codexArchitectureIssue]
              : issueByKey[item.key] || [];
            return (
              <SettingsField
                key={item.key}
                item={item}
                value={item.value}
                disabled={isSaving}
                onChange={onChange}
                issues={fieldIssues}
              />
            );
          })}
        </div>
      ) : null}
      {promptCacheAdvancedItems.length ? (
        <details className="group/prompt-cache overflow-hidden rounded-lg border border-[var(--settings-border)] bg-[var(--settings-surface)] transition-colors duration-200 hover:bg-[var(--settings-surface-hover)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {t('settings.promptCacheAdvancedTitle')}
              </p>
              <p className="text-xs leading-5 text-muted-text">
                {t('settings.promptCacheAdvancedDescription')}
              </p>
            </div>
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-text transition-transform group-open/prompt-cache:rotate-180" aria-hidden="true" />
          </summary>
          <div className="divide-y divide-[var(--settings-border-soft)] border-t border-[var(--settings-border-soft)]">
            {promptCacheAdvancedItems.map((item) => (
              <SettingsField
                key={item.key}
                item={item}
                value={item.value}
                disabled={isSaving}
                onChange={onChange}
                issues={issueByKey[item.key] || []}
              />
            ))}
          </div>
        </details>
      ) : null}
    </SettingsSectionCard>
  );
};
