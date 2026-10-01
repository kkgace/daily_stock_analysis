import type React from 'react';
import { Card, EmptyState, InlineAlert } from '@/components/ui';
import { PortfolioSignalSummary } from '@/features/decision-signals/components/decision-signals/DecisionSignalDisplay';
import type { DecisionSignalItem } from '@/features/decision-signals/types/decisionSignals';
import {
  formatPositionMoney,
  formatPositionPrice,
  formatSignedPct,
  getPositionPriceLabel,
  hasPositionPrice,
} from '@/features/portfolio/utils/portfolioFormat';
import { formatUiText, type UiTextKey, type UiTextParams } from '@/i18n/uiText';
import type { FlatPosition, PortfolioText } from './shared';

type PositionsSectionProps = {
  text: PortfolioText;
  t: (key: UiTextKey, params?: UiTextParams) => string;
  positionRows: FlatPosition[];
  portfolioSignalsLoading: boolean;
  portfolioSignalsWarning: string | null;
  signalByPositionKey: Map<string, DecisionSignalItem>;
  positionAnalysisLoadingKey: string | null;
  onAnalyzePosition: (row: FlatPosition) => void;
};

export const PositionsSection: React.FC<PositionsSectionProps> = ({
  text,
  t,
  positionRows,
  portfolioSignalsLoading,
  portfolioSignalsWarning,
  signalByPositionKey,
  positionAnalysisLoadingKey,
  onAnalyzePosition,
}) => (
  <Card className="xl:col-span-2" padding="md">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-foreground">{text.positionsTitle}</h2>
      <span className="text-xs text-secondary">{formatUiText(text.countItems, { count: positionRows.length })}</span>
    </div>
    {portfolioSignalsWarning ? (
      <InlineAlert
        variant="warning"
        title={t('decisionSignals.portfolioWarningTitle')}
        message={portfolioSignalsWarning}
        className="mb-3 rounded-xl px-3 py-2 text-xs shadow-none"
      />
    ) : null}
    {positionRows.length === 0 ? (
      <EmptyState
        title={text.noPositionsTitle}
        description={text.noPositionsDescription}
        className="border-none bg-transparent px-4 py-8 shadow-none"
      />
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm tabular-nums">
          <thead className="text-xs text-secondary border-b border-white/10">
            <tr>
              <th className="text-left py-2 pr-2">{text.account}</th>
              <th className="text-left py-2 pr-2">{text.code}</th>
              <th className="text-right py-2 pr-2">{text.quantity}</th>
              <th className="text-right py-2 pr-2">{text.avgCost}</th>
              <th className="text-right py-2 pr-2">{text.lastPrice}</th>
              <th className="text-right py-2 pr-2">{text.marketValue}</th>
              <th className="text-right py-2 pr-3">{text.unrealizedPnl}</th>
              <th className="text-right py-2 pr-3">{text.returnPct}</th>
              <th className="min-w-[9rem] text-right py-2 pr-3">{t('decisionSignals.portfolioColumn')}</th>
              <th className="w-20 text-right py-2">{text.action}</th>
            </tr>
          </thead>
          <tbody>
            {positionRows.map((row) => {
              const rowKey = `${row.accountId}-${row.symbol}-${row.market}`;
              const analyzing = positionAnalysisLoadingKey === rowKey;
              const signal = signalByPositionKey.get(rowKey);
              return (
              <tr key={rowKey} className="border-b border-white/5">
                <td className="py-2 pr-2 text-secondary">{row.accountName}</td>
                <td className="py-2 pr-2 font-mono text-foreground">{row.symbol}</td>
                <td className="py-2 pr-2 text-right">{row.quantity.toFixed(2)}</td>
                <td className="py-2 pr-2 text-right">{row.avgCost.toFixed(4)}</td>
                <td className="py-2 pr-2 text-right">
                  <div>{formatPositionPrice(row)}</div>
                  <div className={`text-[11px] ${hasPositionPrice(row) ? 'text-secondary' : 'text-warning'}`}>
                    {getPositionPriceLabel(row)}
                  </div>
                </td>
                <td className="py-2 pr-2 text-right">{formatPositionMoney(row.marketValueBase, row)}</td>
                <td
                  className={`py-2 pr-3 text-right ${
                    hasPositionPrice(row)
                      ? row.unrealizedPnlBase >= 0
                        ? 'text-success'
                        : 'text-danger'
                      : 'text-secondary'
                  }`}
                >
                  {formatPositionMoney(row.unrealizedPnlBase, row)}
                </td>
                <td
                  className={`py-2 pr-3 text-right ${
                    hasPositionPrice(row) && row.unrealizedPnlPct !== null && row.unrealizedPnlPct !== undefined
                      ? row.unrealizedPnlPct >= 0
                        ? 'text-success'
                        : 'text-danger'
                      : 'text-secondary'
                  }`}
                >
                  {formatSignedPct(row.unrealizedPnlPct)}
                </td>
                <td className="py-2 pr-3 text-right align-top">
                  <PortfolioSignalSummary item={signal} loading={portfolioSignalsLoading} />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onAnalyzePosition(row)}
                    disabled={analyzing}
                    className="btn-secondary px-2 py-1 text-xs disabled:cursor-wait disabled:opacity-60"
                  >
                    {analyzing ? text.submitting : text.analyze}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Card>
);
