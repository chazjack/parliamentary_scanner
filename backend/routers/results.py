"""Results query and export endpoints."""

import io
import json
import logging
from datetime import datetime

import anthropic as _anthropic

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from backend.database import (
    get_db, get_scan, get_scan_results, get_audit_log,
    get_audit_summary, get_audit_entry, get_all_topics, insert_result,
)
from backend.models import AuditReclassifyRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["results"])


@router.get("/classifier/health")
async def classifier_health():
    """Check Anthropic API connectivity and model availability."""
    if not ANTHROPIC_API_KEY:
        return {"status": "error", "message": "ANTHROPIC_API_KEY is not set on the server"}

    try:
        client = _anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY, timeout=10.0)
        await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=5,
            messages=[{"role": "user", "content": "Hi"}],
        )
        return {"status": "ok", "model": ANTHROPIC_MODEL}
    except _anthropic.AuthenticationError:
        return {"status": "error", "message": "Invalid API key"}
    except _anthropic.NotFoundError:
        return {"status": "error", "message": f"Model not found: {ANTHROPIC_MODEL}"}
    except _anthropic.APITimeoutError:
        return {"status": "error", "message": "Anthropic API timed out"}
    except _anthropic.APIError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error: {e}"}


@router.get("/scans/{scan_id}/stats")
async def scan_stats(scan_id: int):
    db = await get_db()
    try:
        scan = await get_scan(db, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found")
        return {
            "total_api_results": scan["total_api_results"],
            "total_sent_to_llm": scan["total_sent_to_llm"],
            "total_relevant": scan["total_relevant"],
        }
    finally:
        await db.close()


@router.get("/scans/{scan_id}/export")
async def export_excel(scan_id: int):
    """Export scan results as an Excel file."""
    from backend.services.exporter import create_excel_export

    db = await get_db()
    try:
        scan = await get_scan(db, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found")
        results = await get_scan_results(db, scan_id)
    finally:
        await db.close()

    buffer = create_excel_export(results, scan)
    filename = f"parliamentary_scan_{scan['start_date']}_to_{scan['end_date']}.xlsx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/scans/{scan_id}/audit")
async def scan_audit(scan_id: int):
    """Get audit log for a scan — shows discarded and filtered items."""
    db = await get_db()
    try:
        scan = await get_scan(db, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found")
        summary = await get_audit_summary(db, scan_id)
        entries = await get_audit_log(db, scan_id)
        return {"summary": summary, "entries": entries}
    finally:
        await db.close()


@router.get("/members/frequent")
async def frequent_members():
    """Get MPs/Peers appearing across multiple scans."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT member_name, party, member_type,
                      COUNT(DISTINCT scan_id) as scan_count,
                      COUNT(*) as total_appearances,
                      GROUP_CONCAT(DISTINCT topics) as all_topics
               FROM results
               GROUP BY member_name
               HAVING scan_count > 1
               ORDER BY scan_count DESC, total_appearances DESC"""
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@router.post("/audit/reclassify")
async def reclassify_audit_item(body: AuditReclassifyRequest):
    """Re-run classification on a discarded audit item and add to results if relevant."""
    from backend.services.classifier import TopicClassifier
    from backend.services.parliament import Contribution, ParliamentAPIClient
    from backend.services.scanner import _forum_label

    db = await get_db()
    try:
        # Fetch audit entry
        entry = await get_audit_entry(db, body.audit_id)
        if not entry:
            raise HTTPException(404, "Audit entry not found")

        full_text = entry.get("full_text") or entry.get("text_preview") or ""
        if not full_text.strip():
            return {"added": False, "reason": "No text available for reclassification"}

        # Build a Contribution-like object
        contribution = Contribution(
            id=f"audit-{body.audit_id}",
            member_name=entry["member_name"],
            member_id=None,
            text=full_text,
            date=datetime.strptime(entry["activity_date"], "%Y-%m-%d") if entry.get("activity_date") else None,
            house="",
            source_type=entry.get("source_type", ""),
            context=entry.get("context", ""),
            url="",
            matched_keywords=[],
        )

        # Load all topics for classification
        all_topics = await get_all_topics(db)
        all_topics_dict = {t["name"]: t["keywords"] for t in all_topics}

        classifier = TopicClassifier(all_topics_dict)
        result = await classifier.classify(contribution)

        if not result:
            return {"added": False, "reason": "AI still classified as not relevant"}

        # Look up member info
        client = ParliamentAPIClient()
        member_info = {"name": "", "party": "", "member_type": "", "constituency": ""}
        try:
            # Try to find member_id from existing results for this member
            cursor = await db.execute(
                "SELECT member_id, party, member_type, constituency FROM results WHERE member_name = ? LIMIT 1",
                (contribution.member_name,),
            )
            existing = await cursor.fetchone()
            if existing and existing["member_id"]:
                member_info = await client.lookup_member(existing["member_id"])
                contribution.member_id = existing["member_id"]
            elif existing:
                member_info = {
                    "party": existing["party"] or "",
                    "member_type": existing["member_type"] or "",
                    "constituency": existing["constituency"] or "",
                }
        finally:
            await client.close()

        dedup_key = f"{contribution.source_type}:audit-{body.audit_id}"
        topics_json = json.dumps(result["topics"])

        result_id = await insert_result(
            db,
            body.scan_id,
            dedup_key=dedup_key,
            member_name=contribution.member_name,
            member_id=contribution.member_id,
            party=member_info.get("party", ""),
            member_type=member_info.get("member_type", ""),
            constituency=member_info.get("constituency", ""),
            topics=topics_json,
            summary=result["summary"],
            activity_date=contribution.date.strftime("%Y-%m-%d") if contribution.date else "",
            forum=_forum_label(contribution),
            verbatim_quote=result.get("verbatim_quote", ""),
            source_url=contribution.url,
            confidence=result["confidence"],
            position_signal=result.get("position_signal", ""),
            source_type=contribution.source_type,
            raw_text=contribution.text[:2000],
        )

        logger.info("Reclassified audit %d -> result %d", body.audit_id, result_id)
        return {"added": True, "result_id": result_id}

    finally:
        await db.close()
