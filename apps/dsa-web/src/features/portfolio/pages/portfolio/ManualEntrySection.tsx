import type React from 'react';
import { Card } from '@/components/ui';
import type {
  CashFormState,
  CorpFormState,
  TradeFormState,
} from '@/features/portfolio/hooks/usePortfolioManualEntry';
import type {
  PortfolioCashDirection,
  PortfolioCorporateActionType,
  PortfolioSide,
} from '@/features/portfolio/types/portfolio';
import { PORTFOLIO_INPUT_CLASS, PORTFOLIO_SELECT_CLASS } from './shared';

type ManualEntrySectionProps = {
  writableAccountId: number | undefined;
  writableAccountCurrency: string | undefined;
  tradeForm: TradeFormState;
  setTradeForm: React.Dispatch<React.SetStateAction<TradeFormState>>;
  cashForm: CashFormState;
  setCashForm: React.Dispatch<React.SetStateAction<CashFormState>>;
  corpForm: CorpFormState;
  setCorpForm: React.Dispatch<React.SetStateAction<CorpFormState>>;
  onTradeSubmit: (e: React.FormEvent) => void;
  onCashSubmit: (e: React.FormEvent) => void;
  onCorporateSubmit: (e: React.FormEvent) => void;
};

export const ManualEntrySection: React.FC<ManualEntrySectionProps> = ({
  writableAccountId,
  writableAccountCurrency,
  tradeForm,
  setTradeForm,
  cashForm,
  setCashForm,
  corpForm,
  setCorpForm,
  onTradeSubmit,
  onCashSubmit,
  onCorporateSubmit,
}) => (
  <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
    <Card padding="md">
      <h3 className="text-sm font-semibold text-foreground mb-3">手工录入：交易</h3>
      <form className="space-y-2" onSubmit={onTradeSubmit}>
        <input className={PORTFOLIO_INPUT_CLASS} placeholder="股票代码（例如 600519）" value={tradeForm.symbol}
          onChange={(e) => setTradeForm((prev) => ({ ...prev, symbol: e.target.value }))} required />
        <div className="grid grid-cols-2 gap-2">
          <input className={PORTFOLIO_INPUT_CLASS} type="date" value={tradeForm.tradeDate}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, tradeDate: e.target.value }))} required />
          <select className={PORTFOLIO_SELECT_CLASS} value={tradeForm.side}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, side: e.target.value as PortfolioSide }))}>
            <option value="buy">买入</option>
            <option value="sell">卖出</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.0001" placeholder="数量（必填）" value={tradeForm.quantity}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, quantity: e.target.value }))} required />
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.0001" placeholder="成交价（必填）" value={tradeForm.price}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, price: e.target.value }))} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.0001" placeholder="手续费（可选）" value={tradeForm.fee}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, fee: e.target.value }))} />
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.0001" placeholder="税费（可选）" value={tradeForm.tax}
            onChange={(e) => setTradeForm((prev) => ({ ...prev, tax: e.target.value }))} />
        </div>
        <p className="text-xs text-secondary">手续费和税费可留空，系统将按 0 处理。</p>
        <button type="submit" className="btn-secondary w-full" disabled={!writableAccountId}>提交交易</button>
      </form>
    </Card>

    <Card padding="md">
      <h3 className="text-sm font-semibold text-foreground mb-3">手工录入：资金流水</h3>
      <form className="space-y-2" onSubmit={onCashSubmit}>
        <div className="grid grid-cols-2 gap-2">
          <input className={PORTFOLIO_INPUT_CLASS} type="date" value={cashForm.eventDate}
            onChange={(e) => setCashForm((prev) => ({ ...prev, eventDate: e.target.value }))} required />
          <select className={PORTFOLIO_SELECT_CLASS} value={cashForm.direction}
            onChange={(e) => setCashForm((prev) => ({ ...prev, direction: e.target.value as PortfolioCashDirection }))}>
            <option value="in">流入</option>
            <option value="out">流出</option>
          </select>
        </div>
        <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.0001" placeholder="金额"
          value={cashForm.amount} onChange={(e) => setCashForm((prev) => ({ ...prev, amount: e.target.value }))} required />
        <input className={PORTFOLIO_INPUT_CLASS} placeholder={`币种（可选，默认 ${writableAccountCurrency || '账户基准币'}）`} value={cashForm.currency}
          onChange={(e) => setCashForm((prev) => ({ ...prev, currency: e.target.value }))} />
        <button type="submit" className="btn-secondary w-full" disabled={!writableAccountId}>提交资金流水</button>
      </form>
    </Card>

    <Card padding="md">
      <h3 className="text-sm font-semibold text-foreground mb-3">手工录入：公司行为</h3>
      <form className="space-y-2" onSubmit={onCorporateSubmit}>
        <input className={PORTFOLIO_INPUT_CLASS} placeholder="股票代码" value={corpForm.symbol}
          onChange={(e) => setCorpForm((prev) => ({ ...prev, symbol: e.target.value }))} required />
        <div className="grid grid-cols-2 gap-2">
          <input className={PORTFOLIO_INPUT_CLASS} type="date" value={corpForm.effectiveDate}
            onChange={(e) => setCorpForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} required />
          <select className={PORTFOLIO_SELECT_CLASS} value={corpForm.actionType}
            onChange={(e) => setCorpForm((prev) => ({ ...prev, actionType: e.target.value as PortfolioCorporateActionType }))}>
            <option value="cash_dividend">现金分红</option>
            <option value="split_adjustment">拆并股调整</option>
          </select>
        </div>
        {corpForm.actionType === 'cash_dividend' ? (
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.000001" placeholder="每股分红"
            value={corpForm.cashDividendPerShare}
            onChange={(e) => setCorpForm((prev) => ({ ...prev, cashDividendPerShare: e.target.value, splitRatio: '' }))} required />
        ) : (
          <input className={PORTFOLIO_INPUT_CLASS} type="number" min="0" step="0.000001" placeholder="拆并股比例"
            value={corpForm.splitRatio}
            onChange={(e) => setCorpForm((prev) => ({ ...prev, splitRatio: e.target.value, cashDividendPerShare: '' }))} required />
        )}
        <button type="submit" className="btn-secondary w-full" disabled={!writableAccountId}>提交企业行为</button>
      </form>
    </Card>
  </section>
);
