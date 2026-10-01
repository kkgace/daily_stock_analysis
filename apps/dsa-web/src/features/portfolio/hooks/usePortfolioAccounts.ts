import type React from 'react';
import { useCallback, useState } from 'react';
import type { ParsedApiError } from '@/api/error';
import { getParsedApiError } from '@/api/error';
import { portfolioApi } from '@/features/portfolio/api/portfolio';
import type { PortfolioAccountItem } from '@/features/portfolio/types/portfolio';
import type { AccountOption, PendingAccountDelete, PortfolioAccountMarket } from '@/features/portfolio/pages/portfolio/shared';

export type AccountFormState = {
  name: string;
  broker: string;
  market: PortfolioAccountMarket;
  baseCurrency: string;
};

type UsePortfolioAccountsOptions = {
  onError: (error: ParsedApiError) => void;
  onWriteWarning: (message: string | null) => void;
};

export function usePortfolioAccounts({
  onError,
  onWriteWarning,
}: UsePortfolioAccountsOptions) {
  const [accounts, setAccounts] = useState<PortfolioAccountItem[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountOption>('all');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountCreating, setAccountCreating] = useState(false);
  const [accountCreateError, setAccountCreateError] = useState<string | null>(null);
  const [accountCreateSuccess, setAccountCreateSuccess] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState>({
    name: '',
    broker: 'Demo',
    market: 'cn',
    baseCurrency: 'CNY',
  });
  const [pendingAccountDelete, setPendingAccountDelete] = useState<PendingAccountDelete | null>(null);
  const [accountDeleteLoading, setAccountDeleteLoading] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await portfolioApi.getAccounts(false);
      const items = response.accounts || [];
      setAccounts(items);
      setSelectedAccount((prev) => {
        if (items.length === 0) return 'all';
        if (prev !== 'all' && !items.some((item) => item.id === prev)) return items[0].id;
        return prev;
      });
      if (items.length === 0) setShowCreateAccount(true);
    } catch (err) {
      onError(getParsedApiError(err));
    }
  }, [onError]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = accountForm.name.trim();
    if (!name) {
      setAccountCreateError('账户名称不能为空。');
      setAccountCreateSuccess(null);
      return;
    }
    try {
      setAccountCreating(true);
      setAccountCreateError(null);
      setAccountCreateSuccess(null);
      const created = await portfolioApi.createAccount({
        name,
        broker: accountForm.broker.trim() || undefined,
        market: accountForm.market,
        baseCurrency: accountForm.baseCurrency.trim() || 'CNY',
      });
      await loadAccounts();
      setSelectedAccount(created.id);
      setShowCreateAccount(false);
      onWriteWarning(null);
      setAccountForm({
        name: '',
        broker: 'Demo',
        market: accountForm.market,
        baseCurrency: accountForm.baseCurrency,
      });
      setAccountCreateSuccess('账户创建成功，已自动切换到该账户。');
    } catch (err) {
      const parsed = getParsedApiError(err);
      setAccountCreateError(parsed.message || '创建账户失败，请稍后重试。');
      setAccountCreateSuccess(null);
    } finally {
      setAccountCreating(false);
    }
  };

  const openAccountDeleteDialog = () => {
    const writableAccount = selectedAccount === 'all'
      ? undefined
      : accounts.find((item) => item.id === selectedAccount);
    if (!writableAccount) {
      onWriteWarning('请先选择具体账户，再删除持仓账户。');
      return;
    }
    setPendingAccountDelete({
      accountId: writableAccount.id,
      accountName: writableAccount.name,
    });
  };

  const handleConfirmAccountDelete = async (onAfterAccountDeleted: () => void) => {
    if (!pendingAccountDelete || accountDeleteLoading) return;

    try {
      setAccountDeleteLoading(true);
      onWriteWarning(null);
      await portfolioApi.deleteAccount(pendingAccountDelete.accountId);
      const nextAccount = accounts.find((item) => item.id !== pendingAccountDelete.accountId);
      setSelectedAccount(nextAccount?.id ?? 'all');
      setPendingAccountDelete(null);
      setShowCreateAccount(!nextAccount);
      await loadAccounts();
      onAfterAccountDeleted();
    } catch (err) {
      onError(getParsedApiError(err));
    } finally {
      setAccountDeleteLoading(false);
    }
  };

  return {
    accounts,
    selectedAccount,
    setSelectedAccount,
    showCreateAccount,
    setShowCreateAccount,
    accountCreating,
    accountCreateError,
    setAccountCreateError,
    accountCreateSuccess,
    setAccountCreateSuccess,
    accountForm,
    setAccountForm,
    pendingAccountDelete,
    setPendingAccountDelete,
    accountDeleteLoading,
    loadAccounts,
    handleCreateAccount,
    openAccountDeleteDialog,
    handleConfirmAccountDelete,
  };
}
