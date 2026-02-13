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
