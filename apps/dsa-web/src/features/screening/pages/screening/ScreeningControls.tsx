import type React from 'react';
import { Play, SlidersHorizontal } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import type { ScreeningStrategy } from '@/features/screening/api/screening';
import { MARKETS } from '@/features/screening/pages/screening/formatting';
import { CUSTOM_STRATEGY_OPTION_VALUE } from '@/features/screening/pages/screening/screenTaskPersistence';

type ScreeningControlsProps = {
  selectedStrategyTag: string;
  market: string;
  strategy: string;
  maxResults: number;
  strategies: ScreeningStrategy[];
  selectedStrategy: ScreeningStrategy | undefined;
  loadingStrategies: boolean;
  strategyLoadError: string;
  loading: boolean;
  isScreeningEnabled: boolean;
  handleMarketChange: (nextMarket: string) => void;
  handleStrategyChange: (nextStrategy: string) => void;
  handleMaxResultsChange: (nextMaxResults: number) => void;
  handleSubmit: () => Promise<void>;
};

export const ScreeningControls: React.FC<ScreeningControlsProps> = ({
  selectedStrategyTag,
  market,
  strategy,
  maxResults,
  strategies,
  selectedStrategy,
  loadingStrategies,
  strategyLoadError,
  loading,
  isScreeningEnabled,
  handleMarketChange,
  handleStrategyChange,
  handleMaxResultsChange,
  handleSubmit,
}) => (
      <section className="rounded-2xl border border-cyan/35 bg-card/95 p-4 shadow-soft-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-cyan" />
            运行选股
          </div>
          <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">
            {selectedStrategyTag}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_180px_auto] lg:items-end">
          <label className="space-y-2 text-xs font-medium text-secondary-text">
            市场
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
              value={market}
              disabled={loading}
              onChange={(event) => handleMarketChange(event.target.value)}
            >
              {MARKETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 text-xs font-medium text-secondary-text">
            <label htmlFor="screening-strategy">策略</label>
            <Select
              id="screening-strategy"
              value={selectedStrategy ? strategy : CUSTOM_STRATEGY_OPTION_VALUE}
              disabled={loading || loadingStrategies}
              placeholder=""
              options={[
                ...strategies.map((item) => ({
                  value: item.id,
                  label: item.name || item.title || item.id,
                })),
                { value: CUSTOM_STRATEGY_OPTION_VALUE, label: '自定义策略…' },
              ]}
              onChange={(value) =>
                handleStrategyChange(
                  value === CUSTOM_STRATEGY_OPTION_VALUE ? '' : value,
                )
              }
            />
          </div>

          {!selectedStrategy && !loadingStrategies ? (
            <label className="space-y-2 text-xs font-medium text-secondary-text lg:col-start-2">
              自定义策略 ID
              <input
                aria-label="自定义策略 ID"
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
                value={strategy}
                disabled={loading}
                placeholder="输入策略 ID"
                onChange={(event) => handleStrategyChange(event.target.value)}
              />
            </label>
          ) : null}

          <label className="space-y-2 text-xs font-medium text-secondary-text">
            返回数量
            <input
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan"
              type="number"
              min={1}
              max={100}
              value={maxResults}
              disabled={loading}
              onChange={(event) => handleMaxResultsChange(Number(event.target.value))}
            />
          </label>

          <Button
            className="h-11 min-w-40"
            isLoading={loading}
            loadingText="筛选中..."
            disabled={!isScreeningEnabled || loading || !strategy.trim()}
            onClick={() => void handleSubmit()}
          >
            <Play className="h-4 w-4" />
            运行选股
          </Button>
        </div>

        <div className="mt-3 rounded-xl border border-border/75 bg-surface/55 px-3 py-2 text-xs leading-5 text-secondary-text">
          {strategyLoadError
            ? strategyLoadError
            : selectedStrategy?.description || '策略会先执行硬过滤和因子评分，再进行风险与组合约束。'}
        </div>
      </section>
);
