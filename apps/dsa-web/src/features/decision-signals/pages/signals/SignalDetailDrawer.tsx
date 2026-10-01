import type React from 'react';
import { Drawer } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import { DecisionSignalDetails } from '@/features/decision-signals/components/decision-signals/DecisionSignalDisplay';
import type { useSignalDetail } from '@/features/decision-signals/hooks/useSignalDetail';
import {
  STATUS_ACTION_CONFIRM_KEYS,
  STATUS_ACTION_LABEL_KEYS,
  STATUS_ACTIONS,
  type PendingStatusChange,
  type SelectedSignal,
} from './types';
import { ReassessPanel } from './ReassessPanel';
import type { useSignalReassess } from '@/features/decision-signals/hooks/useSignalReassess';

type SignalDetailDrawerProps = {
  selected: SelectedSignal | null;
  onClose: () => void;
  reassess: ReturnType<typeof useSignalReassess>;
  detail: ReturnType<typeof useSignalDetail>;
  statusUpdating: boolean;
  onStatusAction: (pending: PendingStatusChange) => void;
};

export const SignalDetailDrawer: React.FC<SignalDetailDrawerProps> = ({
  selected,
  onClose,
  reassess,
  detail,
  statusUpdating,
  onStatusAction,
}) => {
  const { t } = useUiLanguage();
  const {
    selectedOutcomes,
    selectedOutcomesLoading,
    selectedOutcomesError,
    selectedFeedback,
    selectedFeedbackLoading,
    selectedFeedbackError,
    feedbackSaving,
    handleFeedbackSubmit,
  } = detail;

  return (
    <Drawer
      isOpen={Boolean(selected)}
      onClose={onClose}
      title={t('decisionSignals.detailTitle')}
      width="max-w-3xl"
    >
      {selected ? (
        <div className="space-y-4">
          <ReassessPanel reassess={reassess} />
          <DecisionSignalDetails
            item={selected.item}
            outcomes={selectedOutcomes}
            outcomesLoading={selectedOutcomesLoading}
            outcomesError={selectedOutcomesError?.message ?? null}
            feedback={selectedFeedback}
            feedbackLoading={selectedFeedbackLoading}
            feedbackSaving={feedbackSaving}
            feedbackError={selectedFeedbackError?.message ?? null}
            onFeedbackSubmit={handleFeedbackSubmit}
            actions={STATUS_ACTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className="btn-secondary !px-3 !py-1.5 !text-xs"
                onClick={() => onStatusAction({
                  item: selected.item,
                  status,
                  message: t(STATUS_ACTION_CONFIRM_KEYS[status]),
                })}
                disabled={statusUpdating || selected.item.status === status}
              >
                {t(STATUS_ACTION_LABEL_KEYS[status])}
              </button>
            ))}
          />
        </div>
      ) : null}
    </Drawer>
  );
};

export default SignalDetailDrawer;
