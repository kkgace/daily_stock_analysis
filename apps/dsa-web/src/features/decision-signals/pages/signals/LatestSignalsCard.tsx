import type React from 'react';
import { Activity } from 'lucide-react';
import { ApiErrorAlert, Card, EmptyState } from '@/components/ui';
import { useUiLanguage } from '@/contexts/UiLanguageContext';
import type { ParsedApiError } from '@/api/error';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import { DecisionSignalCard } from '@/features/decision-signals/components/decision-signals/DecisionSignalDisplay';

type LatestSignalsCardProps = {
  hasStockContext: boolean;
  latestError: ParsedApiError | null;
  latestSearched: boolean;
  latestLoading: boolean;
  latestItems: DecisionSignalItem[];
  selectedId: number | null;
  onSelect: (item: DecisionSignalItem) => void;
};

export const LatestSignalsCard: React.FC<LatestSignalsCardProps> = ({
  hasStockContext,
  latestError,
  latestSearched,
  latestLoading,
  latestItems,
  selectedId,
  onSelect,
}) => {
  const { t } = useUiLanguage();

  return (
    <Card title={t('decisionSignals.latestTitle')} subtitle={t('decisionSignals.latestDescription')} padding="md">
      {!hasStockContext ? (
        <EmptyState
          className="border-none bg-transparent py-6 shadow-none"
          title={t('decisionSignals.stockContextGuideTitle')}
          description={t('decisionSignals.stockContextGuideDescription')}
          icon={<Activity className="h-6 w-6" />}
        />
      ) : null}
      {latestError ? <ApiErrorAlert className="mt-3" error={latestError} /> : null}
      {latestSearched && !latestLoading && !latestError && latestItems.length === 0 ? (
        <EmptyState
          className="mt-4 border-none bg-transparent py-6 shadow-none"
          title={t('decisionSignals.noLatestTitle')}
          description={t('decisionSignals.noLatestDescription')}
          icon={<Activity className="h-6 w-6" />}
        />
      ) : null}
      {latestLoading ? <p className="mt-3 text-sm text-secondary-text">{t('common.loading')}...</p> : null}
      {latestItems.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {latestItems.map((item) => (
            <DecisionSignalCard
              key={item.id}
              item={item}
              onSelect={onSelect}
              selected={selectedId === item.id}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
};

export default LatestSignalsCard;
