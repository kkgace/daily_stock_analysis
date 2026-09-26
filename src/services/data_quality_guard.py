# -*- coding: utf-8 -*-
"""数据入库质量护栏：日线数据异常检测纯函数层。

背景（Issue #2350 一类问题）：
- 腾讯日线对科创板返回的成交量单位是「股」，其余板块是「手」；
  统一 ``×100`` 换算导致科创板入库 volume 偏大 100 倍，存在半年才暴露。
- 此前唯一的自检依赖 ``volume × close ≈ amount``，而腾讯日线不返回
  amount，受影响行恰好落在自检盲区。

设计原则（与 AGENTS.md 稳定性护栏一致）：
1. **只记录，不阻断**：检测产出异常记录，默认不拦截入库；
   单一数据源异常不应拖垮整个分析流程。
2. **纯函数**：输入输出均为 dict，不依赖 ORM 对象，供入库挂钩
   （``DatabaseManager.save_daily_data``）与数据修复扫描 CLI 共用。
3. **阈值宽松**：只抓数量级错误（100 倍类），不抓正常波动，
   避免 vwap 偏离、停牌复牌、除权等合法场景误报。

检测规则：
- ``unit_scale_mismatch``（critical）：amount / (volume×close) 落在
  [AMOUNT_VOLUME_TOLERANCE] 之外 → 量纲错误；给出建议修复值
  ``suggested_volume = amount / close``（物理量纲一致的股数）。
- ``zero_volume_with_price``（warning）：close>0 但 volume 缺失/非正。
- ``volume_history_jump`` / ``close_history_jump``（warning）：
  相对近期 HISTORY_LOOKBACK 根 K 线中位数突变（数量级级）。
  覆盖 amount 缺失行的盲区：同票切换数据源后单位不一致会在
  源切换边界产生 ~100 倍跳变。
- ``cross_source_mismatch``（warning）：同票同日即将被另一来源覆盖时，
  两来源 volume/close 不一致（数量级级）。

本模块不做网络请求、不读写数据库。
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 阈值常量（宽松，只抓数量级错误）
# ---------------------------------------------------------------------------

# amount / (volume * close) 的合理区间。
# close 与 vwap 正常偏差一般在 ±10% 以内，极端行情也不超过 2~3 倍；
# 5 倍以上只可能是量纲/单位错误（如 100 倍的手↔股混淆）。
AMOUNT_VOLUME_TOLERANCE_LOW = 0.2
AMOUNT_VOLUME_TOLERANCE_HIGH = 5.0

# 新行 volume 相对近期中位数的合理倍数区间（50 倍 / 1/50）。
VOLUME_JUMP_RATIO_LOW = 0.02
VOLUME_JUMP_RATIO_HIGH = 50.0

# 新行 close 相对近期中位数的合理倍数区间（20 倍 / 1/20）。
CLOSE_JUMP_RATIO_LOW = 0.05
CLOSE_JUMP_RATIO_HIGH = 20.0

# 跨源覆盖时 volume/close 一致性区间。
CROSS_SOURCE_VOLUME_RATIO_LOW = 0.25
CROSS_SOURCE_VOLUME_RATIO_HIGH = 4.0
CROSS_SOURCE_CLOSE_RATIO_LOW = 0.8
CROSS_SOURCE_CLOSE_RATIO_HIGH = 1.25

# 突变检测所需的最少历史 K 线数与回看窗口。
HISTORY_MIN_BARS = 5
HISTORY_LOOKBACK = 10

# 异常类型与严重级别
ANOMALY_KIND_UNIT_SCALE = "unit_scale_mismatch"
ANOMALY_KIND_ZERO_VOLUME = "zero_volume_with_price"
ANOMALY_KIND_VOLUME_JUMP = "volume_history_jump"
ANOMALY_KIND_CLOSE_JUMP = "close_history_jump"
ANOMALY_KIND_CROSS_SOURCE = "cross_source_mismatch"

SEVERITY_CRITICAL = "critical"
SEVERITY_WARNING = "warning"

# 异常状态（修复 CLI 使用）
ANOMALY_STATUS_OPEN = "open"
ANOMALY_STATUS_REPAIRED = "repaired"
ANOMALY_STATUS_DISMISSED = "dismissed"


def _positive_finite(value: Any) -> bool:
    """Return True if value is a positive finite number."""
    try:
        if value is None:
            return False
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number) and number > 0.0


def _finite(value: Any) -> Optional[float]:
    """Coerce value to float if finite, else None."""
    try:
        if value is None:
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def amount_volume_ratio(record: Dict[str, Any]) -> Optional[float]:
    """Return amount / (volume * close), or None when not computable."""

    volume = _finite(record.get("volume"))
    close = _finite(record.get("close"))
    amount = _finite(record.get("amount"))
    if not volume or not close or not amount:
        return None
    denominator = volume * close
    if denominator <= 0:
        return None
    return amount / denominator


def _median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _history_values(records: Iterable[Dict[str, Any]], field: str) -> List[float]:
    values: List[float] = []
    for record in records:
        number = _finite(record.get(field))
        if number and number > 0:
            values.append(number)
    return values


def _build_anomaly(
    record: Dict[str, Any],
    *,
    kind: str,
    severity: str,
    details: Dict[str, Any],
    existing_row: Optional[Dict[str, Any]] = None,
    suggested_fix: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "code": record.get("code"),
        "date": record.get("date"),
        "kind": kind,
        "severity": severity,
        "data_source": record.get("data_source"),
        "existing_data_source": (existing_row or {}).get("data_source"),
        "details_json": details,
        "suggested_fix": suggested_fix,
    }


def detect_unit_scale_mismatch(
    record: Dict[str, Any],
    *,
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """检测量纲错误：amount 与 volume×close 数量级不一致。

    建议修复值取 ``amount / close``（以 close 近似 vwap，物理量纲
    一致的股数）。仅当 amount/close/volume 均为正有限数时可判定。
    """

    ratio = amount_volume_ratio(record)
    if ratio is None:
        return None
    if AMOUNT_VOLUME_TOLERANCE_LOW <= ratio <= AMOUNT_VOLUME_TOLERANCE_HIGH:
        return None
    amount = _finite(record.get("amount"))
    close = _finite(record.get("close"))
    volume = _finite(record.get("volume"))
    suggested_volume = None
    if amount and close:
        suggested_volume = amount / close
    details = {
        "amount": amount,
        "close": close,
        "volume": volume,
        "amount_volume_ratio": round(ratio, 6),
        "tolerance": [AMOUNT_VOLUME_TOLERANCE_LOW, AMOUNT_VOLUME_TOLERANCE_HIGH],
    }
    return _build_anomaly(
        record,
        kind=ANOMALY_KIND_UNIT_SCALE,
        severity=SEVERITY_CRITICAL,
        details=details,
        existing_row=existing_row,
        suggested_fix=(
            {"field": "volume", "value": suggested_volume}
            if suggested_volume is not None and suggested_volume > 0
            else None
        ),
    )


def detect_zero_volume_with_price(
    record: Dict[str, Any],
    *,
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """检测 close>0 但 volume 缺失/非正的行。"""

    close = _finite(record.get("close"))
    volume = _finite(record.get("volume"))
    if not close:
        return None
    if volume is not None and volume > 0:
        return None
    return _build_anomaly(
        record,
        kind=ANOMALY_KIND_ZERO_VOLUME,
        severity=SEVERITY_WARNING,
        details={"close": close, "volume": volume},
        existing_row=existing_row,
    )


def _detect_history_jump(
    record: Dict[str, Any],
    *,
    field: str,
    low: float,
    high: float,
    kind: str,
    history_rows: List[Dict[str, Any]],
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    value = _finite(record.get(field))
    history = _history_values(history_rows, field)
    if not value or value <= 0 or len(history) < HISTORY_MIN_BARS:
        return None
    median = _median(history[:HISTORY_LOOKBACK])
    if not median or median <= 0:
        return None
    ratio = value / median
    if low <= ratio <= high:
        return None
    return _build_anomaly(
        record,
        kind=kind,
        severity=SEVERITY_WARNING,
        details={
            "field": field,
            "value": value,
            "history_median": median,
            "history_bars": len(history),
            "ratio": round(ratio, 6),
            "threshold": [low, high],
        },
        existing_row=existing_row,
    )


def detect_volume_history_jump(
    record: Dict[str, Any],
    *,
    history_rows: List[Dict[str, Any]],
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return _detect_history_jump(
        record,
        field="volume",
        low=VOLUME_JUMP_RATIO_LOW,
        high=VOLUME_JUMP_RATIO_HIGH,
        kind=ANOMALY_KIND_VOLUME_JUMP,
        history_rows=history_rows,
        existing_row=existing_row,
    )


def detect_close_history_jump(
    record: Dict[str, Any],
    *,
    history_rows: List[Dict[str, Any]],
    existing_row: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return _detect_history_jump(
        record,
        field="close",
        low=CLOSE_JUMP_RATIO_LOW,
        high=CLOSE_JUMP_RATIO_HIGH,
        kind=ANOMALY_KIND_CLOSE_JUMP,
        history_rows=history_rows,
        existing_row=existing_row,
    )


def detect_cross_source_mismatch(
    record: Dict[str, Any],
    *,
    existing_row: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """检测跨源覆盖不一致：新来源与已入库同票同日值数量级不符。"""

    if not existing_row:
        return None
    new_source = str(record.get("data_source") or "")
    old_source = str(existing_row.get("data_source") or "")
    if not new_source or not old_source or new_source == old_source:
        return None
    details: Dict[str, Any] = {"new_source": new_source, "old_source": old_source}
    mismatch = False

    new_volume = _finite(record.get("volume"))
    old_volume = _finite(existing_row.get("volume"))
    if new_volume and old_volume:
        ratio = new_volume / old_volume
        details["volume_ratio"] = round(ratio, 6)
        if not (CROSS_SOURCE_VOLUME_RATIO_LOW <= ratio <= CROSS_SOURCE_VOLUME_RATIO_HIGH):
            mismatch = True

    new_close = _finite(record.get("close"))
    old_close = _finite(existing_row.get("close"))
    if new_close and old_close:
        ratio = new_close / old_close
        details["close_ratio"] = round(ratio, 6)
        if not (CROSS_SOURCE_CLOSE_RATIO_LOW <= ratio <= CROSS_SOURCE_CLOSE_RATIO_HIGH):
            mismatch = True

    if not mismatch:
        return None
    return _build_anomaly(
        record,
        kind=ANOMALY_KIND_CROSS_SOURCE,
        severity=SEVERITY_WARNING,
        details=details,
        existing_row=existing_row,
    )


def detect_daily_row_anomalies(
    record: Dict[str, Any],
    *,
    existing_row: Optional[Dict[str, Any]] = None,
    history_rows: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """对单条日线记录运行全部检测规则，返回异常列表（可为空）。

    Args:
        record: 待入库/待检查的行，dict 需含 code/date/close/volume/amount/
            data_source（缺失字段按 None 处理，不会抛异常）。
        existing_row: 同票同日已入库的行（跨源覆盖场景），None 表示新增。
        history_rows: 该票更早日期的行（按日期降序），用于突变检测；
            None 表示跳过突变检测。
    """

    anomalies: List[Dict[str, Any]] = []
    try:
        unit = detect_unit_scale_mismatch(record, existing_row=existing_row)
        if unit:
            anomalies.append(unit)
        zero = detect_zero_volume_with_price(record, existing_row=existing_row)
        if zero:
            anomalies.append(zero)
        if history_rows:
            volume_jump = detect_volume_history_jump(
                record, history_rows=history_rows, existing_row=existing_row
            )
            if volume_jump:
                anomalies.append(volume_jump)
            close_jump = detect_close_history_jump(
                record, history_rows=history_rows, existing_row=existing_row
            )
            if close_jump:
                anomalies.append(close_jump)
        cross = detect_cross_source_mismatch(record, existing_row=existing_row)
        if cross:
            anomalies.append(cross)
    except Exception as exc:  # 检测自身失败绝不影响入库
        logger.warning(
            "data quality guard detection failed for code=%r date=%r: %s",
            record.get("code"), record.get("date"), exc,
        )
        return []
    return anomalies


def scan_source_switch_discontinuity(
    rows: List[Dict[str, Any]],
    *,
    field: str,
    low: float,
    high: float,
    kind: str,
) -> List[Dict[str, Any]]:
    """扫描历史序列中数据源切换边界上的数量级突变。

    面向数据修复 CLI：对按日期升序排列的同票历史行，在
    ``data_source`` 发生变化的相邻两根 K 线之间检查 field 的
    倍数关系；落在 [low, high] 之外记为 ``kind`` 异常。
    Issue #2350 的存量坏数据（科创板 volume 偏大 100 倍）正是
    在「其它源 → TencentFetcher」的切换边界产生 ~100 倍跳变。
    """

    anomalies: List[Dict[str, Any]] = []
    previous: Optional[Dict[str, Any]] = None
    for row in rows:
        if previous is not None:
            new_source = str(row.get("data_source") or "")
            old_source = str(previous.get("data_source") or "")
            if new_source and old_source and new_source != old_source:
                new_value = _finite(row.get(field))
                old_value = _finite(previous.get(field))
                if new_value and old_value:
                    ratio = new_value / old_value
                    if not (low <= ratio <= high):
                        anomalies.append(
                            _build_anomaly(
                                row,
                                kind=kind,
                                severity=SEVERITY_WARNING,
                                details={
                                    "field": field,
                                    "value": new_value,
                                    "previous_value": old_value,
                                    "ratio": round(ratio, 6),
                                    "new_source": new_source,
                                    "old_source": old_source,
                                    "threshold": [low, high],
                                },
                            )
                        )
        previous = row
    return anomalies
