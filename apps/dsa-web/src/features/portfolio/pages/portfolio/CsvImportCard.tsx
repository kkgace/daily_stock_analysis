import type React from 'react';
import { Card, InlineAlert } from '@/components/ui';
import type {
  PortfolioImportBrokerItem,
  PortfolioImportCommitResponse,
  PortfolioImportParseResponse,
} from '@/features/portfolio/types/portfolio';
import {
  formatBrokerLabel,
  getCsvCommitVariant,
  getCsvParseVariant,
} from '@/features/portfolio/utils/portfolioFormat';
import { PORTFOLIO_FILE_PICKER_CLASS, PORTFOLIO_SELECT_CLASS } from './shared';

type CsvImportCardProps = {
  brokers: PortfolioImportBrokerItem[];
  selectedBroker: string;
  onSelectedBrokerChange: (broker: string) => void;
  csvFile: File | null;
  onCsvFileChange: (file: File | null) => void;
  csvDryRun: boolean;
  onCsvDryRunChange: (dryRun: boolean) => void;
  csvParsing: boolean;
  csvCommitting: boolean;
  csvParseResult: PortfolioImportParseResponse | null;
  csvCommitResult: PortfolioImportCommitResponse | null;
  brokerLoadWarning: string | null;
  writableAccountId: number | undefined;
  onParseCsv: () => void;
  onCommitCsv: () => void;
};

export const CsvImportCard: React.FC<CsvImportCardProps> = ({
  brokers,
  selectedBroker,
  onSelectedBrokerChange,
  csvFile,
  onCsvFileChange,
  csvDryRun,
  onCsvDryRunChange,
  csvParsing,
  csvCommitting,
  csvParseResult,
  csvCommitResult,
  brokerLoadWarning,
  writableAccountId,
  onParseCsv,
  onCommitCsv,
}) => (
  <Card padding="md">
    <h3 className="text-sm font-semibold text-foreground mb-3">券商 CSV 导入</h3>
    <div className="space-y-2">
      {brokerLoadWarning ? (
        <InlineAlert
          variant="warning"
          className="rounded-lg px-2 py-1 text-xs shadow-none"
          message={brokerLoadWarning}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <select className={PORTFOLIO_SELECT_CLASS} value={selectedBroker} onChange={(e) => onSelectedBrokerChange(e.target.value)}>
          {brokers.length > 0 ? (
            brokers.map((item) => <option key={item.broker} value={item.broker}>{formatBrokerLabel(item.broker, item.displayName)}</option>)
          ) : (
            <option value="huatai">huatai（华泰）</option>
          )}
        </select>
        <label className={PORTFOLIO_FILE_PICKER_CLASS}>
          选择 CSV
          <input type="file" accept=".csv" className="hidden"
            onChange={(e) => onCsvFileChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
        </label>
      </div>
      <div className="flex items-center gap-2 text-xs text-secondary">
        <input id="csv-dry-run" type="checkbox" checked={csvDryRun} onChange={(e) => onCsvDryRunChange(e.target.checked)} />
        <label htmlFor="csv-dry-run">仅预演（不写入）</label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" disabled={!csvFile || csvParsing} onClick={onParseCsv}>
          {csvParsing ? '解析中...' : '解析文件'}
        </button>
        <button type="button" className="btn-secondary flex-1"
          disabled={!csvFile || !writableAccountId || csvCommitting} onClick={onCommitCsv}>
          {csvCommitting ? '提交中...' : '提交导入'}
        </button>
      </div>
      {csvParseResult ? (
        <InlineAlert
          variant={getCsvParseVariant(csvParseResult)}
          title="CSV 解析结果"
          message={`有效 ${csvParseResult.recordCount} 条，跳过 ${csvParseResult.skippedCount} 条，错误 ${csvParseResult.errorCount} 条。`}
          className="rounded-lg px-3 py-2 text-xs shadow-none"
        />
      ) : null}
      {csvCommitResult ? (
        <InlineAlert
          variant={getCsvCommitVariant(csvCommitResult, csvDryRun)}
          title={csvDryRun ? 'CSV 预演结果' : 'CSV 提交结果'}
          message={`${csvDryRun ? '预演检查' : '实际写入'}：写入 ${csvCommitResult.insertedCount} 条，重复 ${csvCommitResult.duplicateCount} 条，失败 ${csvCommitResult.failedCount} 条。`}
          className="rounded-lg px-3 py-2 text-xs shadow-none"
        />
      ) : null}
    </div>
  </Card>
);
