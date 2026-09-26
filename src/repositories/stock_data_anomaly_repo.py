# -*- coding: utf-8 -*-
"""股票数据质量异常记录访问层。

``stock_data_anomalies`` 表由 ``DatabaseManager.save_daily_data``
的入库护栏写入；本 repo 提供只读查询与修复状态流转。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, case, func, select

from src.storage import DatabaseManager, StockDataAnomalyRecord


# severity 字符串字典序与严重程度相反（'critical' < 'warning'），
# 用显映射保证 critical 优先展示。
_SEVERITY_RANK = case(
    (StockDataAnomalyRecord.severity == "critical", 0),
    else_=1,
)


class StockDataAnomalyRepository:
    """数据质量异常记录的查询与状态维护。"""

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()

    def list_anomalies(
        self,
        *,
        codes: Optional[List[str]] = None,
        status: Optional[str] = None,
        kinds: Optional[List[str]] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 500,
    ) -> List[StockDataAnomalyRecord]:
        conditions = []
        if codes:
            conditions.append(StockDataAnomalyRecord.code.in_(codes))
        if status:
            conditions.append(StockDataAnomalyRecord.status == status)
        if kinds:
            conditions.append(StockDataAnomalyRecord.kind.in_(kinds))
        if date_from:
            conditions.append(StockDataAnomalyRecord.date >= date_from)
        if date_to:
            conditions.append(StockDataAnomalyRecord.date <= date_to)
        where = and_(*conditions) if conditions else True
        with self.db.get_session() as session:
            rows = session.execute(
                select(StockDataAnomalyRecord)
                .where(where)
                .order_by(
                    _SEVERITY_RANK,
                    StockDataAnomalyRecord.date.desc(),
                    StockDataAnomalyRecord.id.desc(),
                )
                .limit(max(1, int(limit)))
            ).scalars().all()
            # detach 后访问属性不再触发 lazy load（本模型无关系字段）
            return list(rows)

    def count_by_status(self, *, status: Optional[str] = None) -> Dict[str, int]:
        with self.db.get_session() as session:
            query = select(
                StockDataAnomalyRecord.status, func.count(StockDataAnomalyRecord.id)
            ).group_by(StockDataAnomalyRecord.status)
            if status:
                query = query.where(StockDataAnomalyRecord.status == status)
            return {str(row_status): int(count) for row_status, count in session.execute(query).all()}

    def list_recent_anomalies(
        self,
        *,
        created_since: datetime,
        status: Optional[str] = "open",
        limit: int = 500,
    ) -> List[StockDataAnomalyRecord]:
        """查询 created_at 不早于 created_since 的异常（轮级"新异常"判定）。

        upsert 冲突更新不覆盖 created_at，因此 created_at 可靠表示
        该异常首次被发现的时间；created_since 传本轮任务开始时间。
        """

        conditions = [StockDataAnomalyRecord.created_at >= created_since]
        if status:
            conditions.append(StockDataAnomalyRecord.status == status)
        with self.db.get_session() as session:
            rows = session.execute(
                select(StockDataAnomalyRecord)
                .where(and_(*conditions))
                .order_by(StockDataAnomalyRecord.created_at.desc(), StockDataAnomalyRecord.id.desc())
                .limit(max(1, int(limit)))
            ).scalars().all()
            return list(rows)

    def summarize_open(self) -> Dict[str, Any]:
        """聚合 open 异常：按 kind 分组的数量与 critical 数量。

        供数据质量面板/通知使用；查询失败时由调用方决定降级行为。
        """

        with self.db.get_session() as session:
            rows = session.execute(
                select(
                    StockDataAnomalyRecord.kind,
                    StockDataAnomalyRecord.severity,
                    func.count(StockDataAnomalyRecord.id),
                )
                .where(StockDataAnomalyRecord.status == "open")
                .group_by(StockDataAnomalyRecord.kind, StockDataAnomalyRecord.severity)
            ).all()
        open_by_kind: Dict[str, int] = {}
        open_critical = 0
        for kind, severity, count in rows:
            open_by_kind[str(kind)] = open_by_kind.get(str(kind), 0) + int(count)
            if str(severity) == "critical":
                open_critical += int(count)
        return {"open_critical": open_critical, "open_by_kind": open_by_kind}

    def count_recent_anomalies(
        self,
        *,
        created_since: datetime,
        status: Optional[str] = "open",
    ) -> Dict[str, int]:
        """按 severity 聚合 created_since 之后的异常数（SQL 全量计数）。

        通知路径用它避免 list_recent_anomalies 的 500 行上限
        导致计数失真或 critical 被截掉后告警级别降级。
        """

        conditions = [StockDataAnomalyRecord.created_at >= created_since]
        if status:
            conditions.append(StockDataAnomalyRecord.status == status)
        with self.db.get_session() as session:
            rows = session.execute(
                select(
                    StockDataAnomalyRecord.severity,
                    func.count(StockDataAnomalyRecord.id),
                )
                .where(and_(*conditions))
                .group_by(StockDataAnomalyRecord.severity)
            ).all()
        return {str(severity): int(count) for severity, count in rows}

    def mark_status(
        self,
        *,
        code: str,
        row_date: date,
        kind: str,
        data_source: str,
        status: str,
    ) -> int:
        """把匹配的异常记录置为目标状态（repaired/dismissed），返回更新行数。

        与其他写路径一致走 _run_write_transaction（BEGIN IMMEDIATE +
        database-is-locked 重试），避免与 save_daily_data 并发时直接抛
        OperationalError。
        """

        def _write(session) -> int:
            rows = session.execute(
                select(StockDataAnomalyRecord).where(
                    and_(
                        StockDataAnomalyRecord.code == code,
                        StockDataAnomalyRecord.date == row_date,
                        StockDataAnomalyRecord.kind == kind,
                        StockDataAnomalyRecord.data_source == data_source,
                    )
                )
            ).scalars().all()
            now = datetime.now()
            for row in rows:
                row.status = status
                row.updated_at = now
            return len(rows)

        return self.db._run_write_transaction(  # noqa: SLF001 - 同进程内部调用
            f"mark_anomaly_status[{code}@{row_date}]", _write
        )

    def serialize(self, row: StockDataAnomalyRecord) -> Dict[str, Any]:
        return row.to_dict()
