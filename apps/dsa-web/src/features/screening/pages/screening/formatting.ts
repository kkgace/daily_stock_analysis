import type { ScreeningCandidate, ScreeningStrategy } from '@/features/screening/api/screening';

export const MARKETS = [{ id: 'cn', label: 'A 股' }];

export const STRATEGY_CATEGORY_LABELS: Record<string, string> = {
  framework: '综合',
  income: '收益',
  momentum: '动量',
  quality: '质量',
  reversal: '反转',
  trend: '趋势',
  value: '价值',
};

export const formatStrategyCategory = (value?: string) => {
  const normalized = value?.trim();
  if (!normalized) {
    return '自定义';
  }
  return STRATEGY_CATEGORY_LABELS[normalized.toLowerCase()] || normalized;
};

export const formatRunCreatedAt = (value: string | null | undefined) => {
  if (!value) {
    return '时间未知';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// 历史条目里展示筛选条件：策略 ID → 中文名（找不到时回退到原始 ID）
export const formatHistoryStrategyName = (strategyId: string, strategies: ScreeningStrategy[]): string => {
  const matched = strategies.find((item) => item.id === strategyId);
  return matched?.name || matched?.title || strategyId || '未知策略';
};

// 历史条目里展示筛选条件：市场 ID → 中文标签
export const formatHistoryMarketLabel = (marketId: string | null | undefined): string =>
  MARKETS.find((item) => item.id === marketId)?.label || marketId || 'cn';

export const formatScore = (score: ScreeningCandidate['score']) => {
  if (score == null || Number.isNaN(Number(score))) {
    return '-';
  }
  return Number(score).toFixed(2);
};

export const formatNumber = (value: unknown, digits = 2) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toFixed(digits);
};

export const formatAmount = (value: unknown) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  const amount = Number(value);
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(2)} 亿`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${(amount / 10_000).toFixed(2)} 万`;
  }
  return amount.toFixed(2);
};

export const formatPercent = (value: unknown) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '-';
  }
  return `${(Number(value) * 100).toFixed(0)}%`;
};

export const MAX_MESSAGE_DETAIL_LENGTH = 96;

export const truncateMessageDetail = (value: string, maxLength = MAX_MESSAGE_DETAIL_LENGTH) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
};
