"""Scan management endpoints: start, cancel, progress (SSE), history."""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.database import get_db, get_scan, get_scan_list, create_scan, update_scan_progress
from backend.models import ScanCreate
from backend.services.scanner import get_active_scan_count, MAX_CONCURRENT_SCANS

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("/members/parties")
async def get_member_parties():
    from backend.services.parliament import ParliamentAPIClient
    client = ParliamentAPIClient()
    try:
        return await client.get_parties()
    finally:
        await client.close()


@router.get("/members/search")
async def search_members(q: str = "", house: int = 0):
    if not q or len(q.strip()) < 2:
        return []
    from backend.services.parliament import ParliamentAPIClient
    client = ParliamentAPIClient()
    try:
        return await client.search_members(q.strip(), house=house or None)
    finally:
        await client.close()

# In-memory tracking of active scans for cancellation
active_scan_events: dict[int, asyncio.Event] = {}
# Will be populated when scanner service is wired up
_run_scan_fn = None


def register_scan_runner(fn):
    """Register the scan runner function (called from main.py startup)."""
    global _run_scan_fn
    _run_scan_fn = fn


@router.post("", status_code=201)
async def start_scan(body: ScanCreate):
    db = await get_db()
    try:
        scan_id = await create_scan(
            db, body.start_date, body.end_date, body.topic_ids, body.sources,
            target_member_ids=body.target_member_ids,
            target_member_names=body.target_member_names,
        )
        if get_active_scan_count() >= MAX_CONCURRENT_SCANS:
            await update_scan_progress(db, scan_id, status="queued")
    finally:
        await db.close()

    cancel_event = asyncio.Event()
    active_scan_events[scan_id] = cancel_event

    if get_active_scan_count() < MAX_CONCURRENT_SCANS and _run_scan_fn:
        asyncio.create_task(_run_scan_fn(scan_id, cancel_event))

    return {"scan_id": scan_id}


async def promote_queued_scan():
    """Start the oldest queued scan if capacity is available. Called when a scan completes."""
    if get_active_scan_count() >= MAX_CONCURRENT_SCANS:
        return
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM scans WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
        )
        row = await cursor.fetchone()
    finally:
        await db.close()
    if not row:
        return
    scan_id = row[0]
    cancel_event = active_scan_events.get(scan_id) or asyncio.Event()
    active_scan_events[scan_id] = cancel_event
    if _run_scan_fn:
        asyncio.create_task(_run_scan_fn(scan_id, cancel_event))


@router.post("/{scan_id}/cancel")
async def cancel_scan(scan_id: int):
    event = active_scan_events.get(scan_id)
    db = await get_db()
    try:
        scan = await get_scan(db, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found")
        if scan["status"] not in ("running", "queued"):
            raise HTTPException(400, "Scan is not running")
        if event:
            event.set()
            active_scan_events.pop(scan_id, None)
        await update_scan_progress(db, scan_id, status="cancelled")
    finally:
        await db.close()
    return {"ok": True}


@router.get("/{scan_id}/progress")
async def scan_progress(scan_id: int):
    """SSE endpoint streaming scan progress updates."""

    async def event_stream():
        last_progress = -1.0
        last_phase = ""
        loop = asyncio.get_event_loop()
        last_keepalive = loop.time()

        while True:
            db = await get_db()
            try:
                scan = await get_scan(db, scan_id)
            finally:
                await db.close()

            if not scan:
                yield f"data: {json.dumps({'error': 'Scan not found'})}\n\n"
                break

            progress = scan["progress"]
            phase = scan["current_phase"] or ""
            status = scan["status"]

            if progress != last_progress or phase != last_phase:
                payload = {
                    "status": status,
                    "progress": progress,
                    "current_phase": phase,
                    "total_api_results": scan["total_api_results"],
                    "total_sent_to_llm": scan["total_sent_to_llm"],
                    "total_relevant": scan["total_relevant"],
                }
                yield f"data: {json.dumps(payload)}\n\n"
                last_progress = progress
                last_phase = phase
                last_keepalive = loop.time()
            elif loop.time() - last_keepalive > 15:
                # Keep connection alive through proxies/CDNs that drop idle streams
                yield ": keepalive\n\n"
                last_keepalive = loop.time()

            if status in ("completed", "cancelled", "error"):
                final = {
                    "status": status,
                    "progress": 100 if status == "completed" else progress,
                    "total_api_results": scan["total_api_results"],
                    "total_sent_to_llm": scan["total_sent_to_llm"],
                    "total_relevant": scan["total_relevant"],
                    "error_message": scan.get("error_message"),
                }
                yield f"data: {json.dumps(final)}\n\n"
                active_scan_events.pop(scan_id, None)
                break

            await asyncio.sleep(0.3)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("")
async def list_scans():
    db = await get_db()
    try:
        return await get_scan_list(db)
    finally:
        await db.close()


@router.get("/{scan_id}/results")
async def scan_results(scan_id: int):
    from backend.database import get_scan_results

    db = await get_db()
    try:
        scan = await get_scan(db, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found")
        results = await get_scan_results(db, scan_id)
        return {"scan": dict(scan), "results": results}
    finally:
        await db.close()
