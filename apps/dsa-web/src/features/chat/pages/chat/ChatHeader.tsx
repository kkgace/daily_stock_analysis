import React from 'react';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';
import { Badge, Button, InlineAlert, Tooltip } from '@/components/ui';
import type { AgentStatusResponse } from '@/api/agent';
import type { Message } from '@/features/chat/stores/agentChatStore';

type SendToast = {
  type: 'success' | 'error';
  message: string;
};

type ChatHeaderProps = {
  messages: Message[];
  agentStatus: AgentStatusResponse | null;
  sending: boolean;
  sendToast: SendToast | null;
  onOpenSidebar: () => void;
  onExportSession: () => void;
  onSendSession: () => void;
  onOpenAgentSettings: () => void;
  t: (key: UiTextKey, params?: UiTextParams) => string;
};

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  messages,
  agentStatus,
  sending,
  sendToast,
  onOpenSidebar,
  onExportSession,
  onSendSession,
  onOpenAgentSettings,
  t,
}) => (
  <header className="mb-4 flex-shrink-0 space-y-3">
    <div className="flex items-start justify-between gap-4">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-hover transition-colors text-secondary-text hover:text-foreground"
          aria-label="历史对话"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <svg
          className="w-6 h-6 text-cyan"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        问股
        {agentStatus ? (
          <Badge
            variant={agentStatus.backend === 'codex_app_server' ? 'warning' : 'history'}
            size="sm"
          >
            {t(agentStatus.backend === 'codex_app_server' ? 'chat.codexBackendBadge' : 'chat.defaultBackendBadge')}
          </Badge>
        ) : null}
      </h1>
      {messages.length > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <Tooltip content="导出会话为 Markdown 文件">
            <span className="inline-flex">
              <Button
                variant="action-primary"
                size="sm"
                onClick={onExportSession}
                aria-label="导出会话为 Markdown 文件"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                导出会话
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="发送到已配置的通知机器人/邮箱">
            <span className="inline-flex">
              <Button
                variant="action-primary"
                size="sm"
                disabled={sending}
                onClick={onSendSession}
                aria-label="发送到已配置的通知机器人/邮箱"
              >
                {sending ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
                发送
              </Button>
            </span>
          </Tooltip>
        </div>
      )}
    </div>
    <p className="text-secondary-text text-sm">
      {t(agentStatus?.backend === 'codex_app_server' ? 'chat.introCodex' : 'chat.introDefault')}
    </p>
    {agentStatus?.backend === 'codex_app_server' ? (
      <InlineAlert
        variant="warning"
        title={t('chat.codexLimitedTitle')}
        message={t('chat.codexLimitedMessage')}
        action={(
          <Button
            variant="action-primary"
            size="sm"
            onClick={onOpenAgentSettings}
          >
            {t('chat.codexChangeBackend')}
          </Button>
        )}
        className="rounded-xl px-3 py-2 text-xs shadow-none"
      />
    ) : null}
    {sendToast ? (
      <InlineAlert
        variant={sendToast.type === 'success' ? 'success' : 'danger'}
        title={sendToast.type === 'success' ? '发送成功' : '发送失败'}
        message={sendToast.message}
        className="max-w-md rounded-xl px-3 py-2 text-xs shadow-none"
      />
    ) : null}
  </header>
);
