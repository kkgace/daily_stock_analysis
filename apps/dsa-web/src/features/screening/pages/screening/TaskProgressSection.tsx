import type React from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { ScreeningCandidate, ScreeningScreenResponse } from '@/features/screening/api/screening';
import { MARKETS, formatPercent } from '@/features/screening/pages/screening/formatting';

type TaskProgressSectionProps = {
  loading: boolean;
  screenMeta: ScreeningScreenResponse | null;
  taskMessage: string;
  taskProgress: number;
  displayedStrategy: string;
  market: string;
  activeTaskId: string | null;
  candidates: ScreeningCandidate[];
};

export const TaskProgressSection: React.FC<TaskProgressSectionProps> = ({
  loading,
  screenMeta,
  taskMessage,
  taskProgress,
  displayedStrategy,
  market,
  activeTaskId,
  candidates,
}) => (
        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-soft-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <span className={`grid h-7 w-7 place-items-center rounded-full ${loading ? 'text-cyan' : 'text-success'}`}>
                {loading ? <CircleAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{loading ? '选股运行中' : '选股完成'}</h2>
                <p className="mt-1 text-xs text-secondary-text">
                  {loading
                    ? `${taskMessage || '正在执行选股'} · ${taskProgress}%`
                    : `${displayedStrategy} · ${MARKETS.find((item) => item.id === market)?.label}`}
                </p>
              </div>
            </div>
          </div>

          <details className="mt-3 border-t border-border/70 pt-3 text-xs text-secondary-text">
            <summary className="w-fit cursor-pointer font-medium text-secondary-text">运行详情</summary>
            <div className="mt-2 grid gap-1">
              <span>任务：{activeTaskId ? activeTaskId.slice(0, 12) : '-'}</span>
              <span>Run ID：{screenMeta?.runId || '-'}</span>
              <span>
                快照 {screenMeta?.snapshotCount ?? '-'} · 过滤后 {screenMeta?.afterFilterCount ?? '-'} · 候选 {screenMeta?.candidateCount ?? candidates.length}
              </span>
              <span>
                排序：{screenMeta?.llmRanked ? '智能重排' : screenMeta ? '确定性因子' : '-'}
                {screenMeta?.llmModelUsed ? ` · ${screenMeta.llmModelUsed}` : ''}
                {screenMeta?.llmCoverage != null ? ` · 覆盖 ${formatPercent(screenMeta.llmCoverage)}` : ''}
              </span>
              {screenMeta?.resultVariantPoolSize ? (
                <span>
                  候选差异：近分池 {screenMeta.resultVariantPoolSize} ·{' '}
                  {screenMeta.resultVariantApplied
                    ? `本次替换 ${screenMeta.resultVariantRotatedSlots ?? 0} 位`
                    : '本次保持基准'}
                </span>
              ) : null}
              <span>
                深度补充：{screenMeta?.dsaEnrichment?.enrichedCount ?? '-'} / {screenMeta?.dsaEnrichment?.requestedCount ?? '-'}
              </span>
            </div>
          </details>
        </section>
);
