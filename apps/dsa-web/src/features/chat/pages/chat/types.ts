import type { ChatFollowUpContext } from '@/features/chat/utils/chatFollowUp';

// Stock context currently attached to the chat workspace.
export type ActiveStockContext = Pick<ChatFollowUpContext, 'stock_code' | 'stock_name'>;

export type ActiveStockResolution = {
  context: ActiveStockContext;
  useForCurrentSend: boolean;
};

// Quick question examples shown on empty state
export type QuickQuestion = {
  label: string;
  skill: string;
  stockContext?: ActiveStockContext;
};

export const QUICK_QUESTIONS: QuickQuestion[] = [
  { label: '用缠论分析茅台', skill: 'chan_theory', stockContext: { stock_code: '600519', stock_name: '贵州茅台' } },
  { label: '波浪理论看宁德时代', skill: 'wave_theory', stockContext: { stock_code: '300750', stock_name: '宁德时代' } },
  { label: '分析比亚迪趋势', skill: 'bull_trend', stockContext: { stock_code: '002594', stock_name: '比亚迪' } },
  { label: '用箱体震荡分析 A 股中芯国际 688981', skill: 'box_oscillation', stockContext: { stock_code: '688981', stock_name: '中芯国际' } },
  { label: '分析腾讯 hk00700', skill: 'bull_trend', stockContext: { stock_code: 'HK00700', stock_name: '腾讯控股' } },
  { label: '用情绪周期分析东方财富', skill: 'emotion_cycle', stockContext: { stock_code: '300059', stock_name: '东方财富' } },
];

export const MAX_SELECTED_SKILLS = 3;
