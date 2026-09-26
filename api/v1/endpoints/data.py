# -*- coding: utf-8 -*-
"""Data capability and quality endpoints."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.deps import get_config_dep, get_database_manager
from api.v1.schemas.common import ErrorResponse
from api.v1.schemas.data_capability import DataCapabilityOverviewResponse
from api.v1.schemas.data_quality import (
    DataQualityAnomaliesResponse,
    DataQualityAnomalyItem,
    DataQualityAnomalySummary,
)
from src.config import Config
from src.repositories.stock_data_anomaly_repo import StockDataAnomalyRepository
from src.services.data_capability_service import DataCapabilityService
from src.storage import DatabaseManager

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_json_object(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse a stored JSON object; return None on missing/invalid input."""

    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _anomaly_item(payload: Dict[str, Any]) -> DataQualityAnomalyItem:
    return DataQualityAnomalyItem(
        id=payload["id"],
        code=payload["code"],
        date=payload["date"],
        kind=payload["kind"],
        severity=payload["severity"],
        data_source=payload["data_source"],
        existing_data_source=payload.get("existing_data_source"),
        details=_parse_json_object(payload.get("details_json")),
        suggested_fix=_parse_json_object(payload.get("suggested_fix_json")),
        status=payload["status"],
        created_at=payload["created_at"],
        updated_at=payload["updated_at"],
    )


@router.get(
    "/anomalies",
    response_model=DataQualityAnomaliesResponse,
    responses={500: {"model": ErrorResponse}},
    summary="List daily-data quality anomalies",
    description=(
        "Read-only view of anomalies recorded by the ingest quality guard "
        "(stock_data_anomalies), plus a status summary across all records. "
        "The guard records anomalies without blocking ingestion."
    ),
)
def list_data_quality_anomalies(
    status: Optional[str] = Query(
        "open",
        description=(
            "Filter by status: open / repaired / dismissed. "
            "Pass 'all' (case-insensitive) to disable the filter."
        ),
    ),
    code: Optional[str] = Query(None, description="Filter by stock code."),
    kind: Optional[str] = Query(None, description="Filter by anomaly kind, e.g. unit_scale_mismatch."),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of rows to return."),
    db_manager: DatabaseManager = Depends(get_database_manager),
) -> DataQualityAnomaliesResponse:
    """Return persisted data quality anomalies with a global status summary."""

    try:
        repo = StockDataAnomalyRepository(db_manager)
        codes: Optional[List[str]] = [code] if code else None
        kinds: Optional[List[str]] = [kind] if kind else None
        # 归一化状态参数：忽略大小写与首尾空白；"all"/空串表示不过滤
        normalized_status = (status or "").strip().lower()
        status_filter: Optional[str] = (
            None if not normalized_status or normalized_status == "all" else normalized_status
        )
        rows = repo.list_anomalies(
            codes=codes,
            status=status_filter,
            kinds=kinds,
            limit=limit,
        )
        items = [_anomaly_item(row.to_dict()) for row in rows]
        total_by_status = repo.count_by_status()
        open_summary = repo.summarize_open()
        return DataQualityAnomaliesResponse(
            items=items,
            summary=DataQualityAnomalySummary(
                total_by_status=total_by_status,
                open_critical=open_summary["open_critical"],
                open_by_kind=open_summary["open_by_kind"],
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - keep the read-only endpoint fail-open at the boundary.
        logger.error("Failed to list data quality anomalies: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to list data quality anomalies",
            },
        )


def _overview_response(config: Config, *, runtime_scheduler: object = None) -> DataCapabilityOverviewResponse:
    try:
        payload = DataCapabilityService(
            config=config,
            runtime_scheduler=runtime_scheduler,
        ).get_overview()
        return DataCapabilityOverviewResponse.model_validate(payload)
    except Exception as exc:  # noqa: BLE001 - keep diagnostics fail-open at API boundary.
        logger.error("Failed to build data capability overview: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to build data capability overview",
            },
        )


@router.get(
    "/overview",
    response_model=DataCapabilityOverviewResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Get data capability overview",
    description="Return provider capabilities, dataset quality, and source priority without exposing secrets.",
)
def get_data_overview(
    request: Request,
    config: Config = Depends(get_config_dep),
) -> DataCapabilityOverviewResponse:
    """Return the canonical read-only data overview."""
    return _overview_response(
        config,
        runtime_scheduler=getattr(request.app.state, "runtime_scheduler_service", None),
    )


@router.get(
    "/capabilities",
    response_model=DataCapabilityOverviewResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Get data provider capabilities",
    description="Alias of /data/overview for clients that only need capability metadata.",
)
def get_data_capabilities(
    request: Request,
    config: Config = Depends(get_config_dep),
) -> DataCapabilityOverviewResponse:
    """Return the data overview under the capability-oriented alias."""
    return _overview_response(
        config,
        runtime_scheduler=getattr(request.app.state, "runtime_scheduler_service", None),
    )
