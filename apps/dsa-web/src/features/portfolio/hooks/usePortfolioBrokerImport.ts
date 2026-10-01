import { useCallback, useState } from 'react';
import type { ParsedApiError } from '@/api/error';
import { getParsedApiError } from '@/api/error';
import { portfolioApi } from '@/features/portfolio/api/portfolio';
import type {
  PortfolioImportBrokerItem,
  PortfolioImportCommitResponse,
  PortfolioImportParseResponse,
} from '@/features/portfolio/types/portfolio';
import { FALLBACK_BROKERS } from '@/features/portfolio/pages/portfolio/shared';

type UsePortfolioBrokerImportOptions = {
  onError: (error: ParsedApiError) => void;
  onWriteWarning: (message: string | null) => void;
};

export function usePortfolioBrokerImport({ onError, onWriteWarning }: UsePortfolioBrokerImportOptions) {
  const [brokers, setBrokers] = useState<PortfolioImportBrokerItem[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('huatai');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDryRun, setCsvDryRun] = useState(true);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvCommitting, setCsvCommitting] = useState(false);
  const [csvParseResult, setCsvParseResult] = useState<PortfolioImportParseResponse | null>(null);
  const [csvCommitResult, setCsvCommitResult] = useState<PortfolioImportCommitResponse | null>(null);
  const [brokerLoadWarning, setBrokerLoadWarning] = useState<string | null>(null);

  const loadBrokers = useCallback(async () => {
    try {
      const response = await portfolioApi.listImportBrokers();
      const brokerItems = response.brokers || [];
      if (brokerItems.length === 0) {
        setBrokers(FALLBACK_BROKERS);
        setBrokerLoadWarning('券商列表接口返回为空，已回退为内置券商列表（华泰/中信/招商）。');
        if (!FALLBACK_BROKERS.some((item) => item.broker === selectedBroker)) {
          setSelectedBroker(FALLBACK_BROKERS[0].broker);
        }
        return;
      }
      setBrokers(brokerItems);
      setBrokerLoadWarning(null);
      if (!brokerItems.some((item) => item.broker === selectedBroker)) {
        setSelectedBroker(brokerItems[0].broker);
      }
    } catch {
      setBrokers(FALLBACK_BROKERS);
      setBrokerLoadWarning('券商列表接口不可用，已回退为内置券商列表（华泰/中信/招商）。');
      if (!FALLBACK_BROKERS.some((item) => item.broker === selectedBroker)) {
        setSelectedBroker(FALLBACK_BROKERS[0].broker);
      }
    }
  }, [selectedBroker]);

  const handleParseCsv = async () => {
    if (!csvFile) return;
    try {
      setCsvParsing(true);
      const parsed = await portfolioApi.parseCsvImport(selectedBroker, csvFile);
      setCsvParseResult(parsed);
      setCsvCommitResult(null);
    } catch (err) {
      onError(getParsedApiError(err));
    } finally {
      setCsvParsing(false);
    }
  };

  const handleCommitCsv = async (
    writableAccountId: number | undefined,
    refreshPortfolioData: () => Promise<void>,
  ) => {
    if (!csvFile) return;
    if (!writableAccountId) {
      onWriteWarning('请先在右上角选择具体账户，再进行录入或导入提交。');
      return;
    }
    try {
      onWriteWarning(null);
      setCsvCommitting(true);
      const committed = await portfolioApi.commitCsvImport(writableAccountId, selectedBroker, csvFile, csvDryRun);
      setCsvCommitResult(committed);
      if (!csvDryRun) {
        await refreshPortfolioData();
      }
    } catch (err) {
      onError(getParsedApiError(err));
    } finally {
      setCsvCommitting(false);
    }
  };

  return {
    brokers,
    selectedBroker,
    setSelectedBroker,
    csvFile,
    setCsvFile,
    csvDryRun,
    setCsvDryRun,
    csvParsing,
    csvCommitting,
    csvParseResult,
    csvCommitResult,
    brokerLoadWarning,
    loadBrokers,
    handleParseCsv,
    handleCommitCsv,
  };
}
