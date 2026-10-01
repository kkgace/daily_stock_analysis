import React from 'react';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';
import type { RefObject } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/utils/cn';
import { Badge, EmptyState, ScrollArea } from '@/components/ui';
import type { Message, ProgressStep } from '@/features/chat/stores/agentChatStore';
import { getMessageSkillLabel, getCurrentStage } from './messageFormat';
import { ThinkingToggle, ThinkingDetails } from './ThinkingSection';
import type { QuickQuestion } from './types';

type MessageListProps = {
  messages: Message[];
  loading: boolean;
  progressSteps: ProgressStep[];
  backend?: string;
  agentAvailable: boolean;
  stockIndexLoading: boolean;
  quickQuestions: QuickQuestion[];
  onQuickQuestion: (question: QuickQuestion) => void;
  expandedThinking: Set<string>;
  onToggleThinking: (msgId: string) => void;
  copiedMessages: Set<string>;
  onCopyMessage: (msgId: string, content: string) => void;
  onDownloadMessage: (msg: Message) => void;
  copyLabel: string;
  copiedLabel: string;
  viewportRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showJumpToBottom: boolean;
  onJumpToBottom: () => void;
  t: (key: UiTextKey, params?: UiTextParams) => string;
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  progressSteps,
  backend,
  agentAvailable,
  stockIndexLoading,
  quickQuestions,
  onQuickQuestion,
  expandedThinking,
  onToggleThinking,
  copiedMessages,
  onCopyMessage,
  onDownloadMessage,
  copyLabel,
  copiedLabel,
  viewportRef,
  endRef,
  onScroll,
  showJumpToBottom,
  onJumpToBottom,
  t,
}) => (
  <>
    <ScrollArea
      className="relative z-10 flex-1"
      viewportRef={viewportRef}
      onScroll={onScroll}
      viewportClassName="space-y-6 p-4 md:p-6"
      testId="chat-message-scroll"
    >
      {messages.length === 0 && !loading ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            title="开始问股"
            description={t(
              backend === 'codex_app_server'
                ? 'chat.emptyDescriptionCodex'
                : 'chat.emptyDescriptionDefault',
            )}
            className="max-w-2xl border-dashed bg-card/55"
            icon={(
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            )}
            action={(
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onQuickQuestion(q)}
                    disabled={!agentAvailable || stockIndexLoading}
                    className="quick-question-btn disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          />
        </div>
      ) : (
        messages.map((msg) => {
          const skillLabel = getMessageSkillLabel(msg);
          return (
          <div
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-sm transition-all',
                msg.role === 'user' ? 'chat-avatar-user' : 'chat-avatar-ai'
              )}
            >
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <div
              className={cn(
                'group/message min-w-0 w-fit max-w-[min(100%,48rem)] overflow-hidden px-5 py-3.5 transition-colors',
                msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
              )}
            >
              {msg.role === 'assistant' && (skillLabel || msg.backend) && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {skillLabel ? <Badge variant="info" className="chat-skill-badge shadow-none" aria-label={`技能 ${skillLabel}`}>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    {skillLabel}
                  </Badge> : null}
                  {msg.backend ? (
                    <Badge variant={msg.backend === 'codex_app_server' ? 'warning' : 'history'} size="sm">
                      {t(msg.backend === 'codex_app_server' ? 'chat.codexBackendBadge' : 'chat.defaultBackendBadge')}
                    </Badge>
                  ) : null}
                </div>
              )}
              {msg.role === 'assistant' && (
                <ThinkingToggle
                  msg={msg}
                  isExpanded={expandedThinking.has(msg.id)}
                  onToggle={onToggleThinking}
                />
              )}
              {msg.role === 'assistant' &&
                expandedThinking.has(msg.id) &&
                msg.thinkingSteps &&
                <ThinkingDetails steps={msg.thinkingSteps} />}
              {msg.role === 'assistant' ? (
                <div className="relative">
                  <div className="chat-message-actions">
                    <button
                      type="button"
                      onClick={() => onCopyMessage(msg.id, msg.content)}
                      className="chat-copy-btn"
                      aria-label={copiedMessages.has(msg.id) ? copiedLabel : copyLabel}
                    >
                      {copiedMessages.has(msg.id) ? copiedLabel : copyLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadMessage(msg)}
                      className="chat-copy-btn"
                      aria-label="导出此条消息为 Markdown"
                    >
                      导出
                    </button>
                  </div>
                  <div className="chat-prose pr-20 sm:pr-24">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </Markdown>
                  </div>
                </div>
              ) : (
                msg.content
                  .split('\n')
                  .map((line, i) => (
                    <p
                      key={i}
                      className="mb-1 last:mb-0 leading-relaxed"
                    >
                      {line || ' '}
                    </p>
                  ))
              )}
            </div>
          </div>
          );
        })
      )}

      {loading && (
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-elevated text-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">
            AI
          </div>
          <div className="min-w-[200px] max-w-[min(100%,48rem)] overflow-hidden rounded-2xl rounded-tl-sm border border-white/6 bg-card/72 px-5 py-4">
            <div className="flex items-center gap-2.5 text-sm text-secondary-text">
              <div className="relative w-4 h-4 flex-shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-cyan/20" />
                <div className="absolute inset-0 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
              </div>
              <span className="text-secondary-text">
                {getCurrentStage(progressSteps)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </ScrollArea>

    {showJumpToBottom && (
      <div className="pointer-events-none absolute bottom-[5.75rem] right-4 z-20 md:bottom-24 md:right-6">
        <button
          type="button"
          className="pointer-events-auto chat-copy-btn shadow-soft-card"
          onClick={onJumpToBottom}
          aria-label="查看最新消息"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
          有新消息
        </button>
      </div>
    )}
  </>
);
