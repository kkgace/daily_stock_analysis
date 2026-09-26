# -*- coding: utf-8 -*-
"""单股建议后验统计（get_stock_stats）与报告「建议回测」卡片测试。

覆盖：
- DecisionSignalOutcomeService.get_stock_stats：窗口过滤、单股隔离、
  action 分桶、懒刷新回填。
- format_signal_track_record：zh/en/ko 三语渲染、无数据省略。
- 报告三条渲染路径：Jinja 模板、notification 拼段 fallback、
  Web markdown 重建（history_service 路径由 formatter+config 共享逻辑覆盖）。
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta

import pytest

from src.analyzer import AnalysisResult
from src.config import Config
from src.notification import NotificationService
from src.services.decision_signal_outcome_service import DecisionSignalOutcomeService
from src.services.decision_signal_summary import format_signal_track_record
from src.services.report_renderer import render
from src.storage import (
    DatabaseManager,
    DecisionSignalOutcomeRecord,
    DecisionSignalRecord,
    utc_naive_now,
)


def _env_snapshot(env_text: str) -> dict:
    """快照临时 .env 各键的进程内原值。

    load_dotenv(override=False) 会把临时 .env 中缺失的键导出到
    os.environ 且 teardown 无人清理；泄漏键还会在 Config 单例重建时被
    bootstrap-override 重捕获、压过真实 .env。按快照恢复堵住两条路径。
    """
    keys = set()
    for line in env_text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            keys.add(line.split("=", 1)[0].strip())
    return {key: os.environ.get(key) for key in keys}


def _env_restore(snapshot: dict) -> None:
    for key, value in snapshot.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


@pytest.fixture()
def isolated_db(tmp_path):
    old_env_file = os.environ.get("ENV_FILE")
    env_path = tmp_path / ".env"
    db_path = tmp_path / "stock_outcome_stats.db"
    # 必须用 ENV_FILE 指向临时 .env：Config 加载默认 .env 时 load_dotenv 会把
    # 其中的键导出到 os.environ（如本机 LLM_CHANNELS），污染同进程后续
    # system_config 测试的 effective map 合并。
    env_text = "\n".join(
        [
            "STOCK_LIST=600519",
            "GEMINI_API_KEY=test",
            f"DATABASE_PATH={db_path}",
        ]
    ) + "\n"
    env_snapshot = _env_snapshot(env_text)
    env_path.write_text(env_text, encoding="utf-8")
    os.environ["ENV_FILE"] = str(env_path)
    os.environ["DATABASE_PATH"] = str(db_path)
    Config.reset_instance()
    DatabaseManager.reset_instance()
    db = DatabaseManager.get_instance()
    try:
        yield db
    finally:
        DatabaseManager.reset_instance()
        _env_restore(env_snapshot)
        if old_env_file is None:
            os.environ.pop("ENV_FILE", None)
        else:
            os.environ["ENV_FILE"] = old_env_file
        Config.reset_instance()


@pytest.fixture()
def isolated_env(tmp_path):
    """仅隔离 env 文件（无 DB 需求的渲染测试用）。

    render() -> _resolve_templates_dir 会调用 get_config()；不隔离 ENV_FILE
    时会加载真实 .env 并把键导出到 os.environ，污染同进程后续
    system_config 测试的 effective map 合并。
    """

    old_env_file = os.environ.get("ENV_FILE")
    env_path = tmp_path / ".env"
    env_text = "\n".join(
        [
            "STOCK_LIST=600519",
            "GEMINI_API_KEY=test",
            f"DATABASE_PATH={tmp_path / 'isolated_env.db'}",
        ]
    ) + "\n"
    env_snapshot = _env_snapshot(env_text)
    env_path.write_text(env_text, encoding="utf-8")
    os.environ["ENV_FILE"] = str(env_path)
    os.environ["DATABASE_PATH"] = str(tmp_path / "isolated_env.db")
    Config.reset_instance()
    try:
        yield env_path
    finally:
        _env_restore(env_snapshot)
        if old_env_file is None:
            os.environ.pop("ENV_FILE", None)
        else:
            os.environ["ENV_FILE"] = old_env_file
        Config.reset_instance()


def _add_signal(
    db: DatabaseManager,
    *,
    code: str = "600519",
    action: str = "buy",
    horizon: str = "3d",
    created_days_ago: int = 1,
    status: str = "active",
) -> int:
    with db.session_scope() as session:
        row = DecisionSignalRecord(
            stock_code=code,
            stock_name="测试股票",
            market="cn",
            source_type="analysis",
            source_report_id=None,
            trace_id=f"trace-{code}-{action}-{horizon}-{created_days_ago}-{status}",
            market_phase="postmarket",
            trigger_source="api",
            action=action,
            action_label=action,
            horizon=horizon,
            reason="unit test",
            plan_quality="complete",
            status=status,
            created_at=utc_naive_now() - timedelta(days=created_days_ago),
        )
        session.add(row)
        session.flush()
        return int(row.id)


def _add_outcome(
    db: DatabaseManager,
    *,
    signal_id: int,
    outcome: str = "hit",
    horizon: str = "3d",
    action: str = "buy",
) -> None:
    with db.session_scope() as session:
        session.add(
            DecisionSignalOutcomeRecord(
                signal_id=signal_id,
                horizon=horizon,
                engine_version="decision-signal-v1",
                eval_status="completed",
                outcome=outcome,
                direction_expected="up",
                direction_correct=outcome == "hit",
                anchor_date=date.today() - timedelta(days=3),
                eval_window_days=3,
                start_price=100.0,
                end_close=105.0,
                stock_return_pct=5.0,
                action=action,
                market="cn",
                holding_state="holding",
            )
        )


# ---------------------------------------------------------------------------
# get_stock_stats
# ---------------------------------------------------------------------------


def test_get_stock_stats_aggregates_window_and_action_breakdown(isolated_db) -> None:
    signal_buy = _add_signal(isolated_db, code="600519", action="buy")
    signal_sell = _add_signal(isolated_db, code="600519", action="sell", horizon="5d")
    # 其它股票的信号不应计入
    _add_signal(isolated_db, code="000001", action="buy")
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="hit", action="buy")
    _add_outcome(isolated_db, signal_id=signal_sell, outcome="miss", horizon="5d", action="sell")

    service = DecisionSignalOutcomeService()
    stats = service.get_stock_stats(stock_code="600519", days=30)

    assert stats["total"] == 2
    assert stats["completed"] == 2
    assert stats["hit"] == 1
    assert stats["miss"] == 1
    assert stats["hit_rate_pct"] == 50.0
    assert stats["window_days"] == 30
    actions = {bucket["value"]: bucket for bucket in stats["action_breakdown"]}
    assert actions["buy"]["hit"] == 1
    assert actions["sell"]["miss"] == 1


def test_get_stock_stats_counts_signals_not_outcome_rows(isolated_db) -> None:
    """P2 回归：同一信号多评估周期（1d/3d/5d）只计一次——
    "N 条"必须是信号数，且优先取信号声明周期的评估结果。"""

    signal_buy = _add_signal(isolated_db, code="600519", action="buy", horizon="3d")
    signal_sell = _add_signal(isolated_db, code="600519", action="sell", horizon="5d")
    # 信号声明 3d：1d 评估 miss、3d 评估 hit → 去重后应取 3d 行（hit）
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="miss", horizon="1d", action="buy")
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="hit", horizon="3d", action="buy")
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="hit", horizon="5d", action="buy")
    # 信号声明 5d：只评估了 1d → 保留该行
    _add_outcome(isolated_db, signal_id=signal_sell, outcome="miss", horizon="1d", action="sell")

    service = DecisionSignalOutcomeService()
    stats = service.get_stock_stats(stock_code="600519", days=30)

    # 2 条信号而非 4 行 outcome
    assert stats["total"] == 2
    assert stats["completed"] == 2
    # buy 取声明周期 3d 的 hit；sell 取唯一行 miss
    assert stats["hit"] == 1
    assert stats["miss"] == 1
    actions = {bucket["value"]: bucket for bucket in stats["action_breakdown"]}
    assert actions["buy"]["total"] == 1
    assert actions["buy"]["hit"] == 1
    assert actions["sell"]["total"] == 1
    assert actions["sell"]["miss"] == 1


def test_get_stock_stats_excludes_signals_outside_window(isolated_db) -> None:
    old_signal = _add_signal(isolated_db, code="600519", created_days_ago=60)
    _add_outcome(isolated_db, signal_id=old_signal, outcome="hit")

    stats = DecisionSignalOutcomeService().get_stock_stats(stock_code="600519", days=30)
    assert stats["total"] == 0
    assert stats["hit_rate_pct"] is None


def test_get_stock_stats_refresh_backfills_missing_outcomes(isolated_db) -> None:
    # 无 outcome 的信号：refresh=True 懒评估应补齐（有日线数据时评估完成）
    _add_signal(isolated_db, code="600519", action="buy")
    with isolated_db.session_scope() as session:
        session.add(
            __import__("src.storage", fromlist=["StockDaily"]).StockDaily(
                code="600519",
                date=date.today(),
                open=100.0, high=101.0, low=99.0, close=100.0,
                volume=1_000_000.0, amount=100_000_000.0,
            )
        )

    service = DecisionSignalOutcomeService()
    stats = service.get_stock_stats(stock_code="600519", days=30, refresh=True)
    assert stats["total"] >= 1


def test_get_stock_stats_empty_returns_zero_totals(isolated_db) -> None:
    stats = DecisionSignalOutcomeService().get_stock_stats(stock_code="600519", days=30)
    assert stats["total"] == 0
    assert stats["completed"] == 0
    assert stats["hit_rate_pct"] is None
    assert stats["action_breakdown"] == []
    assert format_signal_track_record(stats, "zh") == ""


def test_get_stock_stats_rejects_blank_code(isolated_db) -> None:
    with pytest.raises(ValueError):
        DecisionSignalOutcomeService().get_stock_stats(stock_code="  ")


# ---------------------------------------------------------------------------
# format_signal_track_record
# ---------------------------------------------------------------------------


def _stats_payload(**overrides):
    payload = {
        "stock_code": "600519",
        "window_days": 30,
        "engine_version": "decision-signal-v1",
        "horizons": None,
        "statuses": ["active"],
        "total": 15,
        "completed": 10,
        "unable": 5,
        "hit": 6,
        "miss": 4,
        "neutral": 0,
        "hit_rate_pct": 60.0,
        "avg_stock_return_pct": 1.25,
        "unable_reasons": {"insufficient_forward_bars": 5},
        "action_breakdown": [
            {"dimension": "action", "value": "buy", "total": 8, "completed": 8,
             "unable": 0, "hit": 5, "miss": 3, "neutral": 0, "hit_rate_pct": 62.5,
             "avg_stock_return_pct": 1.5, "unable_reasons": {}},
            {"dimension": "action", "value": "sell", "total": 7, "completed": 2,
             "unable": 5, "hit": 1, "miss": 1, "neutral": 0, "hit_rate_pct": 50.0,
             "avg_stock_return_pct": -0.5, "unable_reasons": {}},
        ],
    }
    payload.update(overrides)
    return payload


def test_format_signal_track_record_zh() -> None:
    text = format_signal_track_record(_stats_payload(), "zh")
    assert "建议回测（近30天）" in text
    assert "命中率 60.0%" in text
    assert "命中 6" in text
    assert "买入" in text
    assert "命中率 = 命中 /（命中 + 未中）" in text


def test_format_signal_track_record_en() -> None:
    text = format_signal_track_record(_stats_payload(), "en")
    assert "Signal Track Record (30d)" in text
    assert "hit rate 60.0%" in text
    assert "Buy" in text
    assert "excluded" in text


def test_format_signal_track_record_ko() -> None:
    text = format_signal_track_record(_stats_payload(), "ko")
    assert "시그널 트랙 레코드" in text
    assert "적중률 60.0%" in text


def test_format_signal_track_record_unknown_language_falls_back_to_zh() -> None:
    text = format_signal_track_record(_stats_payload(), "fr")
    assert "建议回测" in text


def test_format_signal_track_record_hit_rate_none_without_directional() -> None:
    # 只有 neutral / unable：hit_rate 为 None，展示 N/A
    payload = _stats_payload(
        hit=0, miss=0, neutral=4, hit_rate_pct=None,
    )
    text = format_signal_track_record(payload, "zh")
    assert "命中率 N/A" in text


# ---------------------------------------------------------------------------
# 报告渲染路径
# ---------------------------------------------------------------------------


def _result(code: str = "600519") -> AnalysisResult:
    return AnalysisResult(
        code=code,
        name="贵州茅台",
        sentiment_score=80,
        trend_prediction="看多",
        operation_advice="买入",
        analysis_summary="单元测试摘要",
        report_language="zh",
    )


def test_report_markdown_template_renders_track_card(isolated_env) -> None:
    from src.services.decision_signal_summary import format_signal_track_record as fmt

    out = render(
        platform="markdown",
        results=[_result()],
        extra_context={
            "history_by_code": {},
            "signal_stats_by_code": {"600519": _stats_payload()},
            "format_signal_track_record": fmt,
            "report_language": "zh",
        },
    )
    assert out is not None
    assert "建议回测（近30天）" in out


def test_report_markdown_template_skips_card_without_stats(isolated_env) -> None:
    out = render(
        platform="markdown",
        results=[_result()],
        extra_context={
            "history_by_code": {},
            "signal_stats_by_code": {},
            "report_language": "zh",
        },
    )
    assert out is not None
    assert "建议回测" not in out


def test_notification_fallback_report_includes_track_card(isolated_db) -> None:
    signal_buy = _add_signal(isolated_db, code="600519", action="buy")
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="hit", action="buy")

    service = NotificationService()
    # 直接注入缓存好的 stats context，避免依赖懒刷新时序
    stats = DecisionSignalOutcomeService().get_stock_stats(stock_code="600519", days=30)
    service._signal_stats_cache[(30, "zh", ("600519",))] = {"600519": stats}

    report = service.generate_dashboard_report([_result("600519")])
    assert "建议回测（近30天）" in report
    assert "命中率" in report


def test_notification_fallback_report_without_data_omits_card(isolated_db) -> None:
    service = NotificationService()
    report = service.generate_dashboard_report([_result("600519")])
    assert "建议回测" not in report


def test_single_stock_report_includes_track_card(isolated_db) -> None:
    """P1 回归：单股推送（SINGLE_STOCK_NOTIFY / SIMPLE 单股形态）也必须有
    「建议回测」卡片——此前该形态从未挂卡片，文档承诺的三条路径少一条。"""

    signal_buy = _add_signal(isolated_db, code="600519", action="buy")
    _add_outcome(isolated_db, signal_id=signal_buy, outcome="hit", action="buy")

    service = NotificationService()
    # 直接注入缓存好的 stats context，避免依赖懒刷新时序
    stats = DecisionSignalOutcomeService().get_stock_stats(stock_code="600519", days=30)
    service._signal_stats_cache[(30, "zh", ("600519",))] = {"600519": stats}

    report = service.generate_single_stock_report(_result("600519"))
    assert "建议回测（近30天）" in report
    assert "命中率" in report


def test_single_stock_report_without_data_omits_card(isolated_db) -> None:
    """无已完成评估的单股推送：不出卡片（与 dashboard 省略语义一致）。"""

    service = NotificationService()
    report = service.generate_single_stock_report(_result("600519"))
    assert "建议回测" not in report
