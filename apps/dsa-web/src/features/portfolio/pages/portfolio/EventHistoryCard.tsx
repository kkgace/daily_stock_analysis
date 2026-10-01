import type React from 'react';
import { Card, EmptyState } from '@/components/ui';
import type {
  PortfolioCashDirection,
  PortfolioCashLedgerListItem,
  PortfolioCorporateActionListItem,
  PortfolioCorporateActionType,
  PortfolioSide,
  PortfolioTradeListItem,
} from '@/features/portfolio/types/portfolio';
import {
  formatCashDirectionLabel,
  formatCorporateActionLabel,
  formatSideLabel,
} from '@/features/portfolio/utils/portfolioFormat';
import type { EventType, PendingDelete } from './shared';
import { PORTFOLIO_INPUT_CLASS, PORTFOLIO_SELECT_CLASS } from './shared';

type EventHistoryCardProps = {
  eventType: EventType;
  onEventTypeChange: (value: EventType) => void;
  eventLoading: boolean;
  onReloadEvents: () => void;
  eventDateFrom: string;
  onEventDateFromChange: (value: string) => void;
  eventDateTo: string;
  onEventDateToChange: (value: string) => void;
  eventSymbol: string;
  onEventSymbolChange: (value: string) => void;
  eventSide: '' | PortfolioSide;
  onEventSideChange: (value: '' | PortfolioSide) => void;
  eventDirection: '' | PortfolioCashDirection;
  onEventDirectionChange: (value: '' | PortfolioCashDirection) => void;
  eventActionType: '' | PortfolioCorporateActionType;
  onEventActionTypeChange: (value: '' | PortfolioCorporateActionType) => void;
  writeBlocked: boolean;
  tradeEvents: PortfolioTradeListItem[];
  cashEvents: PortfolioCashLedgerListItem[];
  corporateEvents: PortfolioCorporateActionListItem[];
  onOpenDelete: (item: PendingDelete) => void;
  eventPage: number;
  totalEventPages: number;
  onEventPageChange: (updater: (prev: number) => number) => void;
};

export const EventHistoryCard: React.FC<EventHistoryCardProps> = ({
  eventType,
  onEventTypeChange,
  eventLoading,
  onReloadEvents,
  eventDateFrom,
  onEventDateFromChange,
  eventDateTo,
  onEventDateToChange,
  eventSymbol,
  onEventSymbolChange,
  eventSide,
  onEventSideChange,
  eventDirection,
  onEventDirectionChange,
  eventActionType,
  onEventActionTypeChange,
  writeBlocked,
  tradeEvents,
  cashEvents,
  corporateEvents,
  onOpenDelete,
  eventPage,
  totalEventPages,
  onEventPageChange,
}) => (
  <Card padding="md">
    <h3 className="text-sm font-semibold text-foreground mb-3">事件记录</h3>
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select className={PORTFOLIO_SELECT_CLASS} value={eventType} onChange={(e) => onEventTypeChange(e.target.value as EventType)}>
          <option value="trade">交易流水</option>
          <option value="cash">资金流水</option>
          <option value="corporate">公司行为</option>
        </select>
        <button type="button" className="btn-secondary text-sm" onClick={onReloadEvents} disabled={eventLoading}>
          {eventLoading ? '加载中...' : '刷新流水'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={PORTFOLIO_INPUT_CLASS} type="date" value={eventDateFrom} onChange={(e) => onEventDateFromChange(e.target.value)} />
        <input className={PORTFOLIO_INPUT_CLASS} type="date" value={eventDateTo} onChange={(e) => onEventDateToChange(e.target.value)} />
      </div>
      {(eventType === 'trade' || eventType === 'corporate') ? (
        <input className={PORTFOLIO_INPUT_CLASS} placeholder="按股票代码筛选" value={eventSymbol}
          onChange={(e) => onEventSymbolChange(e.target.value)} />
      ) : null}
      {eventType === 'trade' ? (
        <select className={PORTFOLIO_SELECT_CLASS} value={eventSide} onChange={(e) => onEventSideChange(e.target.value as '' | PortfolioSide)}>
          <option value="">全部买卖方向</option>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select>
      ) : null}
      {eventType === 'cash' ? (
        <select className={PORTFOLIO_SELECT_CLASS} value={eventDirection}
          onChange={(e) => onEventDirectionChange(e.target.value as '' | PortfolioCashDirection)}>
          <option value="">全部资金方向</option>
          <option value="in">流入</option>
          <option value="out">流出</option>
        </select>
      ) : null}
      {eventType === 'corporate' ? (
        <select className={PORTFOLIO_SELECT_CLASS} value={eventActionType}
          onChange={(e) => onEventActionTypeChange(e.target.value as '' | PortfolioCorporateActionType)}>
          <option value="">全部公司行为</option>
          <option value="cash_dividend">现金分红</option>
          <option value="split_adjustment">拆并股调整</option>
        </select>
      ) : null}
      <div className="text-[11px] text-secondary">
        {writeBlocked ? '删除修正仅在单账户视图可用。请先选择具体账户后再删除错误流水。' : '如有错误流水，可直接删除后重新录入。'}
      </div>
      <div className="max-h-64 overflow-auto rounded-lg border border-white/10 p-2">
        {eventType === 'trade' && tradeEvents.map((item) => (
          <div key={`t-${item.id}`} className="flex items-start justify-between gap-3 border-b border-white/5 py-2 text-xs text-secondary">
            <div className="min-w-0">
              {item.tradeDate} {formatSideLabel(item.side)} {item.symbol} 数量={item.quantity} 价格={item.price}
            </div>
            {!writeBlocked ? (
              <button
                type="button"
                className="btn-secondary shrink-0 !px-3 !py-1 !text-[11px]"
                onClick={() => onOpenDelete({
                  eventType: 'trade',
                  id: item.id,
                  message: `确认删除 ${item.tradeDate} 的${formatSideLabel(item.side)}流水 ${item.symbol}（数量 ${item.quantity}，价格 ${item.price}）吗？`,
                })}
              >
                删除
              </button>
            ) : null}
          </div>
        ))}
        {eventType === 'cash' && cashEvents.map((item) => (
          <div key={`c-${item.id}`} className="flex items-start justify-between gap-3 border-b border-white/5 py-2 text-xs text-secondary">
            <div className="min-w-0">
              {item.eventDate} {formatCashDirectionLabel(item.direction)} {item.amount} {item.currency}
            </div>
            {!writeBlocked ? (
              <button
                type="button"
                className="btn-secondary shrink-0 !px-3 !py-1 !text-[11px]"
                onClick={() => onOpenDelete({
                  eventType: 'cash',
                  id: item.id,
                  message: `确认删除 ${item.eventDate} 的资金流水（${formatCashDirectionLabel(item.direction)} ${item.amount} ${item.currency}）吗？`,
                })}
              >
                删除
              </button>
            ) : null}
          </div>
        ))}
        {eventType === 'corporate' && corporateEvents.map((item) => (
          <div key={`ca-${item.id}`} className="flex items-start justify-between gap-3 border-b border-white/5 py-2 text-xs text-secondary">
            <div className="min-w-0">
              {item.effectiveDate} {formatCorporateActionLabel(item.actionType)} {item.symbol}
            </div>
            {!writeBlocked ? (
              <button
                type="button"
                className="btn-secondary shrink-0 !px-3 !py-1 !text-[11px]"
                onClick={() => onOpenDelete({
                  eventType: 'corporate',
                  id: item.id,
                  message: `确认删除 ${item.effectiveDate} 的公司行为 ${formatCorporateActionLabel(item.actionType)}（${item.symbol}）吗？`,
                })}
              >
                删除
              </button>
            ) : null}
          </div>
        ))}
        {!eventLoading
          && ((eventType === 'trade' && tradeEvents.length === 0)
            || (eventType === 'cash' && cashEvents.length === 0)
            || (eventType === 'corporate' && corporateEvents.length === 0)) ? (
              <EmptyState
                title="暂无流水"
                description="调整筛选条件或先录入一笔交易、资金流水或公司行为。"
                className="border-none bg-transparent px-3 py-6 shadow-none"
              />
            ) : null}
      </div>
      <div className="flex items-center justify-between text-xs text-secondary">
        <span>第 {eventPage} / {totalEventPages} 页</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-xs px-3 py-1" disabled={eventPage <= 1}
            onClick={() => onEventPageChange((prev) => Math.max(1, prev - 1))}>
            上一页
          </button>
          <button type="button" className="btn-secondary text-xs px-3 py-1" disabled={eventPage >= totalEventPages}
            onClick={() => onEventPageChange((prev) => Math.min(totalEventPages, prev + 1))}>
            下一页
          </button>
        </div>
      </div>
    </div>
  </Card>
);
