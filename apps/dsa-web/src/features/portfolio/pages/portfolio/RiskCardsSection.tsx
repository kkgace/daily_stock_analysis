import type React from 'react';
import { useMemo } from 'react';
import { Card } from '@/components/ui';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import type {
  PortfolioCostMethod,
  PortfolioRiskResponse,
  PortfolioSnapshotResponse,
} from '@/features/portfolio/types/portfolio';
import { formatPct } from '@/features/portfolio/utils/portfolioFormat';
import { buildDecisionActionLabelMap, getDecisionActionLabel } from '@/utils/decisionAction';
import type { PortfolioText } from './shared';

type DecisionActionLabels = ReturnType<typeof buildDecisionActionLabelMap>;

type RiskCardsSectionProps = {
  text: PortfolioText;
  snapshot: PortfolioSnapshotResponse | null;
  risk: PortfolioRiskResponse | null;
  costMethod: PortfolioCostMethod;
  decisionActionLabels: DecisionActionLabels;
};

export const RiskCardsSection: React.FC<RiskCardsSectionProps> = ({
  text,
  snapshot,
  risk,
  costMethod,
  decisionActionLabels,
}) => {
  const decisionSignalRiskPreviewItems = useMemo(
    () => (risk?.decisionSignalRisk?.items ?? []).slice(0, 3),
    [risk],
  );
  const formatDecisionSignalRiskAction = (signal: Partial<DecisionSignalItem>): string => (
    getDecisionActionLabel(
      signal.action,
      signal.actionLabel,
      null,
      text.alert,
      decisionActionLabels,
    ) ?? text.alert
  );

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <Card padding="md">
        <h3 className="text-sm font-semibold text-foreground mb-2">{text.drawdownMonitor}</h3>
        <div className="text-xs text-secondary space-y-1">
          <div>{text.maxDrawdown}: {formatPct(risk?.drawdown?.maxDrawdownPct)}</div>
          <div>{text.currentDrawdown}: {formatPct(risk?.drawdown?.currentDrawdownPct)}</div>
          <div>{text.alert}: {risk?.drawdown?.alert ? text.yes : text.no}</div>
        </div>
      </Card>
      <Card padding="md">
        <h3 className="text-sm font-semibold text-foreground mb-2">{text.stopLossWarning}</h3>
        <div className="text-xs text-secondary space-y-1">
          <div>{text.triggeredCount}: {risk?.stopLoss?.triggeredCount ?? 0}</div>
          <div>{text.nearCount}: {risk?.stopLoss?.nearCount ?? 0}</div>
          <div>{text.alert}: {risk?.stopLoss?.nearAlert ? text.yes : text.no}</div>
        </div>
      </Card>
      <Card padding="md">
        <h3 className="text-sm font-semibold text-foreground mb-2">{text.scope}</h3>
        <div className="text-xs text-secondary space-y-1">
          <div>{text.accountCount}: {snapshot?.accountCount ?? 0}</div>
          <div>{text.currency}: {snapshot?.currency || 'CNY'}</div>
          <div>{text.costMethodShort}: {(snapshot?.costMethod || costMethod).toUpperCase()}</div>
        </div>
      </Card>
      <Card padding="md">
        <h3 className="text-sm font-semibold text-foreground mb-2">{text.aiRiskSignals}</h3>
        <div className="text-xs text-secondary space-y-1">
          {risk?.decisionSignalRisk?.available === false ? (
            <div className="text-warning">{text.aiRiskUnavailable}</div>
          ) : (
            <>
              <div>{text.aiRiskTotal}: {risk?.decisionSignalRisk?.total ?? 0}</div>
              <div>
                {text.sellSignals}: {risk?.decisionSignalRisk?.actions?.sell ?? 0} · {text.reduceSignals}: {risk?.decisionSignalRisk?.actions?.reduce ?? 0} · {text.alertSignals}: {risk?.decisionSignalRisk?.actions?.alert ?? 0}
              </div>
              {decisionSignalRiskPreviewItems.length > 0 ? (
                <div className="space-y-1 pt-1">
                  {decisionSignalRiskPreviewItems.map((item) => (
                    <div key={`${item.accountId ?? 'all'}-${item.market}-${item.symbol}-${item.signal.id ?? item.signal.action}`} className="truncate text-foreground">
                      {item.symbol} · {formatDecisionSignalRiskAction(item.signal)}
                    </div>
                  ))}
                </div>
              ) : (
                <div>{text.noAiRiskSignals}</div>
              )}
            </>
          )}
        </div>
      </Card>
    </section>
  );
};
