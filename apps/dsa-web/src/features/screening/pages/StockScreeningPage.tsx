import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PlusCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  screeningApi,
  type ScreeningCandidate,
  type ScreeningHotspotDetail,
  type ScreeningStrategy,
} from '@/features/screening/api/screening';
import { AppPage, Button, InlineAlert } from '@/components/ui';
import { formatStrategyCategory } from '@/features/screening/pages/screening/formatting';
import {
  getScreenMessages,
} from '@/features/screening/pages/screening/screenMessages';
import { useScreeningHotspots } from '@/features/screening/hooks/useScreeningHotspots';
import { useScreeningTask } from '@/features/screening/hooks/useScreeningTask';
import { ScreenAlertMessage } from '@/features/screening/pages/screening/ScreenAlertMessage';
import { HotspotsSection } from '@/features/screening/pages/screening/HotspotsSection';
import { ScreeningControls } from '@/features/screening/pages/screening/ScreeningControls';
import { TaskProgressSection } from '@/features/screening/pages/screening/TaskProgressSection';
import { CandidatesSection } from '@/features/screening/pages/screening/CandidatesSection';
import { HistorySection } from '@/features/screening/pages/screening/HistorySection';
import {
  readPersistedScreenTask,
  type PersistedScreenTask,
} from '@/features/screening/pages/screening/screenTaskPersistence';


const StockScreeningPage: React.FC = () => {
  const navigate = useNavigate();
  const [restoredTask] = useState<PersistedScreenTask | null>(() => readPersistedScreenTask());

  const {
    hotspots,
    hotspotsUpdatedAt,
    hotspotsExpanded,
    selectedHotspotTopic,
    hotspotDetail,
    loadingHotspotDetail,
    searchingHotspotNews,
    hotspotDetailError,
    loadingHotspots,
    hotspotError,
    selectedHotspot,
    loadHotspotDetail,
    loadHotspots,
    handleHotspotSelect,
    toggleHotspotsExpanded,
  } = useScreeningHotspots();
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [market, setMarket] = useState(restoredTask?.market || 'cn');
  const [strategy, setStrategy] = useState(restoredTask?.strategy || 'dual_low');
  const [strategies, setStrategies] = useState<ScreeningStrategy[]>([]);
  const [maxResults, setMaxResults] = useState(restoredTask?.maxResults || 3);
  const [enabling, setEnabling] = useState(false);
  // 标记当前 strategy 是否来自历史 run（刷新自动恢复或手动历史选择）的上下文同步。
  // 为 true 时 loadStrategies 跳过“不在列表则回退第一项”的归一化，
  // 防止迟到的 /strategies 响应把历史上下文改写回默认策略。
  const historyContextStrategyRef = useRef(false);
  const {
    candidates,
    screenMeta,
    expandedCode,
    setExpandedCode,
    loading,
    error,
    setError,
    activeTaskId,
    taskProgress,
    taskMessage,
    historyRuns,
    historyLoading,
    historyError,
    loadHistory,
    handleHistoryRunSelect,
    clearScreeningResults,
    handleSubmit,
  } = useScreeningTask({
    restoredTask,
    market,
    strategy,
    maxResults,
    setMarket,
    setStrategy,
    historyContextStrategyRef,
  });

  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [strategyLoadError, setStrategyLoadError] = useState('');

  const selectedStrategy = useMemo(() => strategies.find((item) => item.id === strategy), [strategies, strategy]);
  const selectedStrategyTitle = selectedStrategy?.name || selectedStrategy?.title || '自定义策略';
  const selectedStrategyTag = formatStrategyCategory(
    selectedStrategy?.category || selectedStrategy?.tag || selectedStrategy?.tags?.[0],
  );
  const displayedStrategy = selectedStrategy ? selectedStrategyTitle : `自定义策略 (${strategy})`;
  const screenMessages = useMemo(() => getScreenMessages(screenMeta), [screenMeta]);
  const factorRanking = Boolean(screenMeta && (screenMeta.rankingMode === 'factor' || screenMeta.llmRanked === false));
  const llmFailed = Boolean(factorRanking && screenMeta?.llmFailureReason);
  const alertMessages = llmFailed
    ? screenMessages.length > 0
      ? screenMessages
      : ['智能重排未完成，当前候选继续使用确定性因子评分。']
    : screenMessages;
  const isScreeningEnabled = enabled && available;
  const statusText = isScreeningEnabled ? '选股已开启' : '选股未开启';

  const loadStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      setStrategyLoadError('');
      const result = await screeningApi.getStrategies();
      const loadedStrategies = result.strategies || [];
      setStrategies(loadedStrategies);
      // 历史 run 的自定义/下线策略不在当前列表属预期行为，不做“回退第一项”的归一化，
      // 否则迟到的策略列表会把刚恢复好的上下文改写回默认策略。
      if (loadedStrategies.length > 0 && !historyContextStrategyRef.current) {
        setStrategy((currentStrategy) =>
          loadedStrategies.some((item) => item.id === currentStrategy) ? currentStrategy : loadedStrategies[0].id,
        );
      }
    } catch (err) {
      setStrategies([]);
      setStrategyLoadError(err instanceof Error ? err.message : '策略列表加载失败');
    } finally {
      setLoadingStrategies(false);
    }
  }, []);

  const handleAnalyzeHotspotStock = useCallback((stock: ScreeningHotspotDetail['stocks'][number]) => {
    const stockCode = String(stock.code || '').trim();
    if (!stockCode) {
      return;
    }
    const stockName = String(stock.name || stockCode).trim();
    navigate('/', {
      state: {
        stockCode,
        stockName,
        autoAnalyze: true,
        selectionSource: 'screening_hotspot',
        skills: ['hot_theme'],
      },
    });
  }, [navigate]);

  const handleAnalyzeCandidate = useCallback((candidate: ScreeningCandidate) => {
    const stockCode = String(candidate.code || '').trim();
    if (!stockCode) {
      return;
    }
    const stockName = String(candidate.name || stockCode).trim();
    const analysisSkills = (selectedStrategy?.analysisSkills || []).filter(Boolean);
    navigate('/', {
      state: {
        stockCode,
        stockName,
        autoAnalyze: true,
        selectionSource: 'screening_result',
        ...(analysisSkills.length > 0 ? { skills: analysisSkills } : {}),
      },
    });
  }, [navigate, selectedStrategy]);

  useEffect(() => {
    let active = true;
    screeningApi
      .getStatus()
      .then((status) => {
        if (!active) {
          return;
        }
        setEnabled(status.enabled);
        setAvailable(status.available);
        if (status.enabled && status.available) {
          void loadStrategies();
          void loadHotspots(false);
          void loadHistory();
        }
      })
      .catch(() => {
        if (active) {
          setEnabled(false);
          setAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadHotspots, loadStrategies]);

  const handleEnable = async () => {
    setEnabling(true);
    setError('');
    try {
      await screeningApi.enable();
      setEnabled(true);
      setAvailable(true);
      await loadStrategies();
    } catch (err) {
      try {
        const status = await screeningApi.getStatus();
        setEnabled(status.enabled);
        setAvailable(status.available);
      } catch {
        setEnabled(false);
        setAvailable(false);
      }
      setError(err instanceof Error ? err.message : '开启选股失败');
    } finally {
      setEnabling(false);
    }
  };

  const handleStrategyChange = (nextStrategy: string) => {
    if (nextStrategy !== strategy) {
      clearScreeningResults();
    }
    setStrategy(nextStrategy);
  };

  const handleMarketChange = (nextMarket: string) => {
    if (nextMarket !== market) {
      clearScreeningResults();
    }
    setMarket(nextMarket);
  };

  const handleMaxResultsChange = (nextMaxResults: number) => {
    if (nextMaxResults !== maxResults) {
      clearScreeningResults();
    }
    setMaxResults(nextMaxResults);
  };

  return (
    <AppPage className="max-w-6xl space-y-6 pb-12 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-cyan text-cyan shadow-[0_0_24px_hsl(var(--primary)/0.18)]">
            <PlusCircle className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-normal text-foreground">选股</h1>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-border/70 bg-card/80 px-4 py-2 text-sm shadow-soft-card">
          <span className={`h-2.5 w-2.5 rounded-full ${isScreeningEnabled ? 'bg-success' : 'bg-warning'}`} />
          <span className="font-medium text-secondary-text">{statusText}</span>
        </div>
      </div>

      {!enabled ? (
        <InlineAlert
          variant="info"
          title="选股未开启"
          message="开启后即可运行选股策略。"
          action={
            <Button size="sm" isLoading={enabling} loadingText="开启中..." onClick={() => void handleEnable()}>
              开启选股
            </Button>
          }
        />
      ) : null}

      {enabled && !available ? (
        <InlineAlert
          variant="warning"
          title="选股功能不可用"
          message="请检查后端日志、策略文件和基础数据依赖后重启服务。"
        />
      ) : null}

      {error ? <InlineAlert variant="danger" title="调用失败" message={error} /> : null}


      <HotspotsSection
        isScreeningEnabled={isScreeningEnabled}
        hotspots={hotspots}
        hotspotsUpdatedAt={hotspotsUpdatedAt}
        hotspotsExpanded={hotspotsExpanded}
        hotspotError={hotspotError}
        loadingHotspots={loadingHotspots}
        selectedHotspotTopic={selectedHotspotTopic}
        selectedHotspot={selectedHotspot}
        hotspotDetail={hotspotDetail}
        loadingHotspotDetail={loadingHotspotDetail}
        searchingHotspotNews={searchingHotspotNews}
        hotspotDetailError={hotspotDetailError}
        toggleHotspotsExpanded={toggleHotspotsExpanded}
        loadHotspots={loadHotspots}
        handleHotspotSelect={handleHotspotSelect}
        loadHotspotDetail={loadHotspotDetail}
        handleAnalyzeHotspotStock={handleAnalyzeHotspotStock}
      />

      <ScreeningControls
        selectedStrategyTag={selectedStrategyTag}
        market={market}
        strategy={strategy}
        maxResults={maxResults}
        strategies={strategies}
        selectedStrategy={selectedStrategy}
        loadingStrategies={loadingStrategies}
        strategyLoadError={strategyLoadError}
        loading={loading}
        isScreeningEnabled={isScreeningEnabled}
        handleMarketChange={handleMarketChange}
        handleStrategyChange={handleStrategyChange}
        handleMaxResultsChange={handleMaxResultsChange}
        handleSubmit={handleSubmit}
      />

      {loading || screenMeta ? (
        <TaskProgressSection
          loading={loading}
          screenMeta={screenMeta}
          taskMessage={taskMessage}
          taskProgress={taskProgress}
          displayedStrategy={displayedStrategy}
          market={market}
          activeTaskId={activeTaskId}
          candidates={candidates}
        />
      ) : null}

      {screenMeta && alertMessages.length > 0 ? (
        <InlineAlert
          variant={llmFailed ? 'warning' : 'info'}
          title={llmFailed ? '当前使用因子排序' : '选股提示'}
          message={<ScreenAlertMessage messages={alertMessages} />}
        />
      ) : null}

      {screenMeta ? (
        <CandidatesSection
          candidates={candidates}
          factorRanking={factorRanking}
          expandedCode={expandedCode}
          setExpandedCode={setExpandedCode}
          handleAnalyzeCandidate={handleAnalyzeCandidate}
        />
      ) : null}

      <HistorySection
        historyRuns={historyRuns}
        historyLoading={historyLoading}
        historyError={historyError}
        strategies={strategies}
        loadHistory={loadHistory}
        handleHistoryRunSelect={handleHistoryRunSelect}
      />
    </AppPage>
  );
};

export default StockScreeningPage;
