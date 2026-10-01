import { extractStockCodesFromMessage } from '@/features/chat/utils/chatStockCode';
import {
  normalizeStockCode,
  resolveRegisteredIndexCanonical,
} from '@/utils/stockCode';
import type { StockIndexItem } from '@/types/stockIndex';
import type { Message } from '@/features/chat/stores/agentChatStore';
import type { ActiveStockContext, ActiveStockResolution } from './types';

export const STRONG_COMPARE_STOCK_MESSAGE_RE = /比较|对比|\bvs\b|和[^，。,.!?！？]{0,40}比/i;
export const WEAK_COMPARE_STOCK_MESSAGE_RE = /差异(?!化)|区别|不同|相比|对照|比一比/;
export const CHOICE_COMPARE_STOCK_MESSAGE_RE = /哪个|哪只|哪一个|谁更|更值得|更适合|怎么选|选哪|二选一/;
export const LINKED_COMPARE_STOCK_MESSAGE_RE = /(?:和|与|跟|同)[^，。,.!?！？]{0,40}(?:差异(?!化)|区别|不同|相比|对照|比一比)/;
export const SWITCH_STOCK_MESSAGE_RE = /换成|改看|分析|看看|研究|诊断/;

export const resolveUniqueStockNameContext = (
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
export const isRegisteredIndexCanonicalCode = (
  code: string | null,
  index: StockIndexItem[],
): boolean => {
  if (!code) return false;
  return resolveRegisteredIndexCanonical(index, code) !== null;
};

// Comparison identity key: registry canonical first (so an index context keeps
// its lowercase canonical and never normalizes into the bare same-code stock),
// then the stock normalization fallback. Never guesses index types from prefixes.
export const resolveComparisonStockKey = (
  code: string | null | undefined,
  index: StockIndexItem[],
): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return resolveRegisteredIndexCanonical(index, trimmed) ?? normalizeStockCode(trimmed);
};

export const isCompareStockMessage = (
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

export const resolveActiveStockContextFromMessage = (
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

export const restoreActiveStockContextFromMessages = (
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
