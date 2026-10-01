import { formatParsedApiError, type ParsedApiError } from '@/api/error';
import type { ScreeningScreenResponse } from '@/features/screening/api/screening';
import { truncateMessageDetail } from './formatting';

export const toMessageList = (values: string[] | undefined) =>
  Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];

export const KNOWN_SNAPSHOT_SOURCES = new Set(['tushare', 'sina', 'efinance', 'akshare_em', 'em_datacenter', 'baostock']);

export const summarizeScreeningDiagnostic = (detail: string) => {
  if (/no_json_found|invalid_response|coverage below threshold/i.test(detail)) {
    return '模型未返回可用的结构化排序结果';
  }
  if (/call_failed/i.test(detail)) {
    return '模型调用失败';
  }
  if (/trade_cal returned no open trading days/i.test(detail)) {
    return '交易日历暂无可用开市日';
  }
  if (/too many requests|rate limit|http\s*429/i.test(detail)) {
    return '请求过于频繁';
  }
  if (/403 forbidden|forbidden|access denied/i.test(detail)) {
    return '访问被拒绝';
  }
  if (/timeout|timed out/i.test(detail)) {
    return '请求超时';
  }
  if (/RemoteDisconnected|Connection aborted|ProtocolError|ConnectionPool|Max retries exceeded|ProxyError|NameResolutionError/i.test(detail)) {
    return '网络连接中断';
  }
  if (/missing .*api key|GEMINI_API_KEY|GOOGLE_API_KEY|gemini_api_key/i.test(detail)) {
    return '缺少可用 LLM API Key';
  }
  if (/returned no data|empty/i.test(detail)) {
    return '未返回可用数据';
  }

  const withoutUrl = detail
    .replace(/https?:\/\/\S+/gi, 'URL')
    .replace(/\bwith url:\s*\S+/gi, 'with url: URL')
    .replace(/\burl:\s*\S+/gi, 'url: URL');
  return truncateMessageDetail(withoutUrl);
};

export const parseSourceDiagnostic = (value: string) => {
  const match = value.match(/^([a-zA-Z0-9_-]+)\s*[:：]\s*(.+)$/);
  if (!match) {
    return null;
  }
  return {
    source: match[1],
    detail: match[2],
  };
};

export const formatEnrichmentSummary = (value: string) =>
  value
    .replace(/DSA行情\s*[:：]\s*/gi, '行情：')
    .replace(/DSA新闻\s*[:：]\s*/gi, '新闻：')
    .replace(/DSA事件\s*[:：]\s*/gi, '事件：');

export const formatScreenMessage = (value: string) => {
  if (/^DSA provider context applied \d+ of \d+ candidates/i.test(value)) {
    return '';
  }
  if (/^LLM ranking skipped:\s*no LLM config/i.test(value)) {
    return '未配置智能重排模型，当前使用确定性因子排序。';
  }
  if (/^LLM ranking failed/i.test(value)) {
    return `未完成智能重排：${summarizeScreeningDiagnostic(value)}；当前结果继续使用确定性因子评分。`;
  }
  if (/no_json_found|invalid_response|coverage below threshold|call_failed/i.test(value)) {
    return `未完成智能重排：${summarizeScreeningDiagnostic(value)}；当前结果继续使用确定性因子评分。`;
  }
  if (/^(?:LLM ranking prompt|LLM context) truncated:/i.test(value)) {
    return '';
  }
  if (/^(?:Remote post-analysis cap|Risk veto excluded|Snapshot hard-filter waterfall|Daily hard-filter waterfall|Daily hard-filter rejections|Candidate context collected rows=)/i.test(value)) {
    return '';
  }
  if (/^Daily K-line (?:enrichment attempted|sources|quality flags|source ordering|source health):?/i.test(value)) {
    return '';
  }
  if (/^Daily K-line enrichment row errors:/i.test(value)) {
    return '部分候选的日线数据未能补齐，结果已按可用数据生成。';
  }
  if (/^Daily K-line enrichment skipped:/i.test(value)) {
    return '可选日线数据补充未完成，结果已按快照数据生成。';
  }
  if (/^Candidate context row errors:/i.test(value)) {
    return '部分候选的辅助数据未能补齐。';
  }
  if (/^Industry\/concepts enrichment:/i.test(value)) {
    return '部分行业或题材信息未能补齐。';
  }
  if (/^DSA deep analysis failed for /i.test(value)) {
    return '部分候选的深度分析未完成。';
  }

  const snapshotFallback = value.match(/^Snapshot source fallback:\s*(.+)$/i);
  if (snapshotFallback) {
    const parsed = parseSourceDiagnostic(snapshotFallback[1]);
    if (parsed) {
      return `数据源降级：${parsed.source}（${summarizeScreeningDiagnostic(parsed.detail)}）`;
    }
    return `数据源降级：${summarizeScreeningDiagnostic(snapshotFallback[1])}`;
  }

  const parsed = parseSourceDiagnostic(value);
  if (parsed && KNOWN_SNAPSHOT_SOURCES.has(parsed.source.toLowerCase())) {
    return `数据源降级：${parsed.source}（${summarizeScreeningDiagnostic(parsed.detail)}）`;
  }
  return truncateMessageDetail(value);
};

export const normalizeScreenMessageKey = (value: string) => {
  const formatted = formatScreenMessage(value);
  return formatted ? formatted.trim().toLowerCase() : value.trim().toLowerCase();
};

export const getScreenMessages = (meta: ScreeningScreenResponse | null) => {
  if (!meta) {
    return [];
  }
  const messages: string[] = [];
  const seen = new Set<string>();
  [...toMessageList(meta.warnings), ...toMessageList(meta.sourceErrors), ...toMessageList(meta.llmParseErrors)].forEach(
    (value) => {
      const key = normalizeScreenMessageKey(value);
      if (seen.has(key)) {
        return;
      }
      const message = formatScreenMessage(value);
      if (!message) {
        return;
      }
      seen.add(key);
      messages.push(message);
    },
  );
  return messages;
};

export const isRunningScreenTask = (status: string | undefined | null) => status === 'pending' || status === 'processing';

export const formatScreenTaskFailure = (value: string | null | undefined) => {
  const text = String(value || '').trim();
  if (!text) {
    return '选股任务失败，请稍后重试。';
  }
  return `选股任务失败：${summarizeScreeningDiagnostic(text)}`;
};

export const isUnrecoverableScreenTaskError = (error: ParsedApiError) =>
  error.title === '选股任务不可恢复';

export const formatRecoverableScreenTaskPollingError = (error: ParsedApiError) => {
  if (error.category === 'upstream_timeout') {
    return '选股任务仍在后台运行，状态轮询暂时超时，将自动重试。';
  }
  if (error.category === 'upstream_network' || error.category === 'local_connection_failed') {
    return '选股任务仍在后台运行，暂时无法连接本地服务获取状态，将自动重试。';
  }
  return formatParsedApiError(error) || '暂时无法获取选股任务状态，稍后将自动重试。';
};
