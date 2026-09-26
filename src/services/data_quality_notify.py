# -*- coding: utf-8 -*-
"""数据质量异常通知（system_error 路由）。

入库质量护栏（save_daily_data 挂钩）只把异常写入 ``stock_data_anomalies``；
本模块在分析任务收尾时把"本轮新发现的异常"聚合成一条消息，经
``NOTIFICATION_SYSTEM_ERROR_CHANNELS`` 路由推送。

边界（与 analysis_timeout_partial / 护栏自身同一哲学）：
- 只读查询 + 通知发送，绝不修改行情数据，绝不阻断分析主流程；
- 任何异常（含通知渠道失败）只记 warning 并返回 False；
- 无新增异常 / 开关关闭 / 配置缺失时静默跳过，不产生任何请求。
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.config import get_config
from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository
from src.storage import DatabaseManager, StockDataAnomalyRecord

logger = logging.getLogger(__name__)

__all__ = [
    "build_anomaly_alert_content",
    "send_data_quality_anomaly_notification",
    "notify_new_daily_anomalies",
]

_MAX_CODES_PER_KIND = 5

_NOTIFY_LABELS: Dict[str, Dict[str, str]] = {
    "zh": {
        "title": "数据质量护栏告警",
        "total": "本轮新发现 {count} 条日线数据异常（涉及 {codes} 只股票）",
        "truncated": "（消息仅展示最新 {shown} 条，完整清单见 `python main.py --data-quality`）",
        "severity_critical": "严重",
        "severity_warning": "警告",
        "kind_line": "**{kind}**（{severity}）：{count} 条 — {codes}",
        "more_codes": "等 {total} 只",
        "footer": "护栏只记录不阻断入库；运行 `python main.py --data-quality` 查看报告，"
        "确认后可用 `--data-quality-apply` 应用高置信量纲修复。",
    },
    "en": {
        "title": "Data Quality Guard Alert",
        "total": "{count} new daily-data anomalies detected this run (across {codes} stocks)",
        "truncated": "(showing the latest {shown} only; run `python main.py --data-quality` for the full list)",
        "severity_critical": "critical",
        "severity_warning": "warning",
        "kind_line": "**{kind}** ({severity}): {count} — {codes}",
        "more_codes": "{total} total",
        "footer": "The guard records anomalies without blocking ingestion. Run "
        "`python main.py --data-quality` for the report; `--data-quality-apply` applies "
        "high-confidence unit-scale fixes.",
    },
    "ko": {
        "title": "데이터 품질 가드 알림",
        "total": "이번 실행에서 {count}개의 일봉 데이터 이상이 새로 발견되었습니다 ({codes}개 종목)",
        "truncated": "(최신 {shown}건만 표시; 전체 목록은 `python main.py --data-quality` 로 확인하세요)",
        "severity_critical": "심각",
        "severity_warning": "주의",
        "kind_line": "**{kind}** ({severity}): {count}건 — {codes}",
        "more_codes": "총 {total}개",
        "footer": "가드는 기록만 하고 입고를 차단하지 않습니다. `python main.py --data-quality` 로 "
        "보고서를 확인하고, `--data-quality-apply` 로 고신뢰 단위 오류를 수정하세요.",
    },
}


def _labels(language: str) -> Dict[str, str]:
    return _NOTIFY_LABELS.get(language) or _NOTIFY_LABELS["zh"]


def _format_code_list(codes: List[str], labels: Dict[str, str]) -> str:
    shown = ", ".join(f"`{code}`" for code in codes[:_MAX_CODES_PER_KIND])
    if len(codes) > _MAX_CODES_PER_KIND:
        shown = f"{shown}（{labels['more_codes'].format(total=len(codes))}）"
    return shown


def build_anomaly_alert_content(
    rows: List[Dict[str, Any]],
    *,
    report_language: str = "zh",
    total_new: Optional[int] = None,
) -> str:
    """把异常行聚合成一条 Markdown 消息（按 kind 分组，代码列表截断）。

    Args:
        rows: 用于展示的异常行（可能是全量的前 N 条）。
        total_new: 本轮新发现异常的全量数（SQL 聚合，不受展示条数限制）；
            大于 len(rows) 时消息会明确标注"仅展示最新 N 条"。
    """

    labels = _labels(str(report_language or "zh"))
    all_codes = sorted({str(row.get("code")) for row in rows if row.get("code")})
    total_count = int(total_new) if total_new else len(rows)

    by_kind: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        by_kind.setdefault(str(row.get("kind") or "unknown"), []).append(row)

    lines: List[str] = [
        labels["total"].format(count=total_count, codes=len(all_codes)),
    ]
    if total_count > len(rows):
        lines.append(labels["truncated"].format(shown=len(rows)))
    lines.append("")
    for kind in sorted(by_kind, key=lambda name: (-len(by_kind[name]), name)):
        kind_rows = by_kind[kind]
        severity = (
            labels["severity_critical"]
            if any(str(row.get("severity")) == "critical" for row in kind_rows)
            else labels["severity_warning"]
        )
        kind_codes = sorted({str(row.get("code")) for row in kind_rows if row.get("code")})
        lines.append(
            labels["kind_line"].format(
                kind=kind,
                severity=severity,
                count=len(kind_rows),
                codes=_format_code_list(kind_codes, labels),
            )
        )
    lines.extend(["", "_" + labels["footer"] + "_"])
    return "\n".join(lines)


def send_data_quality_anomaly_notification(
    rows: List[Dict[str, Any]],
    *,
    report_language: Optional[str] = None,
    notifier: Optional[Any] = None,
    total_new: Optional[int] = None,
    has_critical: Optional[bool] = None,
) -> bool:
    """把聚合后的异常消息经 system_error 路由发送。

    Args:
        rows: 用于展示的异常行（可能是全量的前 N 条）。
        total_new: 全量新异常数（超出展示条数时消息内标注）。
        has_critical: 全量中是否含 critical（按展示子集计算会在
            critical 恰好被截掉时把告警从 error 降成 warning，
            调用方应传 SQL 聚合的全量结果）。

    Returns:
        True 表示已尝试发送且有渠道成功；False 表示跳过或全部失败。
        任何异常只记 warning，绝不向上抛。
    """

    if not rows:
        return False
    try:
        from src.notification import NotificationBuilder

        config = get_config()
        if report_language is None:
            report_language = getattr(config, "report_language", "zh") or "zh"
        if has_critical is None:
            has_critical = any(str(row.get("severity")) == "critical" for row in rows)
        severity = "error" if has_critical else "warning"
        kind_names = sorted({str(row.get("kind") or "unknown") for row in rows})
        codes = sorted({str(row.get("code")) for row in rows if row.get("code")})
        # 批次标识取展示行的最新 created_at 日期：降噪 key 含日期维度，
        # 避免配置 DEDUP_TTL/COOLDOWN 后跨日的新异常被前一天同股票告警吞掉。
        batch_date = max(
            (str(row.get("created_at") or "")[:10] for row in rows),
            default="",
        )
        key_codes = "+".join(codes)
        dedup_key = f"data_quality_anomaly:{'+'.join(kind_names)}:{key_codes}:{batch_date}"
        labels = _labels(str(report_language))
        content = build_anomaly_alert_content(
            rows, report_language=str(report_language), total_new=total_new
        )
        alert_text = NotificationBuilder.build_simple_alert(
            title=labels["title"],
            content=content,
            alert_type="error" if has_critical else "warning",
        )
        service = notifier or _build_notification_service()
        return bool(
            service.send(
                alert_text,
                route_type="system_error",
                severity=severity,
                dedup_key=dedup_key,
                # 冷却 key 保留 kind 维度：同 codes 不同类型的两批告警
                # 不应互相抑制
                cooldown_key=(
                    f"data_quality_anomaly:{'+'.join(kind_names)}:{key_codes}:{batch_date}"
                ),
            )
        )
    except Exception as exc:  # noqa: BLE001 - never break callers on notify failure
        logger.warning("数据质量异常通知发送失败: %s", exc)
        return False


def _build_notification_service():
    from src.notification import NotificationService

    return NotificationService()


def _notify_enabled() -> bool:
    """读取 DATA_QUALITY_NOTIFY_ENABLED（默认 true）；配置读取失败时 fail-open。"""

    try:
        return bool(getattr(get_config(), "data_quality_notify_enabled", True))
    except Exception:
        return True


def notify_new_daily_anomalies(
    db_manager: Optional[DatabaseManager] = None,
    *,
    created_since,
    notifier: Optional[Any] = None,
    report_language: Optional[str] = None,
) -> bool:
    """查询 created_since 之后新发现的数据异常并推送一条聚合通知。

    Args:
        created_since: 本轮任务开始时间（naive datetime，与
            ``stock_data_anomalies.created_at`` 同口径，upsert 不覆盖该值）。
    """

    if not _notify_enabled():
        return False
    try:
        repo = StockDataAnomalyRepository(db_manager or DatabaseManager.get_instance())
        # 全量计数与 critical 判定走 SQL 聚合：不受展示条数（500）限制，
        # 避免 critical 恰被截掉时告警级别被降成 warning、或计数失真。
        severity_counts = repo.count_recent_anomalies(
            created_since=created_since, status="open"
        )
        total_new = sum(int(count) for count in severity_counts.values())
        if total_new <= 0:
            return False
        rows: List[StockDataAnomalyRecord] = repo.list_recent_anomalies(
            created_since=created_since, status="open"
        )
        if not rows:
            return False
        if total_new > len(rows):
            logger.warning(
                "数据质量异常通知：本轮新发现 %d 条，超出单条消息展示上限，"
                "仅展示最新 %d 条（完整清单见 python main.py --data-quality）",
                total_new,
                len(rows),
            )
        return send_data_quality_anomaly_notification(
            [row.to_dict() for row in rows],
            report_language=report_language,
            notifier=notifier,
            total_new=total_new,
            has_critical=int(severity_counts.get("critical", 0)) > 0,
        )
    except Exception as exc:  # noqa: BLE001 - read-only + notify-only path
        logger.warning("数据质量异常通知跳过: %s", exc)
        return False
