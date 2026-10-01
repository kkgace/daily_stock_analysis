import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { agentApi } from '@/api/agent';
import { systemConfigApi } from '@/features/settings/api/systemConfig';
import { ConfirmDialog } from '@/components/ui';
import { createParsedApiError, getParsedApiError } from '@/api/error';
import type { AgentStatusResponse, SkillInfo } from '@/api/agent';
import {
  useAgentChatStore,
  type Message,
} from '@/features/chat/stores/agentChatStore';
import { downloadSession, formatSessionAsMarkdown } from '@/features/chat/utils/chatExport';
import { ChatHeader } from '@/features/chat/pages/chat/ChatHeader';
import { MessageList } from '@/features/chat/pages/chat/MessageList';
import { SessionSidebar } from '@/features/chat/pages/chat/SessionSidebar';
import { ChatComposer } from '@/features/chat/pages/chat/ChatComposer';
import type { ChatFollowUpContext } from '@/features/chat/utils/chatFollowUp';
import {
  buildFollowUpPrompt,
  parseFollowUpRecordId,
  resolveChatFollowUpContext,
  sanitizeFollowUpStockCode,
  sanitizeFollowUpStockName,
} from '@/features/chat/utils/chatFollowUp';
import { isNearBottom } from '@/features/chat/utils/chatScroll';
import { getReportText } from '@/utils/reportLanguage';
import { extractStockCodesFromMessage } from '@/features/chat/utils/chatStockCode';
import {
  findMatchingStockCode,
  includesStockCode,
  normalizeStockCode,
  resolveRegisteredIndexCanonical,
} from '@/utils/stockCode';
import { useStockIndex } from '@/hooks/useStockIndex';
import type { StockIndexItem } from '@/types/stockIndex';
import { useUiLanguage } from '@/contexts/UiLanguageContext';

// Quick question examples shown on empty state
type ActiveStockContext = Pick<ChatFollowUpContext, 'stock_code' | 'stock_name'>;

const QUICK_QUESTIONS: Array<{
  label: string;
  skill: string;
  stockContext?: ActiveStockContext;
}> = [
  { label: '用缠论分析茅台', skill: 'chan_theory', stockContext: { stock_code: '600519', stock_name: '贵州茅台' } },
  { label: '波浪理论看宁德时代', skill: 'wave_theory', stockContext: { stock_code: '300750', stock_name: '宁德时代' } },
  { label: '分析比亚迪趋势', skill: 'bull_trend', stockContext: { stock_code: '002594', stock_name: '比亚迪' } },
  { label: '用箱体震荡分析 A 股中芯国际 688981', skill: 'box_oscillation', stockContext: { stock_code: '688981', stock_name: '中芯国际' } },
  { label: '分析腾讯 hk00700', skill: 'bull_trend', stockContext: { stock_code: 'HK00700', stock_name: '腾讯控股' } },
  { label: '用情绪周期分析东方财富', skill: 'emotion_cycle', stockContext: { stock_code: '300059', stock_name: '东方财富' } },
];

const MAX_SELECTED_SKILLS = 3;
const CONTEXT_COMPRESSION_CONFIG_KEY = 'AGENT_CONTEXT_COMPRESSION_ENABLED';
const STRONG_COMPARE_STOCK_MESSAGE_RE = /比较|对比|\bvs\b|和[^，。,.!?！？]{0,40}比/i;
const WEAK_COMPARE_STOCK_MESSAGE_RE = /差异(?!化)|区别|不同|相比|对照|比一比/;
const CHOICE_COMPARE_STOCK_MESSAGE_RE = /哪个|哪只|哪一个|谁更|更值得|更适合|怎么选|选哪|二选一/;
const LINKED_COMPARE_STOCK_MESSAGE_RE = /(?:和|与|跟|同)[^，。,.!?！？]{0,40}(?:差异(?!化)|区别|不同|相比|对照|比一比)/;
const SWITCH_STOCK_MESSAGE_RE = /换成|改看|分析|看看|研究|诊断/;

type ActiveStockResolution = {
  context: ActiveStockContext;
  useForCurrentSend: boolean;
};

const resolveUniqueStockNameContext = (
  message: string,
  index: StockIndexItem[],
): ActiveStockContext | null => {
  const normalizedMessage = message.trim().toLocaleLowerCase();
  if (!normalizedMessage) return null;

  const matches = new Map<string, ActiveStockContext>();
  for (const item of index) {
    if (!item.active) continue;
    const terms = [item.nameZh, item.nameEn, ...(item.aliases || [])]
      .map((term) => term?.trim())
      .filter((term): term is string => Boolean(term))
      .filter((term) => /[\u3400-\u9fff]/.test(term) ? term.length >= 2 : term.length >= 3);
    if (!terms.some((term) => normalizedMessage.includes(term.toLocaleLowerCase()))) {
      continue;
    }
    // Index canonical codes (sh000001 / csi930955) must be preserved verbatim —
    // normalizeStockCode would strip the exchange prefix and collide with a
    // same-digit stock (sh000001 → 000001 vs 平安银行 000001).
    const stockCode = item.assetType === 'index'
      ? item.canonicalCode
      : normalizeStockCode(item.canonicalCode);
    matches.set(stockCode, { stock_code: stockCode, stock_name: item.nameZh || null });
  }

  return matches.size === 1 ? [...matches.values()][0] : null;
};

/**
 * Determine whether an active stock code resolves to a registered index.
 *
 * Only an exact registry canonical/display/explicit-alias hit counts; bare
 * same-digit stocks must never be typed as indexes through normalization or
 * prefix guessing. Stock-only watchlist actions are hidden for these matches.
 */
const isRegisteredIndexCanonicalCode = (
  code: string | null,
  index: StockIndexItem[],
): boolean => {
  if (!code) return false;
  return resolveRegisteredIndexCanonical(index, code) !== null;
};



// Comparison identity key: registry canonical first (so an index context keeps
// its lowercase canonical and never normalizes into the bare same-code stock),
// then the stock normalization fallback. Never guesses index types from prefixes.
const resolveComparisonStockKey = (
  code: string | null | undefined,
  index: StockIndexItem[],
): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return resolveRegisteredIndexCanonical(index, trimmed) ?? normalizeStockCode(trimmed);
};

const isCompareStockMessage = (
  message: string,
  stockCodes: string[],
  currentStockKey?: string | null,
): boolean => {
  if (STRONG_COMPARE_STOCK_MESSAGE_RE.test(message)) {
    return true;
  }
  const current = currentStockKey ?? null;
  const newStockCodes = current
    ? stockCodes.filter((code) => code !== current)
    : stockCodes;
  if (newStockCodes.length >= 2) {
    return true;
  }
  if (CHOICE_COMPARE_STOCK_MESSAGE_RE.test(message) && stockCodes.length >= 2) {
    return true;
  }
  if (!WEAK_COMPARE_STOCK_MESSAGE_RE.test(message)) {
    return false;
  }
  if (stockCodes.length >= 2) {
    return true;
  }
  if (!currentStockKey) {
    return false;
  }
  const hasNewStock = stockCodes.some((code) => code !== current);
  return hasNewStock && LINKED_COMPARE_STOCK_MESSAGE_RE.test(message);
};

const resolveActiveStockContextFromMessage = (
  message: string,
  currentContext: ActiveStockContext | null,
  index: StockIndexItem[],
): ActiveStockResolution | null => {
  const stockCodes = extractStockCodesFromMessage(message, index);
  const stockCode = stockCodes[0] ?? null;
  if (!stockCode) {
    return null;
  }

  // Registry-first identity keys so an index context (sh000016) is never
  // folded with the bare same-code stock when comparing or switching.
  const currentStockKey = resolveComparisonStockKey(currentContext?.stock_code, index);
  const isCompare = isCompareStockMessage(message, stockCodes, currentStockKey);
  const isSwitch = SWITCH_STOCK_MESSAGE_RE.test(message);
  const newStockCodes = currentStockKey
    ? stockCodes.filter((code) => code !== currentStockKey)
    : stockCodes;
  // Explicit switches can mention the old stock; use the single new code when present.
  const targetStockCode = isSwitch && newStockCodes.length === 1
    ? newStockCodes[0]
    : stockCode;
  const isDifferentStock = currentStockKey !== resolveComparisonStockKey(targetStockCode, index);

  // Compare messages and implicit follow-ups must not rewrite the active stock context.
  if (isCompare || (currentContext && !isSwitch)) {
    return null;
  }

  return {
    context: {
      stock_code: targetStockCode,
      stock_name: currentContext && !isDifferentStock
        ? currentContext.stock_name
        : null,
    },
    // Only explicit switches should affect the context sent with the current request.
    useForCurrentSend: isSwitch && isDifferentStock,
  };
};

const restoreActiveStockContextFromMessages = (
  messages: Message[],
  index: StockIndexItem[],
): ActiveStockContext | null => {
  let restoredContext: ActiveStockContext | null = null;
  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }
    const resolution = resolveActiveStockContextFromMessage(message.content, restoredContext, index);
    if (resolution) {
      restoredContext = resolution.context;
    }
  }
  return restoredContext;
};

const ChatPage: React.FC = () => {
  const { t } = useUiLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [defaultSkillIds, setDefaultSkillIds] = useState<string[]>([]);
  const [showSkillDesc, setShowSkillDesc] = useState<string | null>(null);
  const [mobileSkillPickerOpen, setMobileSkillPickerOpen] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [isFollowUpContextLoading, setIsFollowUpContextLoading] = useState(false);
  const [sendToast, setSendToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [contextCompressionEnabled, setContextCompressionEnabled] = useState(false);
  const [contextCompressionLoaded, setContextCompressionLoaded] = useState(false);
  const [contextCompressionSaving, setContextCompressionSaving] = useState(false);
  const [contextCompressionConfigVersion, setContextCompressionConfigVersion] = useState('');
  const [contextCompressionMaskToken, setContextCompressionMaskToken] = useState('******');
  const [contextCompressionError, setContextCompressionError] = useState<string | null>(null);
  const [copiedMessages, setCopiedMessages] = useState<Set<string>>(new Set());
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([]);
  const [isWatchlistActioning, setIsWatchlistActioning] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<string | null>(null);
  const [activeStockCode, setActiveStockCode] = useState<string | null>(null);
  const [activeStockContext, setActiveStockContext] = useState<ActiveStockContext | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatusResponse | null>(null);
  const [agentStatusError, setAgentStatusError] = useState<string | null>(null);
  const [agentStatusChecking, setAgentStatusChecking] = useState(true);
  // All Chat backends need the registry before resolving stock identity.
  const { index: stockIndex, loading: stockIndexLoading } = useStockIndex();

  const watchlistMessageTimerRef = useRef<number | null>(null);
  const copyResetTimerRef = useRef<Partial<Record<string, number>>>({});
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const sendToastTimerRef = useRef<number | null>(null);
  const followUpHydrationTokenRef = useRef(0);
  const followUpContextRef = useRef<ChatFollowUpContext | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('auto');
  const agentStatusRequestIdRef = useRef(0);

  // Get localized text (default to Chinese)
  const text = getReportText('zh');

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = copyResetTimerRef.current;
    return () => {
      if (sendToastTimerRef.current !== null) {
        window.clearTimeout(sendToastTimerRef.current);
      }
      Object.values(timers).forEach((timerId) => {
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
        }
      });
    };
  }, []);

  // Set page title
  useEffect(() => {
    document.title = '问股 - DSA';
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const codes = await systemConfigApi.getWatchlist();
      if (isMountedRef.current) {
        setWatchlistCodes(codes);
      }
    } catch {
      // ignore error silently
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  const stockInWatchlist = useCallback(
    (stockCode: string) => includesStockCode(watchlistCodes, stockCode),
    [watchlistCodes],
  );

  const handleToggleWatchlist = useCallback(
    async (stockCode: string) => {
      if (!stockCode || isWatchlistActioning) return;
      setIsWatchlistActioning(true);
      setWatchlistMessage(null);
      try {
        const existingStockCode = findMatchingStockCode(watchlistCodes, stockCode);
        if (existingStockCode) {
          const codes = await systemConfigApi.removeFromWatchlist(existingStockCode);
          if (isMountedRef.current) {
            setWatchlistCodes(codes);
            setWatchlistMessage(`已从自选中移除 ${stockCode}`);
          }
        } else {
          const codes = await systemConfigApi.addToWatchlist(stockCode);
          if (isMountedRef.current) {
            setWatchlistCodes(codes);
            setWatchlistMessage(`已加入自选 ${stockCode}`);
          }
        }
      } catch {
        if (isMountedRef.current) {
          setWatchlistMessage('操作失败，请重试');
        }
      } finally {
        if (isMountedRef.current) {
          setIsWatchlistActioning(false);
          if (watchlistMessageTimerRef.current !== null) {
            window.clearTimeout(watchlistMessageTimerRef.current);
          }
          watchlistMessageTimerRef.current = window.setTimeout(() => {
            if (isMountedRef.current) {
              setWatchlistMessage(null);
            }
          }, 3000);
        }
      }
    },
    [isWatchlistActioning, watchlistCodes],
  );

  const {
    messages,
    selectedSkillIds: sessionSelectedSkillIds,
    loading,
    progressSteps,
    sessionId,
    sessions,
    sessionsLoading,
    chatError,
    stopping,
    terminalStatus,
    stopError,
    setSelectedSkillIds,
    loadSessions,
    loadInitialSession,
    switchSession,
    stopStream,
    startStream,
    clearCompletionBadge,
  } = useAgentChatStore();
  const selectedSkillIds = sessionSelectedSkillIds ?? defaultSkillIds;

  useEffect(() => {
    if (activeStockContext || messages.length === 0) {
      return;
    }
    if (stockIndexLoading) {
      return;
    }
    const restoredContext = restoreActiveStockContextFromMessages(messages, stockIndex);
    if (!restoredContext) {
      return;
    }
    setActiveStockContext(restoredContext);
    setActiveStockCode(restoredContext.stock_code);
  }, [activeStockContext, messages, sessionId, stockIndex, stockIndexLoading]);

  const syncScrollState = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const nearBottom = isNearBottom({
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToBottom((prev) => (nearBottom ? false : prev));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const requestScrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    shouldStickToBottomRef.current = true;
    pendingScrollBehaviorRef.current = behavior;
    setShowJumpToBottom(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, sessionId]);

  useEffect(() => {
    const behavior = pendingScrollBehaviorRef.current;
    const shouldAutoScroll = shouldStickToBottomRef.current;
    if (!shouldAutoScroll) {
      if (messages.length > 0 || progressSteps.length > 0 || loading) {
        setShowJumpToBottom(true);
      }
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      pendingScrollBehaviorRef.current = loading ? 'auto' : 'smooth';
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, progressSteps, loading, sessionId, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      pendingScrollBehaviorRef.current = 'smooth';
    }
  }, [loading]);

  useEffect(() => {
    clearCompletionBadge();
  }, [clearCompletionBadge]);

  useEffect(() => {
    loadInitialSession();
  }, [loadInitialSession]);

  useEffect(() => {
    agentApi.getSkills()
      .then((res) => {
        setSkills(res.skills);
        const defaultId =
          res.default_skill_id ||
          res.skills[0]?.id ||
          '';
        setDefaultSkillIds(defaultId ? [defaultId] : []);
      })
      .catch((error) => {
        console.error('Failed to load chat skills:', error);
      });
  }, []);

  const loadAgentStatus = useCallback(async () => {
    const requestId = agentStatusRequestIdRef.current + 1;
    agentStatusRequestIdRef.current = requestId;
    setAgentStatusChecking(true);
    try {
      const status = await agentApi.getStatus();
      if (!isMountedRef.current || agentStatusRequestIdRef.current !== requestId) return;
      setAgentStatus(status);
      setAgentStatusError(null);
    } catch (error: unknown) {
      if (!isMountedRef.current || agentStatusRequestIdRef.current !== requestId) return;
      setAgentStatus(null);
      setAgentStatusError(getParsedApiError(error).message);
    } finally {
      if (isMountedRef.current && agentStatusRequestIdRef.current === requestId) {
        setAgentStatusChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAgentStatus();
  }, [loadAgentStatus]);

  useEffect(() => {
    let active = true;

    void systemConfigApi.getConfig(false)
      .then((config) => {
        if (!active) {
          return;
        }
        const enabledItem = config.items.find((item) => item.key === CONTEXT_COMPRESSION_CONFIG_KEY);
        setContextCompressionEnabled(String(enabledItem?.value ?? '').trim().toLowerCase() === 'true');
        setContextCompressionConfigVersion(config.configVersion);
        setContextCompressionMaskToken(config.maskToken || '******');
        setContextCompressionLoaded(true);
        setContextCompressionError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const parsed = getParsedApiError(error);
        setContextCompressionLoaded(false);
        setContextCompressionError(parsed.message || '无法读取上下文压缩配置');
        console.error('Failed to load context compression setting:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateContextCompressionEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!contextCompressionLoaded || contextCompressionSaving) {
        return;
      }

      const previousEnabled = contextCompressionEnabled;
      setContextCompressionEnabled(nextEnabled);
      setContextCompressionSaving(true);
      setContextCompressionError(null);

      try {
        const result = await systemConfigApi.update({
          configVersion: contextCompressionConfigVersion,
          maskToken: contextCompressionMaskToken,
          reloadNow: true,
          items: [
            {
              key: CONTEXT_COMPRESSION_CONFIG_KEY,
              value: nextEnabled ? 'true' : 'false',
            },
          ],
        });
        setContextCompressionConfigVersion(result.configVersion || contextCompressionConfigVersion);
      } catch (error) {
        const parsed = getParsedApiError(error);
        setContextCompressionEnabled(previousEnabled);
        setContextCompressionError(parsed.message || '上下文压缩设置保存失败');
      } finally {
        setContextCompressionSaving(false);
      }
    },
    [
      contextCompressionConfigVersion,
      contextCompressionEnabled,
      contextCompressionLoaded,
      contextCompressionMaskToken,
      contextCompressionSaving,
    ],
  );

  const availableSkillIds = new Set(skills.map((skill) => skill.id));
  const quickQuestions = QUICK_QUESTIONS.filter((question) => availableSkillIds.size === 0 || availableSkillIds.has(question.skill));
  const selectedSkillIdSet = useMemo(() => new Set(selectedSkillIds), [selectedSkillIds]);
  const skillLimitReached = selectedSkillIds.length >= MAX_SELECTED_SKILLS;
  const selectedSkillSummary = useMemo(() => {
    if (selectedSkillIds.length === 0) return '通用分析';
    const nameById = new Map(skills.map((skill) => [skill.id, skill.name]));
    return selectedSkillIds.map((id) => nameById.get(id) || id).join('、');
  }, [selectedSkillIds, skills]);

  const toggleSkillSelection = useCallback((skillId: string) => {
    setSelectedSkillIds(
      selectedSkillIdSet.has(skillId)
        ? selectedSkillIds.filter((id) => id !== skillId)
        : selectedSkillIds.length >= MAX_SELECTED_SKILLS
          ? selectedSkillIds
          : [...selectedSkillIds, skillId],
    );
  }, [selectedSkillIdSet, selectedSkillIds, setSelectedSkillIds]);

  const toggleThinking = useCallback((msgId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  const showSendFeedback = useCallback((
    nextToast: { type: 'success' | 'error'; message: string },
    durationMs: number,
  ) => {
    if (sendToastTimerRef.current !== null) {
      window.clearTimeout(sendToastTimerRef.current);
    }
    setSendToast(nextToast);
    sendToastTimerRef.current = window.setTimeout(() => {
      setSendToast(null);
      sendToastTimerRef.current = null;
    }, durationMs);
  }, []);

  const copyMessageToClipboard = useCallback(async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessages((prev) => new Set(prev).add(msgId));
      const existing = copyResetTimerRef.current[msgId];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      copyResetTimerRef.current[msgId] = window.setTimeout(() => {
        setCopiedMessages((prev) => {
          const next = new Set(prev);
          next.delete(msgId);
          return next;
        });
        delete copyResetTimerRef.current[msgId];
      }, 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  }, []);

  const downloadMessageAsMarkdown = useCallback((msg: Message) => {
    downloadSession([msg]);
  }, []);

  const agentAvailable = !agentStatusChecking && !agentStatusError && (agentStatus ? agentStatus.available !== false : true);
  const agentUnavailableError = agentStatus && agentStatus.available === false
    ? createParsedApiError({
        title: t('chat.agentBackendUnavailableTitle'),
        message: agentStatus.backend === 'codex_app_server'
          ? t('chat.codexUnavailableMessage')
          : t('chat.defaultUnavailableMessage'),
        category: 'agent_disabled',
      })
    : null;

  const handleSend = useCallback(async (override?: { message?: string; context?: ActiveStockContext; skills?: string[] }) => {
    const message = (override?.message ?? input).trim();
    if (!message || loading || stockIndexLoading || !agentAvailable || agentStatusChecking) {
      return;
    }

    const explicitContext = override?.context ?? null;
    const resolution = explicitContext
      ? null
      : (
          resolveActiveStockContextFromMessage(message, activeStockContext, stockIndex)
          ?? (() => {
            const named = resolveUniqueStockNameContext(message, stockIndex);
            if (!named) {
              return null;
            }
            // With an active stock context, only an explicit switch to a
            // DIFFERENT stock may re-resolve by name; implicit mentions must
            // never rewrite (or enrich) the active context.
            if (activeStockContext) {
              const isSwitch = SWITCH_STOCK_MESSAGE_RE.test(message);
              const currentKey = resolveComparisonStockKey(activeStockContext.stock_code, stockIndex);
              const namedKey = resolveComparisonStockKey(named.stock_code, stockIndex);
              if (!isSwitch || namedKey === currentKey) {
                return null;
              }
            }
            return { context: named, useForCurrentSend: true };
          })()
        );

    let sendContext: unknown = followUpContextRef.current ?? activeStockContext;
    if (resolution) {
      setActiveStockContext(resolution.context);
      setActiveStockCode(resolution.context.stock_code);
      if (resolution.useForCurrentSend) {
        sendContext = resolution.context;
      }
    }

    // Quick-question explicit context is Codex-only; LiteLLM resolves stock
    // identity computationally from the message text instead.
    const isCodexBackend = agentStatus?.backend === 'codex_app_server';
    if (explicitContext && isCodexBackend) {
      sendContext = explicitContext;
      setActiveStockContext(explicitContext);
      setActiveStockCode(explicitContext.stock_code);
      followUpContextRef.current = null;
    }

    const effectiveSkillIds = override?.skills ?? selectedSkillIds;
    const skillNameById = new Map(skills.map((skill) => [skill.id, skill.name]));
    const skillNames = effectiveSkillIds.length > 0
      ? effectiveSkillIds.map((id) => skillNameById.get(id) || id)
      : [];
    const skillName = skillNames.join('、') || '通用';
    const polyfillSkillNames = skillNames.length > 0 ? skillNames : ['通用'];

    const payload: { message: string; session_id?: string; skills?: string[]; context?: unknown } = {
      message,
      session_id: sessionId,
      // The context key stays present (value undefined) so clients can
      // distinguish "no stock context" from "context not provided".
      context: sendContext ?? undefined,
    };
    if (override?.skills) {
      payload.skills = [...override.skills];
    } else if (sessionSelectedSkillIds !== null) {
      payload.skills = [...selectedSkillIds];
    }

    await startStream(payload, {
      skillName,
      skillNames: polyfillSkillNames,
      onAccepted: () => {
        setInput('');
        setMobileSkillPickerOpen(false);
        followUpContextRef.current = null;
      },
    });
  }, [input, loading, stockIndexLoading, agentAvailable, agentStatusChecking, agentStatus, activeStockContext, stockIndex, skills, selectedSkillIds, sessionSelectedSkillIds, sessionId, startStream]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleQuickQuestion = useCallback((question: (typeof QUICK_QUESTIONS)[number]) => {
    // The quick question fills the composer so the draft stays editable and
    // is only cleared once the server accepts the turn (meta.onAccepted).
    setInput(question.label);
    void handleSend({
      message: question.label,
      context: question.stockContext ?? undefined,
      skills: [question.skill],
    });
  }, [handleSend]);

  // Follow-up hydration: /chat?stock=<code>&name=<name>&recordId=<id>
  useEffect(() => {
    const rawStock = searchParams.get('stock');
    if (!rawStock) {
      return;
    }
    if (stockIndexLoading) {
      // 等待股票/指数注册表就绪，确保 sh000016 等 canonical 不被归并成同名股票。
      return;
    }
    const stockParam = sanitizeFollowUpStockCode(rawStock);
    if (!stockParam) {
      return;
    }
    const canonical = resolveRegisteredIndexCanonical(stockIndex, stockParam) ?? stockParam;
    const name = sanitizeFollowUpStockName(searchParams.get('name'))
      ?? resolveUniqueStockNameContext(canonical, stockIndex)?.stock_name
      ?? null;
    const recordId = parseFollowUpRecordId(searchParams.get('recordId'));

    const token = ++followUpHydrationTokenRef.current;

    const baseContext: ActiveStockContext = { stock_code: canonical, stock_name: name };
    setActiveStockContext(baseContext);
    setActiveStockCode(canonical);
    followUpContextRef.current = baseContext;
    setInput(buildFollowUpPrompt(canonical, name));
    setMobileSkillPickerOpen(false);

    setIsFollowUpContextLoading(true);
    void resolveChatFollowUpContext({ stockCode: canonical, stockName: name, recordId })
      .then((context) => {
        if (!isMountedRef.current || followUpHydrationTokenRef.current !== token) {
          return;
        }
        followUpContextRef.current = context;
        setActiveStockContext(context);
        setActiveStockCode(context.stock_code);
      })
      .finally(() => {
        if (isMountedRef.current && followUpHydrationTokenRef.current === token) {
          setIsFollowUpContextLoading(false);
        }
      });

    // 清空参数，避免刷新后重复触发
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, stockIndex, stockIndexLoading]);

  const sendSession = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setSendToast(null);
    try {
      const content = formatSessionAsMarkdown(messages);
      await agentApi.sendChat(content);
      showSendFeedback({ type: 'success', message: '已发送到通知渠道' }, 3000);
    } catch (err) {
      const parsed = getParsedApiError(err);
      showSendFeedback({
        type: 'error',
        message: parsed.message || '发送失败',
      }, 5000);
    } finally {
      setSending(false);
    }
  }, [sending, messages, showSendFeedback]);

  const handleStartNewChat = useCallback(() => {
    followUpContextRef.current = null;
    setActiveStockContext(null);
    setActiveStockCode(null);
    useAgentChatStore.getState().startNewChat();
  }, []);

  const handleSwitchSession = useCallback((targetSessionId: string) => {
    if (targetSessionId === sessionId) {
      setSidebarOpen(false);
      return;
    }
    followUpContextRef.current = null;
    setActiveStockContext(null);
    setActiveStockCode(null);
    setSidebarOpen(false);
    void switchSession(targetSessionId);
  }, [sessionId, switchSession]);

  const deleteSession = useCallback(async (targetSessionId: string) => {
    try {
      await agentApi.deleteChatSession(targetSessionId);
      if (!isMountedRef.current) {
        return;
      }
      if (targetSessionId === sessionId) {
        handleStartNewChat();
      }
      await loadSessions();
    } catch (error) {
      if (isMountedRef.current) {
        showSendFeedback({ type: 'error', message: getParsedApiError(error).message || '删除失败' }, 5000);
      }
    } finally {
      if (isMountedRef.current) {
        setDeleteConfirmId(null);
      }
    }
  }, [sessionId, handleStartNewChat, loadSessions, showSendFeedback]);

  const sidebarContent = (
    <SessionSidebar
      sessions={sessions}
      sessionsLoading={sessionsLoading}
      activeSessionId={sessionId}
      onStartNewChat={handleStartNewChat}
      onSwitchSession={handleSwitchSession}
      onRequestDelete={(id) => setDeleteConfirmId(id)}
    />
  );

  return (
    <div data-testid="chat-workspace" className="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/6 bg-card/60 backdrop-blur-md md:flex">
        {sidebarContent}
      </aside>
      {/* Mobile sidebar drawer */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="flex w-72 flex-col border-r border-white/6 bg-card/95 backdrop-blur-md">
            {sidebarContent}
          </div>
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col md:pl-72">
        <ChatHeader
          messages={messages}
          agentStatus={agentStatus}
          sending={sending}
          sendToast={sendToast}
          onOpenSidebar={() => setSidebarOpen(true)}
          onExportSession={() => downloadSession(messages)}
          onSendSession={() => void sendSession()}
          onOpenAgentSettings={() => navigate('/settings?category=agent')}
          t={t}
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden border border-white/6 bg-card/78 glass-card">
          <MessageList
            messages={messages}
            loading={loading}
            progressSteps={progressSteps}
            backend={agentStatus?.backend}
            agentAvailable={agentAvailable}
            stockIndexLoading={stockIndexLoading}
            quickQuestions={quickQuestions}
            onQuickQuestion={handleQuickQuestion}
            expandedThinking={expandedThinking}
            onToggleThinking={toggleThinking}
            copiedMessages={copiedMessages}
            onCopyMessage={copyMessageToClipboard}
            onDownloadMessage={downloadMessageAsMarkdown}
            copyLabel={text.copy}
            copiedLabel={text.copied}
            viewportRef={messagesViewportRef}
            endRef={messagesEndRef}
            onScroll={handleMessagesScroll}
            showJumpToBottom={showJumpToBottom}
            onJumpToBottom={() => {
              requestScrollToBottom('smooth');
              scrollToBottom('smooth');
            }}
            t={t}
          />

          <ChatComposer
            chatError={chatError}
            terminalStatus={terminalStatus}
            stopError={stopError}
            agentUnavailableError={agentUnavailableError}
            agentStatusError={agentStatusError}
            agentStatusChecking={agentStatusChecking}
            onRecheckAgentStatus={() => void loadAgentStatus()}
            onOpenAgentSettings={() => navigate('/settings?category=agent')}
            isFollowUpContextLoading={isFollowUpContextLoading}
            contextCompression={{
              enabled: contextCompressionEnabled,
              loaded: contextCompressionLoaded,
              saving: contextCompressionSaving,
              error: contextCompressionError,
            }}
            onToggleContextCompression={(enabled) => void updateContextCompressionEnabled(enabled)}
            skills={skills}
            selectedSkillIds={selectedSkillIds}
            selectedSkillSummary={selectedSkillSummary}
            skillLimitReached={skillLimitReached}
            mobileSkillPickerOpen={mobileSkillPickerOpen}
            onToggleMobileSkillPicker={() => setMobileSkillPickerOpen((open) => !open)}
            showSkillDesc={showSkillDesc}
            onShowSkillDesc={setShowSkillDesc}
            onClearSkills={() => setSelectedSkillIds([])}
            onToggleSkill={toggleSkillSelection}
            activeStockCode={activeStockCode}
            activeStockIsIndex={isRegisteredIndexCanonicalCode(activeStockCode, stockIndex)}
            isWatchlistActioning={isWatchlistActioning}
            stockInWatchlist={stockInWatchlist}
            watchlistMessage={watchlistMessage}
            onToggleWatchlist={(code) => void handleToggleWatchlist(code)}
            input={input}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            loading={loading}
            stockIndexLoading={stockIndexLoading}
            agentAvailable={agentAvailable}
            backend={agentStatus?.backend}
            stopping={stopping}
            onStop={() => void stopStream()}
            onSend={() => void handleSend()}
            t={t}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        title="删除对话"
        message="删除后，该对话将不可恢复，确认删除吗？"
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => {
          if (deleteConfirmId) {
            void deleteSession(deleteConfirmId);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};

export default ChatPage;
