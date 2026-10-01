import type React from 'react';
import { Clock3 } from 'lucide-react';
import type { ScreeningRunSummary, ScreeningStrategy } from '@/features/screening/api/screening';
import {
  formatHistoryMarketLabel,
  formatHistoryStrategyName,
  formatRunCreatedAt,
} from '@/features/screening/pages/screening/formatting';

type HistorySectionProps = {
  historyRuns: ScreeningRunSummary[];
  historyLoading: boolean;
  historyError: string;
  strategies: ScreeningStrategy[];
  loadHistory: () => Promise<void>;
  handleHistoryRunSelect: (runId: string) => Promise<void>;
};

export const HistorySection: React.FC<HistorySectionProps> = ({
  historyRuns,
  historyLoading,
  historyError,
  strategies,
  loadHistory,
  handleHistoryRunSelect,
}) => (
      <section className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-soft-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock3 className="h-4 w-4 text-cyan" />
            历史记录
          </div>
          <button
            type="button"
            className="text-xs font-medium text-cyan transition-colors hover:text-foreground"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
          >
            {historyLoading ? '加载中...' : '刷新'}
          </button>
        </div>
        {historyError ? (
          <p className="mb-3 text-xs text-danger">{historyError}</p>
        ) : null}
        {historyRuns.length === 0 ? (
          <p className="py-3 text-center text-xs text-secondary-text">
            {historyLoading ? '正在加载历史记录...' : '暂无历史选股记录'}
          </p>
        ) : (
          <div className="divide-y divide-border/70">
            {historyRuns.map((run) => (
              <button
                key={run.runId}
                type="button"
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-hover/50"
                onClick={() => void handleHistoryRunSelect(run.runId)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {formatHistoryStrategyName(run.strategy, strategies)}
                    <span className="ml-2 text-xs font-normal text-secondary-text">
                      {formatHistoryMarketLabel(run.market)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-secondary-text">
                    返回 {run.candidateCount ?? 0} 只
                    {run.snapshotCount != null ? ` · 快照 ${run.snapshotCount}` : ''}
                    {run.llmRanked ? ' · 智能重排' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-secondary-text">
                  {formatRunCreatedAt(run.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
);
