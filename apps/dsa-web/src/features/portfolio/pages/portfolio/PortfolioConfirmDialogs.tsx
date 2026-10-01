import type React from 'react';
import { ConfirmDialog } from '@/components/ui';
import { formatUiText } from '@/i18n/uiText';
import type { PendingAccountDelete, PendingDelete, PortfolioText } from './shared';

type PortfolioConfirmDialogsProps = {
  text: PortfolioText;
  pendingDelete: PendingDelete | null;
  deleteLoading: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  pendingAccountDelete: PendingAccountDelete | null;
  accountDeleteLoading: boolean;
  onConfirmAccountDelete: () => void;
  onCancelAccountDelete: () => void;
};

export const PortfolioConfirmDialogs: React.FC<PortfolioConfirmDialogsProps> = ({
  text,
  pendingDelete,
  deleteLoading,
  onConfirmDelete,
  onCancelDelete,
  pendingAccountDelete,
  accountDeleteLoading,
  onConfirmAccountDelete,
  onCancelAccountDelete,
}) => (
  <>
    <ConfirmDialog
      isOpen={Boolean(pendingDelete)}
      title="删除错误流水"
      message={pendingDelete?.message || '确认删除这条流水吗？'}
      confirmText={deleteLoading ? '删除中...' : '确认删除'}
      cancelText="取消"
      isDanger
      onConfirm={onConfirmDelete}
      onCancel={onCancelDelete}
    />
    <ConfirmDialog
      isOpen={Boolean(pendingAccountDelete)}
      title={text.deleteAccountTitle}
      message={
        pendingAccountDelete
          ? formatUiText(text.deleteAccountMessage, {
            name: pendingAccountDelete.accountName,
            id: pendingAccountDelete.accountId,
          })
          : ''
      }
      confirmText={accountDeleteLoading ? text.deletingAccount : text.deleteAccountConfirm}
      isDanger
      onConfirm={onConfirmAccountDelete}
      onCancel={onCancelAccountDelete}
    />
  </>
);
