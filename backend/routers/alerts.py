"""Alert management endpoints: CRUD, toggle, test send, manual run, history."""

import json
import logging

from fastapi import APIRouter, HTTPException

from backend.database import (
    get_db,
    get_all_alerts,
    get_alert,
    create_alert,
    update_alert,
    delete_alert,
    toggle_alert,
    get_alert_run_history,
)
from backend.models import AlertCreate, AlertUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# Will be set by scheduler module after startup
_execute_alert_fn = None
_sync_scheduler_fn = None


def register_alert_executor(execute_fn, sync_fn):
    """Register the alert execution and scheduler sync functions."""
    global _execute_alert_fn, _sync_scheduler_fn
    _execute_alert_fn = execute_fn
    _sync_scheduler_fn = sync_fn


@router.get("")
async def list_alerts():
    db = await get_db()
    try:
        return await get_all_alerts(db)
    finally:
        await db.close()


@router.get("/{alert_id}")
async def get_alert_detail(alert_id: int):
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
        return alert
    finally:
        await db.close()


@router.post("", status_code=201)
async def create_new_alert(body: AlertCreate):
    db = await get_db()
    try:
        alert_id = await create_alert(db, body.model_dump())
        alert = await get_alert(db, alert_id)
    finally:
        await db.close()

    if _sync_scheduler_fn:
        await _sync_scheduler_fn()

    return alert


@router.put("/{alert_id}")
async def update_existing_alert(alert_id: int, body: AlertUpdate):
    db = await get_db()
    try:
        existing = await get_alert(db, alert_id)
        if not existing:
            raise HTTPException(404, "Alert not found")

        update_data = body.model_dump(exclude_none=True)
        await update_alert(db, alert_id, update_data)
        alert = await get_alert(db, alert_id)
    finally:
        await db.close()

    if _sync_scheduler_fn:
        await _sync_scheduler_fn()

    return alert


@router.delete("/{alert_id}")
async def delete_existing_alert(alert_id: int):
    db = await get_db()
    try:
        deleted = await delete_alert(db, alert_id)
        if not deleted:
            raise HTTPException(404, "Alert not found")
    finally:
        await db.close()

    if _sync_scheduler_fn:
        await _sync_scheduler_fn()

    return {"ok": True}


@router.post("/{alert_id}/toggle")
async def toggle_alert_enabled(alert_id: int, enabled: bool = True):
    db = await get_db()
    try:
        toggled = await toggle_alert(db, alert_id, enabled)
        if not toggled:
            raise HTTPException(404, "Alert not found")
    finally:
        await db.close()

    if _sync_scheduler_fn:
        await _sync_scheduler_fn()

    return {"ok": True, "enabled": enabled}


@router.post("/{alert_id}/run")
async def run_alert_now(alert_id: int):
    """Manually trigger an alert execution."""
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
    finally:
        await db.close()

    if not _execute_alert_fn:
        raise HTTPException(503, "Scheduler not initialized")

    import asyncio
    asyncio.create_task(_execute_alert_fn(alert_id))
    return {"ok": True, "message": "Alert execution started"}


@router.post("/{alert_id}/test")
async def test_alert(alert_id: int):
    """Send a test email for this alert (to first recipient only)."""
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
    finally:
        await db.close()

    if not alert.get("recipients"):
        raise HTTPException(400, "No recipients configured")

    from backend.services.email_service import send_email
    from backend.services.email_templates import scan_digest_html, lookahead_digest_html

    test_recipient = [alert["recipients"][0]]

    if alert["alert_type"] == "scan":
        html = scan_digest_html(
            alert_name=f"[TEST] {alert['name']}",
            results=[{
                "member_name": "Test MP",
                "party": "Test Party",
                "forum": "Debate: Test Debate",
                "activity_date": "2025-01-01",
                "confidence": "High",
                "topics": '["AI regulation"]',
                "summary": "This is a test email to verify your alert is working correctly.",
                "verbatim_quote": "This is a sample quote from a parliamentary debate.",
                "source_url": "https://hansard.parliament.uk",
            }],
            scan_start="2025-01-01",
            scan_end="2025-01-07",
            topics=["AI regulation"],
        )
        subject = f"[TEST] {alert['name']} - Scan Alert"
    else:
        html = lookahead_digest_html(
            alert_name=f"[TEST] {alert['name']}",
            events=[{
                "title": "Test Committee Hearing on AI Regulation",
                "event_type": "committee",
                "start_date": "2025-01-08",
                "start_time": "10:00",
                "house": "Commons",
                "location": "Committee Room 5",
                "source_url": "https://committees.parliament.uk",
            }],
            start_date="2025-01-08",
            end_date="2025-01-14",
        )
        subject = f"[TEST] {alert['name']} - Lookahead Alert"

    try:
        response = await send_email(test_recipient, subject, html)
        return {"ok": True, "message": f"Test email sent to {test_recipient[0]}", "response": response}
    except Exception as e:
        raise HTTPException(500, f"Failed to send test email: {e}")


@router.get("/{alert_id}/history")
async def alert_history(alert_id: int):
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
        history = await get_alert_run_history(db, alert_id)
        return history
    finally:
        await db.close()


@router.get("/{alert_id}/preview")
async def preview_alert_email(alert_id: int):
    """Return the HTML that would be sent, without actually sending."""
    from backend.services.email_templates import scan_digest_html, lookahead_digest_html

    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
    finally:
        await db.close()

    if alert["alert_type"] == "scan":
        html = scan_digest_html(
            alert_name=alert["name"],
            results=[],
            scan_start="(preview)",
            scan_end="(preview)",
            topics=json.loads(alert.get("topic_ids", "[]")) if isinstance(alert.get("topic_ids"), str) else [],
        )
    else:
        html = lookahead_digest_html(
            alert_name=alert["name"],
            events=[],
            start_date="(preview)",
            end_date="(preview)",
        )

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)
