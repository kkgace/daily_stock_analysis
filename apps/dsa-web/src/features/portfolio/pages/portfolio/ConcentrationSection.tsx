import type React from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, EmptyState } from '@/components/ui';
import type { PortfolioRiskResponse } from '@/features/portfolio/types/portfolio';
import { formatPct } from '@/features/portfolio/utils/portfolioFormat';
import { PIE_COLORS } from './shared';
import type { PortfolioText } from './shared';

type ConcentrationSectionProps = {
  text: PortfolioText;
  risk: PortfolioRiskResponse | null;
  concentrationPieData: { name: string; value: number }[];
  concentrationMode: 'sector' | 'position';
};

export const ConcentrationSection: React.FC<ConcentrationSectionProps> = ({
  text,
  risk,
  concentrationPieData,
  concentrationMode,
}) => (
  <Card padding="md">
    <h2 className="text-sm font-semibold text-foreground mb-3">
      {concentrationMode === 'sector' ? text.sectorConcentration : text.positionConcentrationFallback}
    </h2>
    {concentrationPieData.length > 0 ? (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={concentrationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
              {concentrationPieData.map((entry, index) => (
                <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <EmptyState
        title={text.noConcentrationTitle}
        description={text.noConcentrationDescription}
        className="border-none bg-transparent px-4 py-10 shadow-none"
      />
    )}
    <div className="mt-3 text-xs text-secondary space-y-1">
      <div>{text.displayScope}: {concentrationMode === 'sector' ? text.sectorDimension : text.positionDimensionFallback}</div>
      <div>{text.sectorAlert}: {risk?.sectorConcentration?.alert ? text.yes : text.no}</div>
      <div>{text.topWeight}: {formatPct(risk?.sectorConcentration?.topWeightPct ?? risk?.concentration?.topWeightPct)}</div>
    </div>
  </Card>
);
