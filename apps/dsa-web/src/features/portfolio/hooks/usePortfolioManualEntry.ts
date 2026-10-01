import type React from 'react';
import { useState } from 'react';
import type { ParsedApiError } from '@/api/error';
import { getParsedApiError } from '@/api/error';
import { portfolioApi } from '@/features/portfolio/api/portfolio';
import type {
  PortfolioCashDirection,
  PortfolioCorporateActionType,
  PortfolioSide,
} from '@/features/portfolio/types/portfolio';
import { getTodayIso } from '@/features/portfolio/utils/portfolioFormat';

export type TradeFormState = {
  symbol: string;
  tradeDate: string;
  side: PortfolioSide;
  quantity: string;
  price: string;
  fee: string;
  tax: string;
  tradeUid: string;
  note: string;
};

export type CashFormState = {
  eventDate: string;
  direction: PortfolioCashDirection;
  amount: string;
  currency: string;
  note: string;
};

export type CorpFormState = {
  symbol: string;
  effectiveDate: string;
  actionType: PortfolioCorporateActionType;
  cashDividendPerShare: string;
  splitRatio: string;
  note: string;
};

type UsePortfolioManualEntryOptions = {
  writableAccountId: number | undefined;
  onError: (error: ParsedApiError) => void;
  onWriteWarning: (message: string | null) => void;
  refreshPortfolioData: () => Promise<void>;
};

export function usePortfolioManualEntry({
  writableAccountId,
  onError,
  onWriteWarning,
  refreshPortfolioData,
}: UsePortfolioManualEntryOptions) {
  const [tradeForm, setTradeForm] = useState<TradeFormState>({
    symbol: '',
    tradeDate: getTodayIso(),
    side: 'buy',
    quantity: '',
    price: '',
    fee: '',
    tax: '',
    tradeUid: '',
    note: '',
  });
  const [cashForm, setCashForm] = useState<CashFormState>({
    eventDate: getTodayIso(),
    direction: 'in',
    amount: '',
    currency: '',
    note: '',
  });
  const [corpForm, setCorpForm] = useState<CorpFormState>({
    symbol: '',
    effectiveDate: getTodayIso(),
    actionType: 'cash_dividend',
    cashDividendPerShare: '',
    splitRatio: '',
    note: '',
  });

  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writableAccountId) {
      onWriteWarning('请先在右上角选择具体账户，再进行录入或导入提交。');
      return;
    }
    try {
      onWriteWarning(null);
      await portfolioApi.createTrade({
        accountId: writableAccountId,
        symbol: tradeForm.symbol,
        tradeDate: tradeForm.tradeDate,
        side: tradeForm.side,
        quantity: Number(tradeForm.quantity),
        price: Number(tradeForm.price),
        fee: Number(tradeForm.fee || 0),
        tax: Number(tradeForm.tax || 0),
        tradeUid: tradeForm.tradeUid || undefined,
        note: tradeForm.note || undefined,
      });
      await refreshPortfolioData();
      setTradeForm((prev) => ({ ...prev, symbol: '', tradeUid: '', note: '' }));
    } catch (err) {
      onError(getParsedApiError(err));
    }
  };

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writableAccountId) {
      onWriteWarning('请先在右上角选择具体账户，再进行录入或导入提交。');
      return;
    }
    try {
      onWriteWarning(null);
      await portfolioApi.createCashLedger({
        accountId: writableAccountId,
        eventDate: cashForm.eventDate,
        direction: cashForm.direction,
        amount: Number(cashForm.amount),
        currency: cashForm.currency || undefined,
        note: cashForm.note || undefined,
      });
      await refreshPortfolioData();
      setCashForm((prev) => ({ ...prev, note: '' }));
    } catch (err) {
      onError(getParsedApiError(err));
    }
  };

  const handleCorporateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writableAccountId) {
      onWriteWarning('请先在右上角选择具体账户，再进行录入或导入提交。');
      return;
    }
    try {
      onWriteWarning(null);
      await portfolioApi.createCorporateAction({
        accountId: writableAccountId,
        symbol: corpForm.symbol,
        effectiveDate: corpForm.effectiveDate,
        actionType: corpForm.actionType,
        cashDividendPerShare: corpForm.cashDividendPerShare ? Number(corpForm.cashDividendPerShare) : undefined,
        splitRatio: corpForm.splitRatio ? Number(corpForm.splitRatio) : undefined,
        note: corpForm.note || undefined,
      });
      await refreshPortfolioData();
      setCorpForm((prev) => ({ ...prev, symbol: '', note: '' }));
    } catch (err) {
      onError(getParsedApiError(err));
    }
  };

  return {
    tradeForm,
    setTradeForm,
    cashForm,
    setCashForm,
    corpForm,
    setCorpForm,
    handleTradeSubmit,
    handleCashSubmit,
    handleCorporateSubmit,
  };
}
