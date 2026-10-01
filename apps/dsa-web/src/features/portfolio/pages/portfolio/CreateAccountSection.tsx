import type React from 'react';
import { Card, InlineAlert } from '@/components/ui';
import type { AccountFormState } from '@/features/portfolio/hooks/usePortfolioAccounts';
import type { PortfolioAccountMarket } from './shared';
import { PORTFOLIO_INPUT_CLASS, PORTFOLIO_SELECT_CLASS } from './shared';

type CreateAccountSectionProps = {
  hasAccounts: boolean;
  onCollapse: () => void;
  accountCreateError: string | null;
  accountCreateSuccess: string | null;
  accountForm: AccountFormState;
  setAccountForm: React.Dispatch<React.SetStateAction<AccountFormState>>;
  accountCreating: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export const CreateAccountSection: React.FC<CreateAccountSectionProps> = ({
  hasAccounts,
  onCollapse,
  accountCreateError,
  accountCreateSuccess,
  accountForm,
  setAccountForm,
  accountCreating,
  onSubmit,
}) => (
  <Card padding="md">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">新建账户</h2>
      {hasAccounts ? (
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1"
          onClick={onCollapse}
        >
          收起
        </button>
      ) : (
        <span className="text-xs text-secondary">创建后自动切换到该账户</span>
      )}
    </div>
    {accountCreateError ? (
      <InlineAlert
        variant="danger"
        className="mt-2 rounded-lg px-2 py-1 text-xs shadow-none"
        title="创建账户失败"
        message={accountCreateError}
      />
    ) : null}
    {accountCreateSuccess ? (
      <InlineAlert
        variant="success"
        className="mt-2 rounded-lg px-2 py-1 text-xs shadow-none"
        title="创建账户成功"
        message={accountCreateSuccess}
      />
    ) : null}
    <form className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={onSubmit}>
      <input
        className={`${PORTFOLIO_INPUT_CLASS} md:col-span-2`}
        placeholder="账户名称（必填）"
        value={accountForm.name}
        onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))}
      />
      <input
        className={PORTFOLIO_INPUT_CLASS}
        placeholder="券商（可选，如 Demo/华泰）"
        value={accountForm.broker}
        onChange={(e) => setAccountForm((prev) => ({ ...prev, broker: e.target.value }))}
      />
      <input
        className={PORTFOLIO_INPUT_CLASS}
        placeholder="基准币（如 CNY/USD/HKD）"
        value={accountForm.baseCurrency}
        onChange={(e) => setAccountForm((prev) => ({ ...prev, baseCurrency: e.target.value.toUpperCase() }))}
      />
      <select
        className={PORTFOLIO_SELECT_CLASS}
        value={accountForm.market}
        onChange={(e) => setAccountForm((prev) => ({ ...prev, market: e.target.value as PortfolioAccountMarket }))}
      >
        <option value="cn">市场：A 股（cn）</option>
        <option value="hk">市场：港股（hk）</option>
        <option value="us">市场：美股（us）</option>
        <option value="jp">市场：日股（jp）</option>
        <option value="kr">市场：韩股（kr）</option>
        <option value="tw">市场：台股（tw）</option>
      </select>
      <button type="submit" className="btn-secondary text-sm" disabled={accountCreating}>
        {accountCreating ? '创建中...' : '创建账户'}
      </button>
    </form>
  </Card>
);
