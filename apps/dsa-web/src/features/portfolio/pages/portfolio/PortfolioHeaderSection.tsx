import type React from 'react';
import { InlineAlert } from '@/components/ui';
import type {
  PortfolioAccountItem,
  PortfolioCostMethod,
} from '@/features/portfolio/types/portfolio';
import type { AccountOption, PortfolioText } from './shared';
import { PORTFOLIO_SELECT_CLASS } from './shared';

type PortfolioHeaderSectionProps = {
  text: PortfolioText;
  hasAccounts: boolean;
  accounts: PortfolioAccountItem[];
  selectedAccount: AccountOption;
  onSelectAccount: (value: AccountOption) => void;
  costMethod: PortfolioCostMethod;
  onCostMethodChange: (value: PortfolioCostMethod) => void;
  showCreateAccount: boolean;
  onToggleCreateAccount: () => void;
  isLoading: boolean;
  fxRefreshing: boolean;
  onRefresh: () => void;
  canDeleteSelectedAccount: boolean;
  accountDeleteLoading: boolean;
  onDeleteAccount: () => void;
};

export const PortfolioHeaderSection: React.FC<PortfolioHeaderSectionProps> = ({
  text,
  hasAccounts,
  accounts,
  selectedAccount,
  onSelectAccount,
  costMethod,
  onCostMethodChange,
  showCreateAccount,
  onToggleCreateAccount,
  isLoading,
  fxRefreshing,
  onRefresh,
  canDeleteSelectedAccount,
  accountDeleteLoading,
  onDeleteAccount,
}) => (
  <section className="space-y-3">
    <div className="space-y-2">
      <h1 className="text-xl md:text-2xl font-semibold text-foreground">{text.title}</h1>
      <p className="text-xs md:text-sm text-secondary">
        {text.description}
      </p>
    </div>
    {hasAccounts ? (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px_280px] gap-2 items-end">
          <div>
            <p className="text-xs text-secondary mb-1">{text.accountView}</p>
            <select
              value={String(selectedAccount)}
              onChange={(e) => onSelectAccount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className={PORTFOLIO_SELECT_CLASS}
            >
              <option value="all">{text.allAccounts}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} (#{account.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-secondary mb-1">{text.costMethod}</p>
            <select
              value={costMethod}
              onChange={(e) => onCostMethodChange(e.target.value as PortfolioCostMethod)}
              className={PORTFOLIO_SELECT_CLASS}
            >
              <option value="fifo">{text.fifo}</option>
              <option value="avg">{text.avg}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm flex-1"
              onClick={onToggleCreateAccount}
            >
              {showCreateAccount ? text.collapseCreate : text.createAccount}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading || fxRefreshing}
              className="btn-secondary text-sm flex-1"
            >
              {isLoading ? text.refreshing : text.refreshData}
            </button>
            <button
              type="button"
              onClick={onDeleteAccount}
              disabled={!canDeleteSelectedAccount}
              className="btn-secondary text-sm flex-1 border-danger/40 text-danger hover:bg-danger/15 disabled:border-border/40 disabled:text-secondary"
            >
              {accountDeleteLoading ? text.deletingAccount : text.deleteAccount}
            </button>
          </div>
        </div>
      </div>
    ) : (
      <InlineAlert
        variant="warning"
        className="inline-block rounded-lg px-3 py-2 text-xs shadow-none"
        message={text.noAccounts}
      />
    )}
  </section>
);
