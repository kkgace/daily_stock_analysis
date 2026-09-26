# -*- coding: utf-8 -*-
"""数据质量扫描与修复服务（--data-quality CLI 的后端）。

职责：
1. ``scan``：对 stock_daily 存量数据运行与入库护栏同一套纯检测规则
   （量纲交叉校验 + 源切换边界突变扫描），产出异常报告与可修复清单。
2. ``apply_volume_fixes``：把量纲错误的 volume 修复为
   ``amount / close``（物理量纲一致的股数），并把对应异常记录置为
   repaired。只修复有 amount 佐证的高置信项；跳变类异常仅报告，
   不自动修复（需人工确认来源口径）。

与入库护栏（src/services/data_quality_guard.py）共用阈值与规则，
保证「入库时发现的问题」与「存量扫描发现的问题」口径一致。
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository
from src.services import data_quality_guard as guard
from src.storage import DatabaseManager, StockDaily

logger = logging.getLogger(__name__)

DEFAULT_SCAN_DAYS = 90
MAX_SCAN_ROWS = 200_000

# 自动修复的二级置信门槛：量纲比值必须接近已知单位换算错误
# （手↔股的 100 倍量级）。vwap/close 在正常行情下的极端偏差
# （港股/美股无涨跌停，闪崩日可达 5~19 倍）在这里被拦下——只报告，不修改。
APPLY_RATIO_WINDOWS: Tuple[Tuple[float, float], ...] = ((20.0, 500.0), (0.002, 0.05))
# 修复值必须与近 10 根 K 线成交量中位数同数量级（防 amount 本身异常）
APPLY_HISTORY_LOOKBACK = 10
APPLY_HISTORY_MEDIAN_RATIO = (0.1, 10.0)


def scan_stock_daily_quality(
    db: Optional[DatabaseManager] = None,
    *,
    codes: Optional[List[str]] = None,
    days: int = DEFAULT_SCAN_DAYS,
) -> Dict[str, Any]:
    """扫描存量日线数据的质量问题（只读，不修改任何数据）。

    Args:
        db: 数据库管理器（默认单例）。
        codes: 限定股票代码列表；None 表示扫描全部。
        days: 扫描最近 N 个自然日的数据。

    Returns:
        报告 dict：codes_scanned / rows_scanned / anomalies /
        fixable / summary。
    """

    database = db or DatabaseManager.get_instance()
    date_from = date.today() - timedelta(days=max(1, int(days)))

    conditions = [StockDaily.date >= date_from]
    if codes:
        conditions.append(StockDaily.code.in_(codes))
    where = and_(*conditions)

    rows_by_code: Dict[str, List[Dict[str, Any]]] = {}
    with database.get_session() as session:
        total_rows = session.execute(
            select(func.count(StockDaily.id)).where(where)
        ).scalar() or 0
        if total_rows > MAX_SCAN_ROWS:
            raise ValueError(
                f"扫描范围过大（{total_rows} 行 > {MAX_SCAN_ROWS}），"
                "请用 --data-quality-code 或 --data-quality-days 收窄范围"
            )
        for row in session.execute(
            select(StockDaily).where(where).order_by(StockDaily.code, StockDaily.date)
        ).scalars():
            rows_by_code.setdefault(row.code, []).append(
                {
                    "code": row.code,
                    "date": row.date,
                    "open": row.open,
                    "high": row.high,
                    "low": row.low,
                    "close": row.close,
                    "volume": row.volume,
                    "amount": row.amount,
                    "data_source": row.data_source,
                }
            )

    anomalies: List[Dict[str, Any]] = []
    for code_rows in rows_by_code.values():
        # 行级量纲校验
        for row in code_rows:
            unit = guard.detect_unit_scale_mismatch(row)
            if unit:
                anomalies.append(unit)
        # 源切换边界突变（Issue #2350 存量坏数据的暴露形态）
        anomalies.extend(
            guard.scan_source_switch_discontinuity(
                code_rows,
                field="volume",
                low=guard.VOLUME_JUMP_RATIO_LOW,
                high=guard.VOLUME_JUMP_RATIO_HIGH,
                kind=guard.ANOMALY_KIND_VOLUME_JUMP,
            )
        )
        anomalies.extend(
            guard.scan_source_switch_discontinuity(
                code_rows,
                field="close",
                low=guard.CLOSE_JUMP_RATIO_LOW,
                high=guard.CLOSE_JUMP_RATIO_HIGH,
                kind=guard.ANOMALY_KIND_CLOSE_JUMP,
            )
        )

    summary: Dict[str, int] = {}
    for item in anomalies:
        summary[item["kind"]] = summary.get(item["kind"], 0) + 1

    fixable = [item for item in anomalies if item.get("suggested_fix")]
    return {
        "window_days": max(1, int(days)),
        "date_from": date_from,
        "codes_scanned": len(rows_by_code),
        "rows_scanned": sum(len(items) for items in rows_by_code.values()),
        "anomalies": anomalies,
        "fixable": fixable,
        "summary": summary,
    }


def _passes_ratio_gate(ratio: Any) -> bool:
    """量纲比值是否接近已知单位换算错误（≈100x 或 ≈1/100x）。"""

    try:
        value = float(ratio)
    except (TypeError, ValueError):
        return False
    return any(low <= value <= high for low, high in APPLY_RATIO_WINDOWS)


def _history_median_volume(session: Session, code: str, before: date) -> Optional[float]:
    """取 before 之前近 N 根 K 线成交量中位数（只看正数）。"""

    volumes = [
        float(v)
        for v in session.execute(
            select(StockDaily.volume)
            .where(
                and_(
                    StockDaily.code == code,
                    StockDaily.date < before,
                    StockDaily.volume > 0,
                )
            )
            .order_by(StockDaily.date.desc())
            .limit(APPLY_HISTORY_LOOKBACK)
        ).scalars().all()
        if v is not None
    ]
    if not volumes:
        return None
    ordered = sorted(volumes)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _mark_anomaly_repaired(
    repo: StockDataAnomalyRepository,
    database: DatabaseManager,
    item: Dict[str, Any],
) -> None:
    """把修复项对应的异常记录置为 repaired；台账缺记录时先补一条。"""

    def _do_mark() -> int:
        return repo.mark_status(
            code=item["code"],
            row_date=item["date"],
            kind=guard.ANOMALY_KIND_UNIT_SCALE,
            data_source=item.get("data_source") or "Unknown",
            status=guard.ANOMALY_STATUS_REPAIRED,
        )

    if _do_mark() == 0:
        # 护栏启用前的存量问题没有台账记录：先按检测结果补录一条再置 repaired，
        # 保证 /api/v1/data/anomalies 与 Web 面板对这些修复可见。
        database.record_data_anomaly(item)
        _do_mark()


def apply_volume_fixes(
    fixes: List[Dict[str, Any]],
    db: Optional[DatabaseManager] = None,
    *,
    anomaly_repo: Optional[StockDataAnomalyRepository] = None,
) -> Dict[str, Any]:
    """应用量纲修复：把 volume 更新为 suggested_fix 值。

    安全边界：
    - 只处理 unit_scale_mismatch 且带 amount/close 佐证的 suggested_fix；
    - 置信门槛一：量纲比值必须接近已知单位换算错误（≈100 倍量级），
      vwap/close 正常极端偏差（闪崩日 5~19 倍）只报告不修改；
    - 置信门槛二：修复值必须与近 10 根成交量中位数同数量级；
    - suggested 值与当前值差异不足 20% 时跳过（避免无效写与抖动），
      但数据已与目标一致时补标异常（防"值已修、状态未标"永久卡 open）；
    - 对应 stock_data_anomalies 记录置为 repaired（缺记录时先补录）。
    """

    database = db or DatabaseManager.get_instance()
    repo = anomaly_repo or StockDataAnomalyRepository(database)
    applied = 0
    skipped = 0
    re_marked = 0
    for item in fixes:
        fix = item.get("suggested_fix") or {}
        if item.get("kind") != guard.ANOMALY_KIND_UNIT_SCALE:
            skipped += 1
            continue
        if not fix.get("field") == "volume":
            skipped += 1
            continue
        target_value = fix.get("value")
        if not target_value or target_value <= 0:
            skipped += 1
            continue
        # 置信门槛一：量纲比值必须接近已知单位换算错误（≈100x / ≈1/100x）。
        # vwap/close 的正常极端偏差（无涨跌停市场闪崩日 5~19 倍）在这里被拦下。
        details = item.get("details_json") or {}
        if not _passes_ratio_gate(details.get("amount_volume_ratio")):
            skipped += 1
            continue

        def _write(session) -> int:  # noqa: F811 - closure over item/target_value
            row = session.execute(
                select(StockDaily).where(
                    and_(
                        StockDaily.code == item["code"],
                        StockDaily.date == item["date"],
                    )
                ).limit(1)
            ).scalar_one_or_none()
            # volume 缺失/非正（含 0）一律跳过：除零防护
            if row is None or not row.volume or row.volume <= 0:
                return 0
            if abs(float(target_value) / float(row.volume) - 1.0) < 0.2:
                return 2  # 数据已与目标一致：外层补标异常状态
            # 置信门槛二：修复值必须与近 10 根成交量中位数同数量级
            median = _history_median_volume(session, item["code"], item["date"])
            if median and median > 0:
                median_ratio = float(target_value) / median
                if not (
                    APPLY_HISTORY_MEDIAN_RATIO[0]
                    <= median_ratio
                    <= APPLY_HISTORY_MEDIAN_RATIO[1]
                ):
                    return 0
            # 成交量物理单位是整数股：amount/close 修复值取整，避免写入
            # 带小数的股数（真实行情源的 volume 均为整数）
            row.volume = float(round(float(target_value)))
            return 1

        changed = database._run_write_transaction(  # noqa: SLF001 - 同进程内部调用
            f"apply_volume_fix[{item['code']}@{item['date']}]", _write
        )
        if changed == 1:
            applied += 1
            _mark_anomaly_repaired(repo, database, item)
        elif changed == 2:
            # 上一轮已把值修好但状态未标（两步中断/锁冲突）：补标防永久卡 open
            re_marked += 1
            _mark_anomaly_repaired(repo, database, item)
        else:
            skipped += 1
    return {
        "applied": applied,
        "re_marked": re_marked,
        "skipped": skipped,
        "total": len(fixes),
    }


def format_scan_report(report: Dict[str, Any]) -> str:
    """把扫描报告格式化为 CLI 可读文本。"""

    lines = [
        "=== 数据质量扫描报告 ===",
        f"扫描窗口: 最近 {report['window_days']} 天（自 {report['date_from']} 起）",
        f"扫描股票数: {report['codes_scanned']}，扫描行数: {report['rows_scanned']}",
    ]
    summary = report["summary"]
    if not summary:
        lines.append("未发现异常。")
        return "\n".join(lines)
    lines.append(f"异常总数: {len(report['anomalies'])}")
    for kind, count in sorted(summary.items(), key=lambda kv: -kv[1]):
        lines.append(f"  - {kind}: {count}")
    fixable = report["fixable"]
    if fixable:
        lines.append("")
        lines.append(
            "可自动修复（量纲校验有 amount 佐证，且需通过修复置信门槛）: "
            f"{len(fixable)} 条"
        )
        lines.append("示例（最多 10 条）:")
        for item in fixable[:10]:
            fix = item["suggested_fix"]
            details = item.get("details_json") or {}
            lines.append(
                f"  - {item['code']} {item['date']} [{item['data_source']}] "
                f"volume={details.get('volume')} -> {fix.get('value'):.2f} "
                f"(amount/close，ratio={details.get('amount_volume_ratio')})"
            )
        lines.append("")
        lines.append("执行 python main.py --data-quality --data-quality-apply 应用修复。")
    else:
        lines.append("无可自动修复项：跳变类异常仅报告，请人工核对数据来源口径。")
    return "\n".join(lines)
