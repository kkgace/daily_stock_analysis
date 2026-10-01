import React from 'react';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ApiErrorAlert, Button, InlineAlert } from '@/components/ui';
import type { ParsedApiError } from '@/api/error';
import type { SkillInfo } from '@/api/agent';

type ContextCompressionState = {
  enabled: boolean;
  loaded: boolean;
  saving: boolean;
  error: string | null;
};

type ChatComposerProps = {
  chatError: ParsedApiError | null;
  terminalStatus: string | null;
  stopError: boolean;
  agentUnavailableError: ParsedApiError | null;
  agentStatusError: string | null;
  agentStatusChecking: boolean;
  onRecheckAgentStatus: () => void;
  onOpenAgentSettings: () => void;
  isFollowUpContextLoading: boolean;
  contextCompression: ContextCompressionState;
  onToggleContextCompression: (enabled: boolean) => void;
  skills: SkillInfo[];
  selectedSkillIds: string[];
  selectedSkillSummary: string;
  skillLimitReached: boolean;
  mobileSkillPickerOpen: boolean;
  onToggleMobileSkillPicker: () => void;
  showSkillDesc: string | null;
  onShowSkillDesc: (skillId: string | null) => void;
  onClearSkills: () => void;
  onToggleSkill: (skillId: string) => void;
  activeStockCode: string | null;
  activeStockIsIndex: boolean;
  isWatchlistActioning: boolean;
  stockInWatchlist: (stockCode: string) => boolean;
  watchlistMessage: string | null;
  onToggleWatchlist: (stockCode: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  stockIndexLoading: boolean;
  agentAvailable: boolean;
  backend?: string;
  stopping: boolean;
  onStop: () => void;
  onSend: () => void;
  t: (key: UiTextKey, params?: UiTextParams) => string;
};

export const ChatComposer: React.FC<ChatComposerProps> = ({
  chatError,
  terminalStatus,
  stopError,
  agentUnavailableError,
  agentStatusError,
  agentStatusChecking,
  onRecheckAgentStatus,
  onOpenAgentSettings,
  isFollowUpContextLoading,
  contextCompression,
  onToggleContextCompression,
  skills,
  selectedSkillIds,
  selectedSkillSummary,
  skillLimitReached,
  mobileSkillPickerOpen,
  onToggleMobileSkillPicker,
  showSkillDesc,
  onShowSkillDesc,
  onClearSkills,
  onToggleSkill,
  activeStockCode,
  activeStockIsIndex,
  isWatchlistActioning,
  stockInWatchlist,
  watchlistMessage,
  onToggleWatchlist,
  input,
  onInputChange,
  onKeyDown,
  loading,
  stockIndexLoading,
  agentAvailable,
  backend,
  stopping,
  onStop,
  onSend,
  t,
}) => (
  <div className="border-t border-white/6 bg-card/88 p-4 md:p-6 relative z-20">
    <div className="space-y-3">
      {chatError ? <ApiErrorAlert error={chatError} /> : null}
      {terminalStatus === 'cancelled' ? (
        <div role="status" className="rounded-xl border border-slate-500/20 bg-slate-500/5 px-4 py-3 text-sm">
          {t('chat.analysisStopped')}
        </div>
      ) : null}
      {terminalStatus === 'timeout' ? (
        <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
          {t('chat.analysisTimedOut')}
        </div>
      ) : null}
      {stopError ? (
        <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
          {t('chat.stopRequestFailed')}
        </div>
      ) : null}
      {agentUnavailableError ? (
        <div className="space-y-2">
          <ApiErrorAlert
            error={agentUnavailableError}
            actionLabel={t('chat.openAgentSettings')}
            onAction={onOpenAgentSettings}
          />
          <Button variant="secondary" size="sm" onClick={onRecheckAgentStatus}>
            {t('chat.recheckAgentStatus')}
          </Button>
        </div>
      ) : null}
      {agentStatusError ? (
        <InlineAlert
          variant="warning"
          title={t('chat.statusUnavailableTitle')}
          message={t('chat.statusUnavailableMessage')}
          action={(
            <Button variant="secondary" size="sm" onClick={onRecheckAgentStatus}>
              {t('chat.recheckAgentStatus')}
            </Button>
          )}
          className="rounded-xl px-3 py-2 text-xs shadow-none"
        />
      ) : null}
      {agentStatusChecking ? (
        <InlineAlert
          variant="info"
          title={t('chat.statusCheckingTitle')}
          message={t('chat.statusCheckingMessage')}
          className="rounded-xl px-3 py-2 text-xs shadow-none"
        />
      ) : null}
      {isFollowUpContextLoading ? (
        <InlineAlert
          variant="info"
          title="追问上下文加载中"
          message="正在加载历史分析上下文；现在可直接发送追问。"
          className="rounded-xl px-3 py-2 text-xs shadow-none"
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-surface/25 px-3 py-2">
        <label
          className={cn(
            'inline-flex items-center gap-2 text-sm',
            contextCompression.loaded && !contextCompression.saving
              ? 'cursor-pointer text-foreground'
              : 'cursor-not-allowed text-muted-text',
          )}
        >
          <input
            type="checkbox"
            checked={contextCompression.enabled}
            disabled={!contextCompression.loaded || contextCompression.saving}
            onChange={(event) => onToggleContextCompression(event.target.checked)}
            className="chat-skill-checkbox"
          />
          <span className="font-medium">上下文压缩</span>
          <span className="text-xs text-muted-text">节省长会话 token</span>
        </label>
        <span className="text-xs text-muted-text">
          {contextCompression.saving
            ? '保存中...'
            : contextCompression.enabled
              ? '已启用'
              : '未启用'}
        </span>
      </div>
      {contextCompression.error ? (
        <InlineAlert
          variant="danger"
          title="上下文压缩设置未保存"
          message={contextCompression.error}
          className="rounded-xl px-3 py-2 text-xs shadow-none"
        />
      ) : null}
      {skills.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="home-surface-button flex h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-foreground md:hidden"
            aria-label={mobileSkillPickerOpen ? '收起策略选择' : '展开策略选择'}
            aria-expanded={mobileSkillPickerOpen}
            aria-controls="chat-skill-picker-panel"
            onClick={onToggleMobileSkillPicker}
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="flex-shrink-0 font-medium">策略</span>
              <span className="truncate text-xs text-muted-text">{selectedSkillSummary}</span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 flex-shrink-0 text-muted-text transition-transform',
                mobileSkillPickerOpen ? 'rotate-180' : '',
              )}
              aria-hidden="true"
            />
          </button>
          <div
            id="chat-skill-picker-panel"
            data-testid="chat-skill-picker-panel"
            className={cn(
              mobileSkillPickerOpen ? 'flex' : 'hidden',
              'max-h-40 flex-wrap items-start gap-x-5 gap-y-2 overflow-y-auto rounded-xl border border-white/6 bg-surface/25 px-3 py-2 md:flex md:max-h-none md:overflow-visible md:border-0 md:bg-transparent md:p-0',
            )}
          >
            <span className="text-xs text-muted-text font-medium uppercase tracking-wider flex-shrink-0 mt-1">
              策略
            </span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer group mt-0.5">
              <input
                type="checkbox"
                name="general-analysis"
                value=""
                checked={selectedSkillIds.length === 0}
                onChange={onClearSkills}
                className="chat-skill-checkbox"
              />
              <span
                className={`transition-colors text-sm ${selectedSkillIds.length === 0 ? 'text-foreground font-medium' : 'text-secondary-text group-hover:text-foreground'}`}
              >
                通用分析
              </span>
            </label>
            {skills.map((s) => {
              const checked = selectedSkillIds.includes(s.id);
              const disabled = !checked && skillLimitReached;
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-1.5 cursor-pointer group relative mt-0.5 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                  onMouseEnter={() => onShowSkillDesc(s.id)}
                  onMouseLeave={() => onShowSkillDesc(null)}
                >
                  <input
                    type="checkbox"
                    name="skills"
                    value={s.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggleSkill(s.id)}
                    className="chat-skill-checkbox"
                  />
                  <span
                    className={`transition-colors text-sm ${checked ? 'text-foreground font-medium' : 'text-secondary-text group-hover:text-foreground'}`}
                  >
                    {s.name}
                  </span>
                  {showSkillDesc === s.id && s.description && (
                    <div className="skill-desc-tooltip">
                      <p className="skill-title">{s.name}</p>
                      <p>{s.description}</p>
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

    {activeStockCode && !activeStockIsIndex && (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-text font-mono">{activeStockCode}</span>
        <Button
          variant="secondary"
          size="xsm"
          isLoading={isWatchlistActioning}
          onClick={() => onToggleWatchlist(activeStockCode)}
          className="text-[11px]"
        >
          {stockInWatchlist(activeStockCode) ? '从自选删除' : '加入自选'}
        </Button>
        {watchlistMessage && (
          <span className="text-[11px] text-secondary-text animate-in fade-in">{watchlistMessage}</span>
        )}
      </div>
    )}

      <div className="flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="例如：分析 600519 / 茅台现在适合买入吗？ (Enter 发送, Shift+Enter 换行)"
          disabled={loading || !agentAvailable}
          rows={1}
          className="input-surface input-focus-glow flex-1 min-h-[44px] max-h-[200px] rounded-xl border bg-transparent px-4 py-2.5 text-sm transition-all focus:outline-none resize-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
          }}
        />
        {loading && backend === 'codex_app_server' ? (
          <Button
            variant="danger-subtle"
            onClick={onStop}
            disabled={stopping}
            className="flex-shrink-0"
          >
            {stopping ? t('chat.stoppingAnalysis') : t('chat.stopAnalysis')}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={onSend}
            disabled={!input.trim() || loading || stockIndexLoading || !agentAvailable}
            isLoading={loading || stockIndexLoading}
            className="btn-primary flex-shrink-0"
          >
            发送
          </Button>
        )}
      </div>
    </div>
  </div>
);
