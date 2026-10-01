import type { Message, ProgressStep } from '@/features/chat/stores/agentChatStore';

export const getMessageSkillNames = (msg: Message): string[] => {
  if (msg.skillNames?.length) return msg.skillNames;
  if (msg.skillName) return [msg.skillName];
  if (msg.skills?.length) return msg.skills;
  if (msg.skill) return [msg.skill];
  return [];
};

export const getMessageSkillLabel = (msg: Message): string => getMessageSkillNames(msg).join('、');

export const isStageDoneSuccessful = (status?: string): boolean => {
  if (!status) return true;
  const normalized = status.trim().toLowerCase();
  return ['completed', 'success', 'succeeded', 'done'].includes(normalized);
};

export const getStageDoneLabel = (step: ProgressStep): string => {
  const stage = step.stage || 'stage';
  if (step.message) return step.message;
  if (isStageDoneSuccessful(step.status)) return `${stage} completed`;
  return `${stage} ${step.status || 'finished'}`;
};

export const getPipelineBudgetSkippedLabel = (step: ProgressStep): string => {
  if (step.message) return step.message;
  return `${stageLabel(step)} skipped: insufficient budget`;
};

const stageLabel = (step: ProgressStep): string => step.stage || 'pipeline';

export const getCurrentStage = (steps: ProgressStep[]): string => {
  if (steps.length === 0) return '正在连接...';
  const last = steps[steps.length - 1];
  if (last.type === 'thinking') return last.message || 'AI 正在思考...';
  if (last.type === 'tool_start')
    return `${last.display_name || last.tool}...`;
  if (last.type === 'tool_done')
    return `${last.display_name || last.tool} 完成`;
  if (last.type === 'stage_start')
    return last.message || `Starting ${last.stage || 'stage'}...`;
  if (last.type === 'stage_done')
    return getStageDoneLabel(last);
  if (last.type === 'pipeline_timeout')
    return last.message || `${last.stage || 'pipeline'} timed out`;
  if (last.type === 'pipeline_budget_skipped')
    return getPipelineBudgetSkippedLabel(last);
  if (last.type === 'generating')
    return last.message || '正在生成最终分析...';
  return '处理中...';
};
