import type React from 'react';
import { Drawer } from '@/components/ui';
import { ReportMarkdownDrawer } from '@/features/dashboard/components/report/ReportMarkdownDrawer';
import { RunFlowPanel } from '@/features/dashboard/components/run-flow';
import type { AnalysisReport, ReportLanguage } from '@/types/analysis';
import type { UiTextKey, UiTextParams } from '@/i18n/uiText';
import type { RunFlowDrawerState } from '@/features/dashboard/pages/home/homeUtils';

type TranslateFn = (key: UiTextKey, params?: UiTextParams) => string;

type HomeDrawersProps = {
  t: TranslateFn;
  markdownDrawerOpen: boolean;
  selectedReport: AnalysisReport | null;
  reportLanguage: ReportLanguage;
  onCloseMarkdownDrawer: () => void;
  runFlowDrawer: RunFlowDrawerState;
  onCloseRunFlowDrawer: () => void;
};

export const HomeDrawers: React.FC<HomeDrawersProps> = ({
  t,
  markdownDrawerOpen,
  selectedReport,
  reportLanguage,
  onCloseMarkdownDrawer,
  runFlowDrawer,
  onCloseRunFlowDrawer,
}) => (
  <>
    {markdownDrawerOpen && selectedReport?.meta.id ? (
      <ReportMarkdownDrawer
        key={selectedReport.meta.id}
        recordId={selectedReport.meta.id}
        stockName={selectedReport.meta.stockName || ''}
        stockCode={selectedReport.meta.stockCode}
        reportLanguage={reportLanguage}
        onClose={onCloseMarkdownDrawer}
      />
    ) : null}

    {runFlowDrawer.open ? (
      <Drawer
        isOpen={runFlowDrawer.open}
        onClose={onCloseRunFlowDrawer}
        title={t('runFlow.drawerTitle')}
        width="max-w-[96vw]"
        zIndex={80}
      >
        <RunFlowPanel
          key={`${runFlowDrawer.source.type}-${runFlowDrawer.source.type === 'task' ? runFlowDrawer.source.taskId : runFlowDrawer.source.recordId}`}
          source={runFlowDrawer.source}
          title={runFlowDrawer.title}
        />
      </Drawer>
    ) : null}
  </>
);
