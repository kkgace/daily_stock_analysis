# -*- coding: utf-8 -*-
"""Low-sensitive DecisionSignal summaries for notifications and risk views."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.schemas.decision_action import localize_action_label
from src.utils.sanitize import sanitize_decision_signal_payload, sanitize_decision_signal_text


SUMMARY_FIELDS = (
    "id",
    "stock_code",
    "stock_name",
    "market",
    "action",
    "action_label",
    "horizon",
    "status",
    "source_type",
    "source_report_id",
    "reason",
    "watch_conditions",
    "risk_summary",
    "created_at",
    "expires_at",
)

_TRACK_RECORD_ORDER = ("buy", "add", "hold", "reduce", "sell", "watch", "avoid", "alert")


def format_signal_track_record(stats: Any, report_language: str = "zh") -> str:
    """Format the per-stock signal track-record card (recent-N-day hit rate).

    Shared by all three report assembly paths (Jinja renderer, string-concat
    fallback, Web markdown rebuild) so the card stays identical across
    notification channels, share images, and the Web report view.

    Args:
        stats: payload from DecisionSignalOutcomeService.get_stock_stats().
        report_language: "zh" / "en" / "ko"（未知值回退 zh）.

    Returns:
        Markdown text; empty string when nothing to show（无已完成评估时
        整卡省略，遵循 section 级「有内容才渲染」惯例）。
    """

    if not isinstance(stats, dict):
        return ""
    completed = int(stats.get("completed") or 0)
    if completed <= 0:
        return ""
    hit = int(stats.get("hit") or 0)
    miss = int(stats.get("miss") or 0)
    neutral = int(stats.get("neutral") or 0)
    hit_rate_pct = stats.get("hit_rate_pct")
    avg_return = stats.get("avg_stock_return_pct")
    window_days = int(stats.get("window_days") or 30)

    language = str(report_language or "zh").strip().lower()
    if language not in ("zh", "en", "ko"):
        language = "zh"
    labels = {
        "zh": {
            "heading": f"建议回测（近{window_days}天）",
            "outcomes": "后验表现",
            "hit": "命中",
            "miss": "未中",
            "neutral": "中性",
            "hit_rate": "命中率",
            "by_action": "分动作",
            "avg_return": "区间平均涨跌",
            "signals": "条",
            "note": (
                f"命中率 = 命中 /（命中 + 未中），中性与无法评估的信号不计入分母；"
                f"统计窗口为信号创建时间近 {window_days} 天，每条信号只计一次"
                f"（多周期评估取信号声明的评估周期）。"
            ),
        },
        "en": {
            "heading": f"Signal Track Record ({window_days}d)",
            "outcomes": "Outcomes",
            "hit": "hit",
            "miss": "miss",
            "neutral": "neutral",
            "hit_rate": "hit rate",
            "by_action": "By action",
            "avg_return": "Avg return",
            "signals": "signals",
            "note": (
                f"Hit rate = hits / (hits + misses); neutral and unevaluated "
                f"signals are excluded. Window: signals created in the last {window_days} days. "
                f"Each signal is counted once (multi-horizon evaluations use "
                f"the signal's declared horizon)."
            ),
        },
        "ko": {
            "heading": f"시그널 트랙 레코드 ({window_days}일)",
            "outcomes": "후검 결과",
            "hit": "적중",
            "miss": "미적중",
            "neutral": "중립",
            "hit_rate": "적중률",
            "by_action": "액션별",
            "avg_return": "구간 평균 등락",
            "signals": "건",
            "note": (
                f"적중률 = 적중 / (적중 + 미적중); 중립 및 평가 불가 시그널은 제외. "
                f"통계 창: 최근 {window_days}일 내 생성된 시그널. "
                f"각 시그널은 1회만 집계됩니다(다중 주기 평가 시 시그널이 선언한 주기를 사용)."
            ),
        },
    }[language]
    hit_rate_text = f"{hit_rate_pct:.1f}%" if isinstance(hit_rate_pct, (int, float)) else "N/A"

    lines = [f"### 📈 {labels['heading']}", ""]
    outcome_parts = [
        f"{labels['hit']} {hit}",
        f"{labels['miss']} {miss}",
        f"{labels['neutral']} {neutral}",
    ]
    avg_return_text = ""
    if isinstance(avg_return, (int, float)):
        sign = "+" if float(avg_return) >= 0 else ""
        avg_return_text = f" | {labels['avg_return']} {sign}{float(avg_return):.2f}%"
    lines.append(
        f"**{labels['outcomes']}**: {' · '.join(outcome_parts)} — "
        f"**{labels['hit_rate']} {hit_rate_text}**{avg_return_text}"
    )

    action_parts = []
    breakdown = stats.get("action_breakdown") or []

    def _bucket_action(item: Any) -> Optional[str]:
        # 服务层 _breakdown 产出 {dimension, value}；API 端点转换为 {action}。
        if not isinstance(item, dict):
            return None
        return item.get("action") or item.get("value")

    for bucket in sorted(
        breakdown,
        key=lambda item: (
            _TRACK_RECORD_ORDER.index(_bucket_action(item))
            if _bucket_action(item) in _TRACK_RECORD_ORDER
            else len(_TRACK_RECORD_ORDER)
        ),
    ):
        action = _bucket_action(bucket)
        if not action:
            continue
        action_label = localize_action_label(action, language) or str(action)
        action_parts.append(
            f"{action_label} {int(bucket.get('total') or 0)} {labels['signals']}"
            f"（{labels['hit']} {int(bucket.get('hit') or 0)}）"
        )
    if action_parts:
        lines.append(f"**{labels['by_action']}**: {' · '.join(action_parts)}")
    lines.append(f"*{labels['note']}*")
    lines.append("")
    return "\n".join(lines)


def summarize_decision_signal(item: Any) -> Optional[Dict[str, Any]]:
    """Return a low-sensitive summary from a serialized DecisionSignal item."""

    if not isinstance(item, dict):
        return None
    summary: Dict[str, Any] = {}
    for field_name in SUMMARY_FIELDS:
        value = item.get(field_name)
        if value in (None, "", [], {}):
            continue
        summary[field_name] = sanitize_decision_signal_payload(value)
    return summary or None


def format_decision_signal_excerpt(summary: Any, report_language: str = "zh") -> str:
    """Format a compact public DecisionSignal excerpt for notification text."""

    if not isinstance(summary, dict) or not summary:
        return ""
    language = "en" if str(report_language or "").lower().startswith("en") else "zh"
    labels = {
        "zh": {
            "heading": "AI 决策信号",
            "action": "动作",
            "horizon": "周期",
            "reason": "理由",
            "watch_conditions": "观察条件",
            "risk_summary": "风险",
            "source_report_id": "报告",
        },
        "en": {
            "heading": "AI decision signal",
            "action": "Action",
            "horizon": "Horizon",
            "reason": "Reason",
            "watch_conditions": "Watch",
            "risk_summary": "Risk",
            "source_report_id": "Report",
        },
    }[language]

    parts = []
    action_label = _public_scalar(summary.get("action_label") or summary.get("action"), max_length=32)
    if action_label:
        parts.append(f"{labels['action']}: {action_label}")
    horizon = _public_scalar(summary.get("horizon"), max_length=16)
    if horizon:
        parts.append(f"{labels['horizon']}: {horizon}")
    source_report_id = _public_scalar(summary.get("source_report_id"), max_length=24)
    if source_report_id:
        parts.append(f"{labels['source_report_id']}: #{source_report_id}")

    lines = [f"**{labels['heading']}**"]
    if parts:
        lines.append(" | ".join(parts))
    for key in ("reason", "watch_conditions", "risk_summary"):
        max_length = None if key == "reason" else 120
        text = _public_text(summary.get(key), max_length=max_length)
        if text:
            lines.append(f"- {labels[key]}: {text}")
    return "\n".join(lines)


def _public_scalar(value: Any, *, max_length: int) -> str:
    if value in (None, ""):
        return ""
    return sanitize_decision_signal_text(value)[:max_length]


def _public_text(value: Any, *, max_length: Optional[int]) -> str:
    if value in (None, "", [], {}):
        return ""
    if isinstance(value, (list, tuple)):
        text = "；".join(str(item).strip() for item in value if str(item or "").strip())
    elif isinstance(value, dict):
        text = "；".join(
            f"{key}: {item}"
            for key, item in value.items()
            if str(key or "").strip() and str(item or "").strip()
        )
    else:
        text = str(value).strip()
    sanitized = sanitize_decision_signal_text(text)
    return sanitized if max_length is None else sanitized[:max_length]
