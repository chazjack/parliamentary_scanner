"""Public share endpoint — no authentication required."""

import json

from fastapi import APIRouter, HTTPException

from backend.database import get_db, get_scan_by_share_token, get_scan_results, get_topic_names_by_ids

router = APIRouter(prefix="/api/share", tags=["share"])


@router.get("/{token}")
async def get_shared_scan(token: str):
    db = await get_db()
    try:
        scan = await get_scan_by_share_token(db, token)
        if not scan:
            raise HTTPException(404, "Shared scan not found")
        results = await get_scan_results(db, scan["id"])

        # Resolve topic IDs → names
        topic_ids = []
        try:
            topic_ids = json.loads(scan["topic_ids"] or "[]")
        except Exception:
            pass
        topic_names = await get_topic_names_by_ids(db, topic_ids)

        scan_data = dict(scan)
        scan_data.pop("user_id", None)
        scan_data.pop("username", None)
        scan_data.pop("share_token", None)

        return {"scan": scan_data, "results": results, "topic_names": topic_names}
    finally:
        await db.close()
