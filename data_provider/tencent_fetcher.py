# -*- coding: utf-8 -*-
"""Tencent direct daily K-line fetcher for A-share fallback routing."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Optional

import pandas as pd
import requests

try:
    import exchange_calendars as xcals
except ImportError:  # pragma: no cover - dependency is present in supported installs
    xcals = None

from .base import BaseFetcher, DataFetchError, STANDARD_COLUMNS, normalize_stock_code, is_bse_code

logger = logging.getLogger(__name__)

_MAX_KLINE_BARS = 800


class TencentFetcher(BaseFetcher):
    """Fetch qfq daily K-line data from Tencent's direct quote endpoint."""

    name = "TencentFetcher"
    # This direct endpoint is the last-resort A-share daily fallback. Keeping
    # it at priority 0 made a single Efinance failure skip the richer built-in
    # fallback chain and try Tencent before AkShare/PyTDX/Baostock/YFinance.
    priority = 5
    allow_empty_daily_data = True

    _KLINE_ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
    _QUOTE_ENDPOINT = "https://qt.gtimg.cn/q"
    _HTTP_TIMEOUT_SECONDS = 8

    def __init__(self) -> None:
        self.priority = _read_tencent_priority()

    def _fetch_raw_data(self, stock_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        symbol = _to_tencent_symbol(stock_code)
        if not symbol:
            raise DataFetchError(f"TencentFetcher unsupported stock code: {stock_code}")

        lookback = _estimate_lookback_days(start_date=start_date, end_date=end_date)
        explicit_start = _format_tencent_date(start_date)
        explicit_end = _format_tencent_date(end_date)
        explicit_window = (
            f"{explicit_start},{explicit_end}"
            if explicit_start and explicit_end
            else ","
        )
        response = requests.get(
            self._KLINE_ENDPOINT,
            params={"param": f"{symbol},day,{explicit_window},{lookback},qfq"},
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/plain,*/*"},
            timeout=self._HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        rows = _extract_kline_rows(payload, symbol=symbol)
        if not rows:
            logger.info("TencentFetcher empty daily history for %s", stock_code)
            return _empty_daily_frame()

        df = pd.DataFrame(rows)
        first_returned_date = _first_returned_date(df)
        if first_returned_date and _is_capped_history_incomplete(
            first_returned_date=first_returned_date,
            start_date=start_date,
            lookback=lookback,
            returned_rows=len(rows),
        ):
            logger.info(
                "TencentFetcher incomplete capped daily history for %s: first_date=%s requested_start=%s",
                stock_code,
                first_returned_date,
                start_date,
            )
            return _empty_daily_frame()

        df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]
        if df.empty:
            logger.info(
                "TencentFetcher daily history outside requested range for %s: %s~%s",
                stock_code,
                start_date,
                end_date,
            )
            return _empty_daily_frame()
        return df

    def _normalize_data(self, df: pd.DataFrame, stock_code: str) -> pd.DataFrame:
        normalized = df.copy()
        for column in ("open", "high", "low", "close", "volume", "amount"):
            if column in normalized.columns:
                normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
        if "pct_chg" not in normalized.columns:
            normalized["pct_chg"] = normalized["close"].pct_change().fillna(0.0) * 100
        normalized = normalized[["date", "open", "high", "low", "close", "volume", "amount", "pct_chg"]]
        return normalized

    def get_stock_name(self, stock_code: str) -> Optional[str]:
        symbol = _to_tencent_symbol(stock_code)
        if not symbol:
            return None
        try:
            response = requests.get(
                f"{self._QUOTE_ENDPOINT}={symbol}",
                headers={"Referer": "https://finance.qq.com", "User-Agent": "Mozilla/5.0"},
                timeout=self._HTTP_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            response.encoding = "gbk"
            content = response.text.strip()
            data_start = content.find('"')
            data_end = content.rfind('"')
            if data_start == -1 or data_end <= data_start:
                return None
            fields = content[data_start + 1:data_end].split("~")
            if len(fields) <= 2 or fields[2].strip() != symbol[2:]:
                return None
            name = fields[1].strip()
            return name or None
        except Exception:
            logger.debug(
                "TencentFetcher stock name lookup failed for %s",
                stock_code,
                exc_info=True,
            )
            return None


def _to_tencent_symbol(stock_code: str) -> str:
    raw_code = (stock_code or "").strip().upper()
    code = normalize_stock_code(stock_code)
    if not code or not code.isdigit() or len(code) != 6:
        return ""
    if raw_code.startswith(("SH", "SS")) or raw_code.endswith((".SH", ".SS")):
        return f"sh{code}"
    if raw_code.startswith("SZ") or raw_code.endswith(".SZ"):
        return f"sz{code}"
    if raw_code.startswith("BJ") or raw_code.endswith(".BJ"):
        return f"bj{code}"
    if is_bse_code(code):
        return f"bj{code}"
    if code.startswith(("6", "5", "9")):
        return f"sh{code}"
    return f"sz{code}"


def _read_tencent_priority() -> int:
    raw_value = os.getenv("TENCENT_PRIORITY", "5")
    try:
        return int(str(raw_value).strip())
    except (TypeError, ValueError):
        logger.warning(
            "TENCENT_PRIORITY=%r is not a valid integer; falling back to 5",
            raw_value,
        )
        return 5


def _estimate_lookback_days(*, start_date: str, end_date: str) -> int:
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        calendar_days = max(1, (end - start).days + 1)
    except ValueError:
        calendar_days = 90
    # Trading days are sparse over calendar days; add margin for holidays/suspensions.
    return max(30, min(_MAX_KLINE_BARS, int(calendar_days * 1.8) + 20))


def _empty_daily_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=STANDARD_COLUMNS)


def _first_returned_date(df: pd.DataFrame) -> Optional[str]:
    if "date" not in df.columns or df.empty:
        return None
    dates = pd.to_datetime(df["date"], errors="coerce").dropna()
    if dates.empty:
        return None
    return dates.min().strftime("%Y-%m-%d")


def _is_capped_history_incomplete(
    *,
    first_returned_date: str,
    start_date: str,
    lookback: int,
    returned_rows: int,
) -> bool:
    hit_cap = lookback >= _MAX_KLINE_BARS and returned_rows >= _MAX_KLINE_BARS
    if not hit_cap:
        return False
    try:
        first = datetime.strptime(first_returned_date, "%Y-%m-%d")
        requested_start = datetime.strptime(start_date, "%Y-%m-%d")
    except ValueError:
        return False
    return first > _first_trading_date_on_or_after(requested_start)


def _first_trading_date_on_or_after(start_date: datetime) -> datetime:
    if xcals is not None:
        try:
            cal = xcals.get_calendar("XSHG")
            session = cal.date_to_session(start_date.date(), direction="next")
            return datetime.combine(session.date(), datetime.min.time())
        except Exception:
            pass

    current = start_date
    while current.weekday() >= 5:
        current += timedelta(days=1)
    return current


def _format_tencent_date(date_text: str) -> Optional[str]:
    try:
        return datetime.strptime(date_text, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _lots_to_shares(volume: Any) -> Any:
    try:
        return float(volume) * 100
    except (TypeError, ValueError):
        return volume


def _shares_passthrough(volume: Any) -> Any:
    """科创板行的成交量单位本身就是「股」：仅做数值归一，不做手→股换算。"""

    try:
        return float(volume)
    except (TypeError, ValueError):
        return volume


# 手/股证据判定阈值：同一响应内 amount / (volume × close) 的中位数。
# 手计响应 ≈ 100×(vwap/close)（典型 50~200），股计响应 ≈ vwap/close
# （典型 0.5~2）；20 倍阈值两侧分离度大，A 股涨跌停约束下不会交叠。
# 前复权对 close/volume 的调整在乘积上互消，不影响该比值。
_LOTS_EVIDENCE_RATIO = 20.0
_SHARES_EVIDENCE_MIN_RATIO = 0.05


def _infer_volume_scale(raw_rows: list[dict[str, Any]], *, default_scale: float) -> float:
    """用同一响应内 amount/close 的中位数证据判定成交量单位（自校验）。

    返回手→股换算系数：100.0=原始值以「手」计、1.0=已是「股」。
    无可用证据（腾讯部分行情不返回 amount）或证据退化时，回落到
    文档契约默认值（科创板=股、其它板块=手，Issue #2350）——
    即使线上行为与文档不符，带 amount 的响应也能自行纠正换算方向。
    """

    ratios: list[float] = []
    for row in raw_rows:
        try:
            volume = float(row["volume"])
            amount = float(row["amount"])
            close = float(row["close"])
        except (TypeError, ValueError):
            continue
        if volume <= 0 or amount <= 0 or close <= 0:
            continue
        ratios.append(amount / (volume * close))
    if not ratios:
        return default_scale
    ratios.sort()
    median_ratio = ratios[len(ratios) // 2]
    if median_ratio >= _LOTS_EVIDENCE_RATIO:
        return 100.0
    if median_ratio >= _SHARES_EVIDENCE_MIN_RATIO:
        return 1.0
    return default_scale


def _extract_kline_rows(payload: dict[str, Any], *, symbol: str) -> list[dict[str, Any]]:
    data = payload.get("data") if isinstance(payload, dict) else None
    item = data.get(symbol) if isinstance(data, dict) else None
    if not isinstance(item, dict):
        return []
    rows = item.get("qfqday") or item.get("day") or []
    raw_rows: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            continue
        amount: Optional[Any] = row[6] if len(row) > 6 else None
        raw_rows.append(
            {
                "date": str(row[0]),
                "open": row[1],
                "close": row[2],
                "high": row[3],
                "low": row[4],
                "volume": row[5],
                "amount": amount,
            }
        )
    # Issue #2350：腾讯日线对科创板（688）返回的成交量单位是「股」，
    # 其余板块是「手」。以文档契约为默认，同一响应内带 amount 佐证时
    # 用中位数证据自校验换算方向（文档结论过时也不会写坏数据）。
    default_scale = 1.0 if str(symbol).lower().startswith("sh688") else 100.0
    scale = _infer_volume_scale(raw_rows, default_scale=default_scale)
    convert_volume = _lots_to_shares if scale == 100.0 else _shares_passthrough
    for raw_row in raw_rows:
        raw_row["volume"] = convert_volume(raw_row["volume"])
    return raw_rows
