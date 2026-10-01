import React from 'react';
import { cn } from '@/utils/cn';
import type { Message, ProgressStep } from '@/features/chat/stores/agentChatStore';
import {
  getPipelineBudgetSkippedLabel,
  getStageDoneLabel,
  isStageDoneSuccessful,
} from './messageFormat';

type ThinkingToggleProps = {
  msg: Message;
  isExpanded: boolean;
  onToggle: (msgId: string) => void;
};

export const ThinkingToggle: React.FC<ThinkingToggleProps> = ({ msg, isExpanded, onToggle }) => {
  if (!msg.thinkingSteps || msg.thinkingSteps.length === 0) return null;
  const toolSteps = msg.thinkingSteps.filter((s) => s.type === 'tool_done');
  const totalDuration = toolSteps.reduce(
    (sum, s) => sum + (s.duration || 0),
    0,
  );
  const summary = `${toolSteps.length} 个工具调用 · ${totalDuration.toFixed(1)}s`;

  return (
    <button
      onClick={() => onToggle(msg.id)}
      className="flex items-center gap-2 text-xs text-muted-text hover:text-secondary-text transition-colors mb-2 w-full text-left"
    >
      <svg
        className={`w-3 h-3 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
      <span className="flex items-center gap-1.5">
        <span className="opacity-60">思考过程</span>
        <span className="text-muted-text/50">·</span>
        <span className="opacity-50">{summary}</span>
      </span>
    </button>
  );
};

export const ThinkingDetails: React.FC<{ steps: ProgressStep[] }> = ({ steps }) => (
  <div className="mb-3 pl-5 border-l border-border/40 space-y-1.5 animate-fade-in">
    {steps.map((step, idx) => {
      let statusClass = 'chat-progress-item-muted';
      let iconClass = 'chat-progress-dot-muted';
      let text = '';
      if (step.type === 'thinking') {
        text = step.message || `第 ${step.step} 步：思考`;
        statusClass = 'chat-progress-item-thinking';
        iconClass = 'chat-progress-dot-thinking';
      } else if (step.type === 'tool_start') {
        text = `${step.display_name || step.tool}...`;
        statusClass = 'chat-progress-item-tool';
        iconClass = 'chat-progress-dot-tool';
      } else if (step.type === 'tool_done') {
        text = `${step.display_name || step.tool} (${step.duration}s)`;
        statusClass = step.success ? 'chat-progress-item-success' : 'chat-progress-item-danger';
        iconClass = step.success ? 'chat-progress-dot-success' : 'chat-progress-dot-danger';
      } else if (step.type === 'stage_start') {
        text = step.message || `Starting ${step.stage || 'stage'}...`;
        statusClass = 'chat-progress-item-thinking';
        iconClass = 'chat-progress-dot-thinking';
      } else if (step.type === 'stage_done') {
        const isSuccess = isStageDoneSuccessful(step.status);
        text = getStageDoneLabel(step);
        statusClass = isSuccess ? 'chat-progress-item-success' : 'chat-progress-item-danger';
        iconClass = isSuccess ? 'chat-progress-dot-success' : 'chat-progress-dot-danger';
      } else if (step.type === 'pipeline_timeout') {
        text = step.message || `${step.stage || 'pipeline'} timed out`;
        statusClass = 'chat-progress-item-danger';
        iconClass = 'chat-progress-dot-danger';
      } else if (step.type === 'pipeline_budget_skipped') {
        text = getPipelineBudgetSkippedLabel(step);
        statusClass = 'chat-progress-item-muted';
        iconClass = 'chat-progress-dot-muted';
      } else if (step.type === 'generating') {
        text = step.message || '生成分析';
        statusClass = 'chat-progress-item-generating';
        iconClass = 'chat-progress-dot-generating';
      } else {
        text = step.message || step.type;
      }
      return (
        <div
          key={idx}
          className={cn('chat-progress-item', statusClass)}
        >
          <span className={cn('chat-progress-dot', iconClass)} />
          <span className="leading-relaxed">{text}</span>
        </div>
      );
    })}
  </div>
);
