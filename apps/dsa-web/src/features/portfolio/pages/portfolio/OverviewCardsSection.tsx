import type React from 'react';
import { Badge, Card, InlineAlert } from '@/components/ui';
import type { PortfolioSnapshotResponse } from '@/features/portfolio/types/portfolio';
import type { FxRefreshFeedback } from '@/features/portfolio/utils/portfolioFormat';
import { formatMoney, getFxRefreshFeedbackVariant } from '@/features/portfolio/utils/portfolioFormat';
import type { PortfolioText } from './shared';

type OverviewCardsSectionProps = {
  text: PortfolioText;
  snapshot: PortfolioSnapshotResponse | null;
  hasAccounts: boolean;
  isLoading: boolean;
  fxRefreshing: boolean;
  fxRefreshFeedback: FxRefreshFeedback | null;
  onRefreshFx: () => void;
};

export const OverviewCardsSection: React.FC<OverviewCardsSectionProps> = ({
  text,
  snapshot,
  hasAccounts,
  isLoading,
  fxRefreshing,
  fxRefreshFeedback,
  onRefreshFx,
}) => (
  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
    <Card variant="gradient" padding="md">
      <p className="text-xs text-secondary">{text.totalEquity}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(snapshot?.totalEquity, snapshot?.currency || 'CNY')}</p>
    </Card>
    <Card variant="gradient" padding="md">
      <p className="text-xs text-secondary">{text.totalMarketValue}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(snapshot?.totalMarketValue, snapshot?.currency || 'CNY')}</p>
    </Card>
    <Card variant="gradient" padding="md">
      <p className="text-xs text-secondary">{text.totalCash}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(snapshot?.totalCash, snapshot?.currency || 'CNY')}</p>
    </Card>
    <Card variant="gradient" padding="md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-secondary">{text.fxStatus}</p>
        <button
          type="button"
          className="btn-secondary !px-3 !py-1 !text-xs shrink-0"
          onClick={onRefreshFx}
          disabled={!hasAccounts || isLoading || fxRefreshing}
        >
          {fxRefreshing ? text.refreshing : text.refreshFx}
        </button>
      </div>
      <div className="mt-2">{snapshot?.fxStale ? <Badge variant="warning">{text.stale}</Badge> : <Badge variant="success">{text.latest}</Badge>}</div>
      {fxRefreshFeedback ? (
        <InlineAlert
          variant={getFxRefreshFeedbackVariant(fxRefreshFeedback.tone)}
          title={text.fxRefreshResult}
          message={fxRefreshFeedback.text}
          className="mt-3 rounded-xl px-3 py-2 text-xs shadow-none"
        />
      ) : null}
    </Card>
  </section>
);
