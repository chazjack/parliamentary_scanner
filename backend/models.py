"""Pydantic models for API request and response schemas."""

from pydantic import BaseModel


class TopicCreate(BaseModel):
    name: str
    keywords: list[str] = []


class TopicUpdate(BaseModel):
    name: str


class KeywordsUpdate(BaseModel):
    keywords: list[str]


class ScanCreate(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    topic_ids: list[int]
    sources: list[str] = [
        "hansard", "written_questions", "written_statements",
        "edms", "bills", "divisions",
    ]


class AuditReclassifyRequest(BaseModel):
    audit_id: int
    scan_id: int


class AlertCreate(BaseModel):
    name: str
    alert_type: str  # 'scan' | 'lookahead'
    enabled: bool = True
    cadence: str = "weekly"  # 'daily' | 'weekly'
    day_of_week: str = "monday"
    send_time: str = "09:00"  # HH:MM
    timezone: str = "Europe/London"
    # scan config
    topic_ids: list[int] = []
    sources: list[str] = []
    scan_period_days: int = 7
    # lookahead config
    lookahead_days: int = 7
    event_types: list[str] | None = None
    houses: list[str] | None = None
    # recipients
    recipients: list[str] = []


class AlertUpdate(BaseModel):
    name: str | None = None
    alert_type: str | None = None
    enabled: bool | None = None
    cadence: str | None = None
    day_of_week: str | None = None
    send_time: str | None = None
    timezone: str | None = None
    topic_ids: list[int] | None = None
    sources: list[str] | None = None
    scan_period_days: int | None = None
    lookahead_days: int | None = None
    event_types: list[str] | None = None
    houses: list[str] | None = None
    recipients: list[str] | None = None
