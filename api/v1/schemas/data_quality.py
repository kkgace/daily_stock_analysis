# -*- coding: utf-8 -*-
"""Data quality anomaly schemas (stock_data_anomalies read-only views)."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


DataAnomalyStatus = Literal["open", "repaired", "dismissed"]
DataAnomalySeverity = Literal["critical", "warning"]


class DataQualityAnomalyItem(BaseModel):
    """One persisted daily-data anomaly record."""

    id: int = Field(..., description="Row id")
    code: str = Field(..., description="Stock code of the anomalous daily row")
    date: dt.date = Field(..., description="Trading date of the anomalous daily row")
    kind: str = Field(..., description="Anomaly kind, e.g. unit_scale_mismatch")
    severity: DataAnomalySeverity = Field(..., description="critical or warning")
    data_source: str = Field(..., description="Source that produced the row")
    existing_data_source: Optional[str] = Field(
        None, description="Previously persisted source when a cross-source mismatch was detected"
    )
    details: Optional[Dict[str, Any]] = Field(
        None, description="Parsed detection details; null when the stored JSON is invalid"
    )
    suggested_fix: Optional[Dict[str, Any]] = Field(
        None, description="Parsed suggested fix; null when absent or invalid"
    )
    status: DataAnomalyStatus = Field(..., description="open / repaired / dismissed")
    created_at: dt.datetime = Field(..., description="Record creation time")
    updated_at: dt.datetime = Field(..., description="Last status change time")


class DataQualityAnomalySummary(BaseModel):
    """Status overview across all persisted anomalies (independent of list filters)."""

    total_by_status: Dict[str, int] = Field(
        default_factory=dict, description="Anomaly count grouped by status"
    )
    open_critical: int = Field(0, description="Open anomalies with critical severity")
    open_by_kind: Dict[str, int] = Field(
        default_factory=dict, description="Open anomaly count grouped by kind"
    )


class DataQualityAnomaliesResponse(BaseModel):
    """Read-only anomaly list plus global status summary."""

    items: List[DataQualityAnomalyItem] = Field(default_factory=list, description="Anomaly rows")
    summary: DataQualityAnomalySummary = Field(..., description="Status summary across all anomalies")
