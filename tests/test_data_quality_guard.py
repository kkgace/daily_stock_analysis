# -*- coding: utf-8 -*-
"""数据入库质量护栏测试（data_quality_guard）。

覆盖：
- 纯检测规则：量纲交叉校验（Issue #2350 的 100 倍手/股混淆）、
  零量有价、历史突变、跨源不一致。
- 入库挂钩：save_daily_data 写入异常记录、幂等去重、
  DATA_QUALITY_GUARD_ENABLED=false 时零行为变化。
- 修复扫描：源切换边界突变检测（#2350 存量坏数据的暴露形态）。
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta

import pandas as pd
import pytest

from src.config import Config
from src.services import data_quality_guard as guard
from src.storage import DatabaseManager, StockDataAnomalyRecord


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
    """隔离 DB + 隔离 env 文件。

    必须用 ENV_FILE 指向临时 .env：Config 加载默认 .env 时 load_dotenv 会把
    其中的键导出到 os.environ（如本机 LLM_CHANNELS），而
    SystemConfigService._build_generation_backend_base_map 会把 os.environ 里
    注册过的键合并进 effective map，污染同进程后续 system_config 测试。
    """

    old_env_file = os.environ.get("ENV_FILE")
    env_path = tmp_path / ".env"
    db_path = tmp_path / "data_quality_guard.db"
    env_text = "\n".join(
        [
            "STOCK_LIST=600519",
            "GEMINI_API_KEY=test",
            "DATA_QUALITY_GUARD_ENABLED=true",
            f"DATABASE_PATH={db_path}",
        ]
    ) + "\n"
    env_snapshot = _env_snapshot(env_text)
    env_path.write_text(env_text, encoding="utf-8")
    os.environ["ENV_FILE"] = str(env_path)
    os.environ["DATABASE_PATH"] = str(db_path)
    os.environ["DATA_QUALITY_GUARD_ENABLED"] = "true"
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
    """仅隔离 env 文件（无 DB 需求的测试用），防止 get_config() 导出真实 .env。

    Config 加载默认 .env 时 load_dotenv 会把键导出到 os.environ，污染
    同进程后续 system_config 测试的 effective map 合并（见 isolated_db 注释）。
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


def _record(**overrides):
    """正常行：volume(股)×close≈amount(元)，量纲一致。"""

    record = {
        "code": "600519",
        "date": date(2026, 9, 21),
        "open": 100.0,
        "high": 101.0,
        "low": 99.0,
        "close": 100.0,
        "volume": 10_000_000.0,
        "amount": 1_000_000_000.0,
        "data_source": "TestFetcher",
    }
    record.update(overrides)
    return record


def _history(days=10, volume=1_000_000.0, close=100.0, source="TestFetcher"):
    return [
        {
            "code": "600519",
            "date": date(2026, 9, 1 + i),
            "close": close,
            "volume": volume,
            "amount": volume * close,
            "data_source": source,
        }
        for i in range(days)
    ]


# ---------------------------------------------------------------------------
# 纯函数：量纲交叉校验
# ---------------------------------------------------------------------------


def test_unit_scale_normal_row_passes() -> None:
    assert guard.detect_unit_scale_mismatch(_record()) is None


def test_unit_scale_catches_100x_volume_error_with_suggested_fix() -> None:
    # Issue #2350 形态：volume 偏大 100 倍（科创板手/股混淆）
    record = _record(volume=1_000_000_000.0, amount=1_000_000_000.0, close=100.0)
    anomaly = guard.detect_unit_scale_mismatch(record)
    assert anomaly is not None
    assert anomaly["kind"] == guard.ANOMALY_KIND_UNIT_SCALE
    assert anomaly["severity"] == guard.SEVERITY_CRITICAL
    # 建议修复值 = amount / close（物理量纲一致的股数）
    assert anomaly["suggested_fix"] == {"field": "volume", "value": pytest.approx(10_000_000.0)}


def test_unit_scale_skips_when_amount_missing() -> None:
    record = _record(amount=None)
    assert guard.detect_unit_scale_mismatch(record) is None


def test_unit_scale_skips_when_close_missing() -> None:
    record = _record(close=None)
    assert guard.detect_unit_scale_mismatch(record) is None


def test_unit_scale_tolerates_vwap_deviation() -> None:
    # 正常 vwap 偏离（±30%）不误报
    record = _record(volume=10_000_000.0, amount=700_000_000.0, close=100.0)
    assert guard.detect_unit_scale_mismatch(record) is None


# ---------------------------------------------------------------------------
# 纯函数：零量有价 / 历史突变 / 跨源不一致
# ---------------------------------------------------------------------------


def test_zero_volume_with_price_flags_warning() -> None:
    anomaly = guard.detect_zero_volume_with_price(_record(volume=0.0))
    assert anomaly is not None
    assert anomaly["kind"] == guard.ANOMALY_KIND_ZERO_VOLUME
    assert anomaly["severity"] == guard.SEVERITY_WARNING


def test_zero_volume_skipped_when_close_missing() -> None:
    assert guard.detect_zero_volume_with_price(_record(close=None, volume=0.0)) is None


def test_volume_history_jump_catches_100x_spike() -> None:
    record = _record(volume=100_000_000.0, amount=None)
    anomaly = guard.detect_volume_history_jump(record, history_rows=_history())
    assert anomaly is not None
    assert anomaly["kind"] == guard.ANOMALY_KIND_VOLUME_JUMP
    assert anomaly["severity"] == guard.SEVERITY_WARNING


def test_volume_history_jump_needs_min_bars() -> None:
    record = _record(volume=100_000_000.0, amount=None)
    assert guard.detect_volume_history_jump(record, history_rows=_history(days=4)) is None


def test_close_history_jump_catches_big_discontinuity() -> None:
    record = _record(close=3000.0)
    anomaly = guard.detect_close_history_jump(record, history_rows=_history())
    assert anomaly is not None
    assert anomaly["kind"] == guard.ANOMALY_KIND_CLOSE_JUMP


def test_cross_source_mismatch_flags_100x_volume_gap() -> None:
    record = _record(volume=100_000_000.0, data_source="NewFetcher")
    existing = _record(data_source="OldFetcher")
    anomaly = guard.detect_cross_source_mismatch(record, existing_row=existing)
    assert anomaly is not None
    assert anomaly["kind"] == guard.ANOMALY_KIND_CROSS_SOURCE
    assert anomaly["existing_data_source"] == "OldFetcher"


def test_cross_source_mismatch_same_source_skipped() -> None:
    record = _record(volume=100_000_000.0)
    existing = _record(data_source="TestFetcher")
    assert guard.detect_cross_source_mismatch(record, existing_row=existing) is None


def test_cross_source_mismatch_tolerates_small_drift() -> None:
    record = _record(volume=12_000_000.0, data_source="NewFetcher")
    existing = _record(data_source="OldFetcher")
    assert guard.detect_cross_source_mismatch(record, existing_row=existing) is None


def test_detect_daily_row_anomalies_aggregates_and_never_raises() -> None:
    # 正常行 + 缺字段行都不应抛异常；正常行无异常产出
    assert guard.detect_daily_row_anomalies(_record(close=None, amount=None)) == []
    assert (
        guard.detect_daily_row_anomalies(
            _record(volume=1_000_000.0, close=None, amount=None),
            history_rows=_history(),
        )
        == []
    )


# ---------------------------------------------------------------------------
# 纯函数：源切换边界扫描（存量坏数据修复扫描）
# ---------------------------------------------------------------------------


def test_scan_source_switch_discontinuity_finds_boundary_jump() -> None:
    # Issue #2350 存量形态：AkShare 历史（正确股数）→ Tencent 科创板行（偏大 100 倍）
    rows = [
        {"code": "688111", "date": date(2026, 9, 20), "volume": 4_000_000.0, "close": 65.0,
         "data_source": "AkshareFetcher"},
        {"code": "688111", "date": date(2026, 9, 21), "volume": 442_164_000.0, "close": 65.5,
         "data_source": "TencentFetcher"},
    ]
    anomalies = guard.scan_source_switch_discontinuity(
        rows,
        field="volume",
        low=guard.VOLUME_JUMP_RATIO_LOW,
        high=guard.VOLUME_JUMP_RATIO_HIGH,
        kind=guard.ANOMALY_KIND_VOLUME_JUMP,
    )
    assert len(anomalies) == 1
    assert anomalies[0]["kind"] == guard.ANOMALY_KIND_VOLUME_JUMP
    assert anomalies[0]["details_json"]["new_source"] == "TencentFetcher"
    assert anomalies[0]["details_json"]["old_source"] == "AkshareFetcher"


def test_scan_source_switch_discontinuity_without_switch_is_clean() -> None:
    rows = _history(days=3)
    assert (
        guard.scan_source_switch_discontinuity(
            rows,
            field="volume",
            low=guard.VOLUME_JUMP_RATIO_LOW,
            high=guard.VOLUME_JUMP_RATIO_HIGH,
            kind=guard.ANOMALY_KIND_VOLUME_JUMP,
        )
        == []
    )


# ---------------------------------------------------------------------------
# 入库挂钩集成
# ---------------------------------------------------------------------------


def _daily_df(day: date, volume: float, close: float = 100.0, amount: float = None):
    return pd.DataFrame(
        [
            {
                "date": day,
                "open": close,
                "high": close,
                "low": close,
                "close": close,
                "volume": volume,
                "amount": amount if amount is not None else volume * close,
            }
        ]
    )


def test_save_daily_data_records_unit_scale_anomaly(isolated_db) -> None:
    # 偏大 100 倍的 volume + 量纲一致的 amount
    df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    with isolated_db.get_session() as session:
        rows = session.query(StockDataAnomalyRecord).all()
        kinds = {row.kind for row in rows}
        assert guard.ANOMALY_KIND_UNIT_SCALE in kinds
        assert all(row.status == guard.ANOMALY_STATUS_OPEN for row in rows)


def test_save_daily_data_normal_rows_record_nothing(isolated_db) -> None:
    df = _daily_df(date(2026, 9, 21), volume=10_000_000.0)
    isolated_db.save_daily_data(df, code="600519", data_source="AkshareFetcher")

    with isolated_db.get_session() as session:
        assert session.query(StockDataAnomalyRecord).count() == 0


def test_save_daily_data_anomaly_upsert_is_idempotent(isolated_db) -> None:
    df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    with isolated_db.get_session() as session:
        rows = session.query(StockDataAnomalyRecord).filter_by(
            kind=guard.ANOMALY_KIND_UNIT_SCALE
        ).all()
        assert len(rows) == 1


def test_repeat_saves_do_not_refire_anomaly_notification(isolated_db) -> None:
    """单股路径重复触发的防刷屏证据链：同一坏数据重复入库时，
    (code, date, kind, source) 唯一键冲突、created_at 不更新，
    第二轮窗口查询计不到新异常——通知不会重复推送。"""

    from datetime import datetime

    from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository

    repo = StockDataAnomalyRepository(isolated_db)
    df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)

    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")
    baseline = repo.count_recent_anomalies(
        created_since=datetime(2026, 1, 1), status="open"
    )
    assert sum(baseline.values()) == 1
    assert baseline.get("critical", 0) == 1

    # 第二轮"任务"窗口：同一坏数据再次入库 → 幂等 upsert，不产生新行
    second_window_start = datetime.now() + timedelta(seconds=1)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")
    second = repo.count_recent_anomalies(
        created_since=second_window_start, status="open"
    )
    assert second == {}


def test_repaired_anomaly_reopens_when_bad_data_rewritten(isolated_db) -> None:
    """修复后同源再次写入坏数据 → 护栏重新检出 → 状态回开为 open。

    场景：resume/backfill 重写旧日期且坏数据源仍在链路中，此时
    repaired 状态不能继续"掩耳盗铃"，面板与通知需要重新看到它。
    """

    from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository

    df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    repo = StockDataAnomalyRepository(isolated_db)
    updated = repo.mark_status(
        code="600519",
        row_date=date(2026, 9, 21),
        kind=guard.ANOMALY_KIND_UNIT_SCALE,
        data_source="TencentFetcher",
        status="repaired",
    )
    assert updated == 1

    # 同一坏数据再次入库：护栏重新检出，upsert 冲突更新应把 repaired 回开
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    with isolated_db.get_session() as session:
        rows = session.query(StockDataAnomalyRecord).filter_by(
            kind=guard.ANOMALY_KIND_UNIT_SCALE
        ).all()
        assert len(rows) == 1
        assert rows[0].status == "open"


def test_dismissed_anomaly_stays_dismissed_on_re_detection(isolated_db) -> None:
    """人工 dismissed 的异常被再次检出时保持 dismissed（尊重人工判断）。"""

    from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository

    df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    repo = StockDataAnomalyRepository(isolated_db)
    repo.mark_status(
        code="600519",
        row_date=date(2026, 9, 21),
        kind=guard.ANOMALY_KIND_UNIT_SCALE,
        data_source="TencentFetcher",
        status="dismissed",
    )

    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    with isolated_db.get_session() as session:
        rows = session.query(StockDataAnomalyRecord).filter_by(
            kind=guard.ANOMALY_KIND_UNIT_SCALE
        ).all()
        assert len(rows) == 1
        assert rows[0].status == "dismissed"


def test_save_daily_data_guard_disabled_writes_no_anomalies(isolated_db) -> None:
    os.environ["DATA_QUALITY_GUARD_ENABLED"] = "false"
    Config.reset_instance()
    try:
        df = _daily_df(date(2026, 9, 21), volume=1_000_000_000.0, amount=1_000_000_000.0)
        isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")
    finally:
        os.environ["DATA_QUALITY_GUARD_ENABLED"] = "true"
        Config.reset_instance()

    with isolated_db.get_session() as session:
        assert session.query(StockDataAnomalyRecord).count() == 0


def test_save_daily_data_catches_source_switch_volume_jump(isolated_db) -> None:
    # 先入库 10 天正常量（Akshare），再以另一来源写入偏大 100 倍的量
    history = pd.DataFrame(
        [
            {
                "date": date(2026, 9, 1 + i),
                "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0,
                "volume": 1_000_000.0, "amount": 100_000_000.0,
            }
            for i in range(10)
        ]
    )
    isolated_db.save_daily_data(history, code="600519", data_source="AkshareFetcher")
    # amount 缺失（腾讯日线形态），unit 检测不可用，靠历史突变检测兜底
    df = _daily_df(date(2026, 9, 21), volume=100_000_000.0, amount=None)
    isolated_db.save_daily_data(df, code="600519", data_source="TencentFetcher")

    with isolated_db.get_session() as session:
        kinds = {
            row.kind for row in session.query(StockDataAnomalyRecord).all()
        }
        assert guard.ANOMALY_KIND_VOLUME_JUMP in kinds


# ---------------------------------------------------------------------------
# 存量扫描与修复（data_repair_service）
# ---------------------------------------------------------------------------


def _seed_scan_fixture(isolated_db) -> None:
    """构造 #2350 形态的存量数据：AkShare 正确历史 + Tencent 偏大 100 倍行。"""
    today = date.today()
    history = pd.DataFrame(
        [
            {
                "date": today - timedelta(days=10 - i),
                "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0,
                "volume": 4_000_000.0, "amount": 400_000_000.0,
            }
            for i in range(10)
        ]
    )
    isolated_db.save_daily_data(history, code="688111", data_source="AkshareFetcher")
    # Tencent 行：volume 偏大 100 倍但 amount 量纲一致 → 可修复（amount/close）
    bad = _daily_df(today, volume=400_000_000.0, amount=400_000_000.0)
    isolated_db.save_daily_data(bad, code="688111", data_source="TencentFetcher")


def test_scan_stock_daily_quality_reports_unit_and_boundary_anomalies(isolated_db) -> None:
    from src.services.data_repair_service import scan_stock_daily_quality

    _seed_scan_fixture(isolated_db)
    report = scan_stock_daily_quality(isolated_db, days=90)

    kinds = {item["kind"] for item in report["anomalies"]}
    # 偏大 100 倍行同时命中量纲校验与源切换边界突变
    assert guard.ANOMALY_KIND_UNIT_SCALE in kinds
    assert guard.ANOMALY_KIND_VOLUME_JUMP in kinds
    assert report["summary"][guard.ANOMALY_KIND_UNIT_SCALE] >= 1
    fixable = report["fixable"]
    assert len(fixable) >= 1
    assert fixable[0]["suggested_fix"]["field"] == "volume"
    assert fixable[0]["suggested_fix"]["value"] == pytest.approx(4_000_000.0)


def test_apply_volume_fixes_repairs_rows_and_marks_anomalies(isolated_db) -> None:
    from src.services.data_repair_service import apply_volume_fixes, scan_stock_daily_quality
    from src.storage import StockDaily

    _seed_scan_fixture(isolated_db)
    report = scan_stock_daily_quality(isolated_db, days=90)
    assert report["fixable"]

    result = apply_volume_fixes(report["fixable"], isolated_db)
    assert result["applied"] == 1

    with isolated_db.get_session() as session:
        row = (
            session.query(StockDaily)
            .filter(StockDaily.code == "688111", StockDaily.date == date.today())
            .one()
        )
        assert row.volume == pytest.approx(4_000_000.0)
        statuses = {
            row.status
            for row in session.query(StockDataAnomalyRecord).filter_by(
                kind=guard.ANOMALY_KIND_UNIT_SCALE
            ).all()
        }
        assert statuses == {guard.ANOMALY_STATUS_REPAIRED}


def test_apply_volume_fixes_skips_small_deltas(isolated_db) -> None:
    from src.services.data_repair_service import apply_volume_fixes

    # suggested 与当前值差异不足 20% → 跳过不写
    fixes = [
        {
            "code": "600519",
            "date": date(2026, 9, 21),
            "kind": guard.ANOMALY_KIND_UNIT_SCALE,
            "severity": guard.SEVERITY_CRITICAL,
            "data_source": "TestFetcher",
            "details_json": {},
            "suggested_fix": {"field": "volume", "value": 100.0},
        }
    ]
    result = apply_volume_fixes(fixes, isolated_db)
    assert result["applied"] == 0
    assert result["skipped"] == 1


def test_apply_volume_fixes_skips_vwap_deviation_false_positive(isolated_db) -> None:
    """P0 回归：vwap/close 正常极端偏差（如港股闪崩日 6.7 倍）只报告不修改。

    ratio 不接近已知单位换算错误（100 倍量级）时，置信门槛一必须拦下，
    防止 --data-quality-apply 把正确 volume 放大 6.7 倍写库。
    """

    from src.services.data_repair_service import apply_volume_fixes, scan_stock_daily_quality
    from src.storage import StockDaily

    today = date.today()
    history = pd.DataFrame(
        [
            {
                "date": today - timedelta(days=10 - i),
                "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0,
                "volume": 4_000_000.0, "amount": 400_000_000.0,
            }
            for i in range(10)
        ]
    )
    isolated_db.save_daily_data(history, code="00700", data_source="FutuFetcher")
    # "正确"行：成交前置的闪崩日，vwap/close=6.7 → 检测出界但非单位错误
    crash = _daily_df(today, volume=4_000_000.0, close=100.0, amount=2_680_000_000.0)
    isolated_db.save_daily_data(crash, code="00700", data_source="FutuFetcher")

    report = scan_stock_daily_quality(isolated_db, days=90)
    fixable = [f for f in report["fixable"] if f["code"] == "00700"]
    assert fixable, "检测层应标记该行（ratio=6.7 出界）"

    result = apply_volume_fixes(report["fixable"], isolated_db)
    assert result["applied"] == 0
    assert result["skipped"] >= 1

    with isolated_db.get_session() as session:
        row = (
            session.query(StockDaily)
            .filter(StockDaily.code == "00700", StockDaily.date == today)
            .one()
        )
        # 正确数据未被改坏
        assert row.volume == pytest.approx(4_000_000.0)


def test_apply_volume_fixes_skips_absurd_amount_unit(isolated_db) -> None:
    """置信门槛二：ratio 接近 100（过门槛一）但修复值与近期量级
    相差 100 倍（amount 自身单位错误）→ 拒绝写入。"""

    from src.services.data_repair_service import apply_volume_fixes, scan_stock_daily_quality
    from src.storage import StockDaily

    today = date.today()
    history = pd.DataFrame(
        [
            {
                "date": today - timedelta(days=10 - i),
                "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0,
                "volume": 4_000_000.0, "amount": 400_000_000.0,
            }
            for i in range(10)
        ]
    )
    isolated_db.save_daily_data(history, code="600519", data_source="AkshareFetcher")
    # volume 正确、amount 偏大 100 倍 → ratio=100 过门槛一，
    # 但 suggested=amount/close=4 亿 是近期量级的 100 倍 → 门槛二拦下
    bad_amount = _daily_df(today, volume=4_000_000.0, close=100.0, amount=40_000_000_000.0)
    isolated_db.save_daily_data(bad_amount, code="600519", data_source="AkshareFetcher")

    report = scan_stock_daily_quality(isolated_db, days=90)
    result = apply_volume_fixes(report["fixable"], isolated_db)
    assert result["applied"] == 0

    with isolated_db.get_session() as session:
        row = (
            session.query(StockDaily)
            .filter(StockDaily.code == "600519", StockDaily.date == today)
            .one()
        )
        assert row.volume == pytest.approx(4_000_000.0)


def test_apply_volume_fixes_remark_is_idempotent(isolated_db) -> None:
    """两段中断自愈回归：值已修好但状态未标时，重跑 apply 补标而非跳过。"""

    from src.services.data_repair_service import apply_volume_fixes, scan_stock_daily_quality

    _seed_scan_fixture(isolated_db)
    report = scan_stock_daily_quality(isolated_db, days=90)

    first = apply_volume_fixes(report["fixable"], isolated_db)
    assert first["applied"] == 1
    assert first["re_marked"] == 0

    second = apply_volume_fixes(report["fixable"], isolated_db)
    assert second["applied"] == 0
    assert second["re_marked"] == 1

    with isolated_db.get_session() as session:
        statuses = {
            row.status
            for row in session.query(StockDataAnomalyRecord).filter_by(
                kind=guard.ANOMALY_KIND_UNIT_SCALE
            ).all()
        }
        assert statuses == {guard.ANOMALY_STATUS_REPAIRED}


def test_apply_volume_fixes_backfills_ledger_for_legacy_rows(isolated_db) -> None:
    """护栏启用前的存量坏行：修复时台账缺记录 → 先补录再置 repaired。"""

    from src.services.data_repair_service import apply_volume_fixes, scan_stock_daily_quality

    today = date.today()
    history = pd.DataFrame(
        [
            {
                "date": today - timedelta(days=10 - i),
                "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0,
                "volume": 4_000_000.0, "amount": 400_000_000.0,
            }
            for i in range(10)
        ]
    )
    # 模拟护栏关闭时代的入库：无异常台账
    old_flag = os.environ.get("DATA_QUALITY_GUARD_ENABLED")
    try:
        os.environ["DATA_QUALITY_GUARD_ENABLED"] = "false"
        Config.reset_instance()
        isolated_db.save_daily_data(history, code="688111", data_source="AkshareFetcher")
        bad = _daily_df(today, volume=400_000_000.0, amount=400_000_000.0)
        isolated_db.save_daily_data(bad, code="688111", data_source="TencentFetcher")
    finally:
        if old_flag is None:
            os.environ.pop("DATA_QUALITY_GUARD_ENABLED", None)
        else:
            os.environ["DATA_QUALITY_GUARD_ENABLED"] = old_flag
        Config.reset_instance()

    with isolated_db.get_session() as session:
        assert session.query(StockDataAnomalyRecord).count() == 0

    report = scan_stock_daily_quality(isolated_db, days=90)
    result = apply_volume_fixes(report["fixable"], isolated_db)
    assert result["applied"] == 1

    with isolated_db.get_session() as session:
        rows = session.query(StockDataAnomalyRecord).filter_by(
            kind=guard.ANOMALY_KIND_UNIT_SCALE
        ).all()
        assert len(rows) == 1
        assert rows[0].status == guard.ANOMALY_STATUS_REPAIRED


def test_scan_stock_daily_quality_respects_code_filter(isolated_db) -> None:
    from src.services.data_repair_service import scan_stock_daily_quality

    _seed_scan_fixture(isolated_db)
    report = scan_stock_daily_quality(isolated_db, codes=["000001"], days=90)
    assert report["codes_scanned"] == 0
    assert report["anomalies"] == []


def test_scan_report_formatting_outputs_actionable_text(isolated_db) -> None:
    from src.services.data_repair_service import format_scan_report, scan_stock_daily_quality

    _seed_scan_fixture(isolated_db)
    report = scan_stock_daily_quality(isolated_db, days=90)
    text = format_scan_report(report)
    assert "数据质量扫描报告" in text
    assert "unit_scale_mismatch" in text
    assert "--data-quality-apply" in text


# ---------------------------------------------------------------------------
# 只读 anomalies API（GET /api/v1/data/anomalies）
# ---------------------------------------------------------------------------


@pytest.fixture()
def anomalies_api(tmp_path):
    """带关鉴权 .env 的 API client + 隔离 DB（仿 test_decision_signal_outcome_api）。"""

    from pathlib import Path
    from unittest.mock import MagicMock

    from fastapi.testclient import TestClient

    import src.auth as auth
    from api.app import create_app

    if "litellm" not in sys.modules:  # pragma: no cover - 环境兜底
        try:
            import litellm  # noqa: F401
        except ModuleNotFoundError:
            sys.modules["litellm"] = MagicMock()

    def _reset_auth_globals() -> None:
        auth._auth_enabled = None
        auth._session_secret = None
        auth._password_hash_salt = None
        auth._password_hash_stored = None
        auth._rate_limit = {}

    old_env_file = os.environ.get("ENV_FILE")
    env_path = tmp_path / ".env"
    db_path = tmp_path / "data_anomalies_api.db"
    static_dir = tmp_path / "empty-static"
    static_dir.mkdir()
    env_text = "\n".join(
        [
            "STOCK_LIST=600519",
            "GEMINI_API_KEY=test",
            "ADMIN_AUTH_ENABLED=false",
            "DATA_QUALITY_GUARD_ENABLED=true",
            f"DATABASE_PATH={db_path}",
        ]
    ) + "\n"
    env_snapshot = _env_snapshot(env_text)
    env_path.write_text(env_text, encoding="utf-8")
    os.environ["ENV_FILE"] = str(env_path)
    os.environ["DATABASE_PATH"] = str(db_path)
    os.environ["DATA_QUALITY_GUARD_ENABLED"] = "true"
    _reset_auth_globals()
    Config.reset_instance()
    DatabaseManager.reset_instance()
    app = create_app(static_dir=Path(static_dir))
    client = TestClient(app)
    db = DatabaseManager.get_instance()
    try:
        yield client, db
    finally:
        DatabaseManager.reset_instance()
        _env_restore(env_snapshot)
        _reset_auth_globals()
        if old_env_file is None:
            os.environ.pop("ENV_FILE", None)
        else:
            os.environ["ENV_FILE"] = old_env_file
        Config.reset_instance()


def test_data_anomalies_api_returns_items_and_summary(anomalies_api) -> None:
    client, db = anomalies_api
    _seed_scan_fixture(db)

    resp = client.get("/api/v1/data/anomalies")

    assert resp.status_code == 200
    payload = resp.json()
    kinds = {item["kind"] for item in payload["items"]}
    assert kinds == {"unit_scale_mismatch", "volume_history_jump"}
    summary = payload["summary"]
    assert summary["open_critical"] >= 1
    assert summary["open_by_kind"]["unit_scale_mismatch"] >= 1
    assert summary["total_by_status"].get("open") >= 2
    # details 解析为对象（检测明细），suggested_fix 含修复值
    unit_item = next(i for i in payload["items"] if i["kind"] == "unit_scale_mismatch")
    assert unit_item["details"] and "volume" in unit_item["details"]
    assert unit_item["suggested_fix"]["field"] == "volume"


def test_data_anomalies_api_filters(anomalies_api) -> None:
    client, db = anomalies_api
    _seed_scan_fixture(db)

    by_code = client.get("/api/v1/data/anomalies", params={"code": "000001"})
    by_kind = client.get("/api/v1/data/anomalies", params={"kind": "unit_scale_mismatch"})
    all_status = client.get("/api/v1/data/anomalies", params={"status": "all"})

    assert by_code.status_code == 200
    assert by_code.json()["items"] == []
    assert by_kind.json()["summary"]["open_critical"] >= 1
    assert {i["kind"] for i in by_kind.json()["items"]} == {"unit_scale_mismatch"}
    # status=all 与默认 open 在本夹具下等价（无 repaired/dismissed）
    assert len(all_status.json()["items"]) >= len(by_kind.json()["items"])

    # status 参数归一化：大小写/空白不敏感，Open 与 open 等价
    upper = client.get("/api/v1/data/anomalies", params={"status": " Open "})
    assert upper.status_code == 200
    assert len(upper.json()["items"]) == len(
        client.get("/api/v1/data/anomalies", params={"status": "open"}).json()["items"]
    )


def test_data_anomalies_api_marks_repaired_rows(anomalies_api) -> None:
    from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository

    client, db = anomalies_api
    _seed_scan_fixture(db)
    repo = StockDataAnomalyRepository(db)
    for row in repo.list_anomalies(status="open"):
        repo.mark_status(
            code=row.code,
            row_date=row.date,
            kind=row.kind,
            data_source=row.data_source,
            status="repaired",
        )

    open_resp = client.get("/api/v1/data/anomalies")
    all_resp = client.get("/api/v1/data/anomalies", params={"status": "all"})

    assert open_resp.json()["items"] == []
    assert all_resp.json()["items"]
    assert all_resp.json()["summary"]["total_by_status"].get("repaired", 0) >= 1
    assert all_resp.json()["summary"]["open_critical"] == 0


def test_data_anomalies_api_empty_db(anomalies_api) -> None:
    client, db = anomalies_api

    resp = client.get("/api/v1/data/anomalies")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"] == []
    assert payload["summary"]["open_critical"] == 0
    assert payload["summary"]["total_by_status"] == {}


# ---------------------------------------------------------------------------
# 数据质量异常通知（system_error 路由）
# ---------------------------------------------------------------------------


class _FakeNotifier:
    def __init__(self):
        self.calls = []

    def send(self, content, **kwargs):
        self.calls.append((content, kwargs))
        return True


class _RaisingNotifier:
    def send(self, content, **kwargs):
        raise RuntimeError("channel down")


def test_notify_new_daily_anomalies_sends_aggregated_alert(isolated_db) -> None:
    from datetime import datetime

    from src.services.data_quality_notify import notify_new_daily_anomalies

    _seed_scan_fixture(isolated_db)
    fake = _FakeNotifier()

    sent = notify_new_daily_anomalies(
        isolated_db,
        created_since=datetime.now() - timedelta(minutes=10),
        notifier=fake,
    )

    assert sent is True
    assert len(fake.calls) == 1
    content, kwargs = fake.calls[0]
    assert kwargs["route_type"] == "system_error"
    # 存在 critical（unit_scale_mismatch）→ severity=error
    assert kwargs["severity"] == "error"
    assert kwargs["dedup_key"].startswith("data_quality_anomaly:")
    assert "unit_scale_mismatch" in content
    assert "688111" in content
    assert "--data-quality" in content
    # 降噪 key 带批次日期（跨日新异常不被前一天吞掉），cooldown 保留 kind 维度
    assert kwargs["dedup_key"].endswith(f":{date.today().isoformat()}")
    assert "unit_scale_mismatch" in kwargs["cooldown_key"]
    # 全量计数与展示条数一致时无截断标注
    assert "仅展示" not in content


def test_notify_new_daily_anomalies_window_filter(isolated_db) -> None:
    from datetime import datetime

    from src.services.data_quality_notify import notify_new_daily_anomalies

    _seed_scan_fixture(isolated_db)
    fake = _FakeNotifier()

    # 窗口晚于异常 created_at → 本轮没有"新"异常，静默跳过
    sent = notify_new_daily_anomalies(
        isolated_db,
        created_since=datetime.now() + timedelta(minutes=10),
        notifier=fake,
    )

    assert sent is False
    assert fake.calls == []


def test_notify_new_daily_anomalies_respects_disabled_flag(isolated_db) -> None:
    from datetime import datetime

    from src.services.data_quality_notify import notify_new_daily_anomalies

    _seed_scan_fixture(isolated_db)
    fake = _FakeNotifier()
    old_flag = os.environ.get("DATA_QUALITY_NOTIFY_ENABLED")
    try:
        os.environ["DATA_QUALITY_NOTIFY_ENABLED"] = "false"
        Config.reset_instance()
        sent = notify_new_daily_anomalies(
            isolated_db,
            created_since=datetime.now() - timedelta(minutes=10),
            notifier=fake,
        )
    finally:
        if old_flag is None:
            os.environ.pop("DATA_QUALITY_NOTIFY_ENABLED", None)
        else:
            os.environ["DATA_QUALITY_NOTIFY_ENABLED"] = old_flag
        Config.reset_instance()
    assert sent is False
    assert fake.calls == []


def test_notify_marks_truncation_when_exceeding_display_limit(isolated_db) -> None:
    """P1 回归：新异常超过展示上限时，计数用 SQL 全量、消息标注截断、
    critical 不因子集被截而降级为 warning。"""

    from datetime import datetime

    from src.services.data_quality_notify import notify_new_daily_anomalies

    # 直插 600 条异常（绕过护栏批量写入的检测开销）
    with isolated_db.get_session() as session:
        for i in range(599):
            session.add(
                StockDataAnomalyRecord(
                    code=f"6889{i:03d}",
                    date=date.today(),
                    kind=guard.ANOMALY_KIND_VOLUME_JUMP,
                    severity=guard.SEVERITY_WARNING,
                    data_source="TestFetcher",
                    status="open",
                )
            )
        session.add(
            StockDataAnomalyRecord(
                code="688111",
                date=date.today(),
                kind=guard.ANOMALY_KIND_UNIT_SCALE,
                severity=guard.SEVERITY_CRITICAL,
                data_source="TestFetcher",
                status="open",
            )
        )
        session.commit()

    fake = _FakeNotifier()
    sent = notify_new_daily_anomalies(
        isolated_db,
        created_since=datetime.now() - timedelta(minutes=10),
        notifier=fake,
    )

    assert sent is True
    content, kwargs = fake.calls[0]
    # 全量计数：600 而不是截断后的 500
    assert "600" in content
    assert "仅展示" in content
    # critical 在 500 条之外：全量聚合保证告警仍是 error 级
    assert kwargs["severity"] == "error"


def test_list_anomalies_orders_critical_before_warning(isolated_db) -> None:
    """P1 回归：severity 字符串字典序与严重程度相反，必须显映射排序。"""

    from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository

    with isolated_db.get_session() as session:
        session.add(
            StockDataAnomalyRecord(
                code="600000",
                date=date.today(),
                kind=guard.ANOMALY_KIND_VOLUME_JUMP,
                severity=guard.SEVERITY_WARNING,
                data_source="TestFetcher",
                status="open",
            )
        )
        session.add(
            StockDataAnomalyRecord(
                code="600001",
                date=date.today(),
                kind=guard.ANOMALY_KIND_UNIT_SCALE,
                severity=guard.SEVERITY_CRITICAL,
                data_source="TestFetcher",
                status="open",
            )
        )
        session.commit()

    repo = StockDataAnomalyRepository(isolated_db)
    rows = repo.list_anomalies(status="open", limit=10)
    assert len(rows) == 2
    assert rows[0].severity == guard.SEVERITY_CRITICAL
    assert rows[0].code == "600001"


def test_send_notification_fail_open(isolated_env) -> None:
    from src.services.data_quality_notify import send_data_quality_anomaly_notification

    rows = [{"code": "600519", "kind": "unit_scale_mismatch", "severity": "critical"}]
    # 渠道抛异常 → 返回 False，绝不向上抛
    assert send_data_quality_anomaly_notification(rows, notifier=_RaisingNotifier()) is False
    assert send_data_quality_anomaly_notification([], notifier=_FakeNotifier()) is False


def test_anomaly_alert_content_languages_and_truncation() -> None:
    from src.services.data_quality_notify import (
        _MAX_CODES_PER_KIND,
        build_anomaly_alert_content,
    )

    rows = [
        {"code": f"6889{i:02d}", "kind": "unit_scale_mismatch", "severity": "critical"}
        for i in range(_MAX_CODES_PER_KIND + 2)
    ]
    zh = build_anomaly_alert_content(rows, report_language="zh")
    en = build_anomaly_alert_content(rows, report_language="en")
    ko = build_anomaly_alert_content(rows, report_language="ko")
    assert "unit_scale_mismatch" in zh and "等 7 只" in zh
    assert "critical" in en
    assert "심각" in ko
    # 未知语言回退 zh
    assert "等 7 只" in build_anomaly_alert_content(rows, report_language="fr")


def test_pipeline_notify_hook_spawns_worker(isolated_db, monkeypatch) -> None:
    import threading
    from datetime import datetime

    from src.core.pipeline import StockAnalysisPipeline
    from src.services import data_quality_notify as notify_mod

    _seed_scan_fixture(isolated_db)
    called = threading.Event()
    captured: dict = {}

    def fake_notify(db_manager, *, created_since, **kwargs):
        captured["since"] = created_since
        captured["kwargs"] = kwargs
        called.set()
        return True

    monkeypatch.setattr(notify_mod, "notify_new_daily_anomalies", fake_notify)
    pipeline = object.__new__(StockAnalysisPipeline)
    since = datetime.now() - timedelta(minutes=5)

    pipeline._notify_data_quality_anomalies_async(since)

    assert called.wait(timeout=5)
    assert captured["since"] == since
    # 线程句柄已保留：join_data_quality_notify 可有界等待
    assert getattr(pipeline, "_data_quality_notify_thread") is not None
    pipeline.join_data_quality_notify(timeout_seconds=5)


def test_join_data_quality_notify_gives_up_after_timeout(isolated_db, monkeypatch) -> None:
    """join 的超时放弃分支：worker 未完成时按 timeout 返回、不无限阻塞；
    放行后再次 join 可排空线程（CLI 退出路径的 best-effort 语义）。"""

    import threading
    import time as time_module
    from datetime import datetime

    from src.core.pipeline import StockAnalysisPipeline
    from src.services import data_quality_notify as notify_mod

    _seed_scan_fixture(isolated_db)
    started = threading.Event()
    release = threading.Event()

    def blocking_notify(db_manager, *, created_since, **kwargs):
        started.set()
        release.wait(timeout=10)

    monkeypatch.setattr(notify_mod, "notify_new_daily_anomalies", blocking_notify)
    pipeline = object.__new__(StockAnalysisPipeline)

    pipeline._notify_data_quality_anomalies_async(datetime.now() - timedelta(minutes=5))
    assert started.wait(timeout=5)

    begin = time_module.monotonic()
    pipeline.join_data_quality_notify(timeout_seconds=0.05)
    elapsed = time_module.monotonic() - begin
    assert elapsed < 2.0
    # 线程仍在运行：join 只是放弃等待
    assert getattr(pipeline, "_data_quality_notify_thread").is_alive()

    release.set()
    pipeline.join_data_quality_notify(timeout_seconds=5)
    assert not getattr(pipeline, "_data_quality_notify_thread").is_alive()


def test_main_join_helper_is_fail_open(isolated_db, monkeypatch) -> None:
    """main._join_data_quality_notify：pipeline 为 None 时跳过、join 抛错时
    静默放过、正常线程可排空——任何情况下不向调用方抛异常。"""

    import threading
    from datetime import datetime

    import main as main_module
    from src.core.pipeline import StockAnalysisPipeline
    from src.services import data_quality_notify as notify_mod

    _seed_scan_fixture(isolated_db)

    # None / 缺方法 / 抛错：均不抛出
    main_module._join_data_quality_notify(None)

    class BrokenPipeline:
        def join_data_quality_notify(self, *args, **kwargs):
            raise RuntimeError("boom")

    main_module._join_data_quality_notify(BrokenPipeline())

    called = threading.Event()

    def quick_notify(db_manager, *, created_since, **kwargs):
        called.set()

    monkeypatch.setattr(notify_mod, "notify_new_daily_anomalies", quick_notify)
    pipeline = object.__new__(StockAnalysisPipeline)
    pipeline._notify_data_quality_anomalies_async(datetime.now())
    assert called.wait(timeout=5)

    main_module._join_data_quality_notify(pipeline, timeout_seconds=5)
    assert not getattr(pipeline, "_data_quality_notify_thread").is_alive()


def test_pipeline_run_fires_quality_notify_on_crash(isolated_db, monkeypatch) -> None:
    """P2 回归：run() 中途抛异常时，本轮已入库的异常仍要推送（此前
    只在正常收尾触发，崩溃轮次的告警会静默丢失）。"""

    from src.core.pipeline import StockAnalysisPipeline

    fired: list = []

    pipeline = object.__new__(StockAnalysisPipeline)
    monkeypatch.setattr(
        StockAnalysisPipeline, "_run_impl", lambda self, **kwargs: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    monkeypatch.setattr(
        StockAnalysisPipeline,
        "_notify_data_quality_anomalies_async",
        lambda self, since: fired.append(since),
    )

    with pytest.raises(RuntimeError):
        pipeline.run(stock_codes=["600519"], dry_run=False)

    assert len(fired) == 1


def test_pipeline_run_skips_quality_notify_on_dry_run(isolated_db, monkeypatch) -> None:
    """dry-run 只记录不推送（既有语义不回归）。"""

    from src.core.pipeline import StockAnalysisPipeline

    fired: list = []
    pipeline = object.__new__(StockAnalysisPipeline)
    monkeypatch.setattr(
        StockAnalysisPipeline, "_run_impl", lambda self, **kwargs: []
    )
    monkeypatch.setattr(
        StockAnalysisPipeline,
        "_notify_data_quality_anomalies_async",
        lambda self, since: fired.append(since),
    )

    assert pipeline.run(stock_codes=["600519"], dry_run=True) == []
    assert fired == []


def test_single_stock_entry_fires_quality_notify(isolated_db, monkeypatch) -> None:
    """P2 回归：单股入口（API/任务队列/CLI 单股）收尾触发告警；
    skip_analysis（仅取数）与异常路径语义正确。"""

    from src.core.pipeline import StockAnalysisPipeline

    fired: list = []
    pipeline = object.__new__(StockAnalysisPipeline)

    def fake_impl(self, code, **kwargs):
        if code == "000000":
            raise RuntimeError("boom")
        return object()

    monkeypatch.setattr(StockAnalysisPipeline, "process_single_stock", fake_impl)
    monkeypatch.setattr(
        StockAnalysisPipeline,
        "_notify_data_quality_anomalies_async",
        lambda self, since: fired.append(since),
    )

    # 正常路径：触发一次
    pipeline.process_single_stock_with_quality_notify("600519", skip_analysis=False)
    assert len(fired) == 1

    # 仅取数：不触发
    pipeline.process_single_stock_with_quality_notify("600519", skip_analysis=True)
    assert len(fired) == 1

    # 异常路径：也触发（finally 兜底），且异常向上传播
    with pytest.raises(RuntimeError):
        pipeline.process_single_stock_with_quality_notify("000000", skip_analysis=False)
    assert len(fired) == 2
