"""Look Ahead endpoints: upcoming parliamentary events."""

import logging
from datetime import datetime

from fastapi import APIRouter, Query

from backend.config import LOOKAHEAD_CACHE_TTL
from backend.database import (
    get_all_topics,
    get_db,
    get_lookahead_cache_meta,
    get_lookahead_events,
    set_lookahead_cache_meta,
    star_lookahead_event,
    unstar_lookahead_event,
    upsert_lookahead_events,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lookahead", tags=["lookahead"])


async def _refresh_cache_if_needed(db, start: str, end: str, force: bool = False):
    """Check cache freshness and refresh from APIs if stale."""
    cache_key = f"whatson_{start}_{end}"
    meta = await get_lookahead_cache_meta(db, cache_key)

    needs_refresh = force or meta is None
    if not needs_refresh and meta:
        fetched_at = datetime.fromisoformat(meta["fetched_at"])
        age = (datetime.utcnow() - fetched_at).total_seconds()
        needs_refresh = age > LOOKAHEAD_CACHE_TTL

    if needs_refresh:
        from backend.services.lookahead import LookaheadClient

        client = LookaheadClient()
        try:
            events = await client.fetch_all_events(start, end)
            await upsert_lookahead_events(db, events)
            await set_lookahead_cache_meta(db, cache_key, len(events))
            logger.info("Refreshed lookahead cache: %d events for %s–%s", len(events), start, end)
            return len(events)
        finally:
            await client.close()

    return None


@router.get("/events")
async def get_events(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    topic_ids: str = Query("", description="Comma-separated topic IDs, empty for all"),
    event_types: str = Query("", description="Comma-separated event types"),
    houses: str = Query("", description="Comma-separated: Commons,Lords"),
    starred_only: bool = Query(False, description="Only return starred events"),
):
    """Get upcoming events, optionally filtered by topics/keywords."""
    db = await get_db()
    try:
        # Refresh cache if needed
        await _refresh_cache_if_needed(db, start, end)

        # Resolve topic_ids to keywords
        keywords = None
        if topic_ids:
            ids = [int(x) for x in topic_ids.split(",") if x.strip()]
            if ids:
                topics = await get_all_topics(db)
                selected = [t for t in topics if t["id"] in ids]
                kw_set = set()
                for t in selected:
                    kw_set.update(t["keywords"])
                keywords = list(kw_set) if kw_set else None

        type_list = [t.strip() for t in event_types.split(",") if t.strip()] or None
        house_list = [h.strip() for h in houses.split(",") if h.strip()] or None

        results = await get_lookahead_events(
            db, start, end,
            event_types=type_list,
            houses=house_list,
            keywords=keywords,
            starred_only=starred_only,
        )

        # Group by date
        by_date: dict[str, list] = {}
        for ev in results:
            d = ev["start_date"]
            if d not in by_date:
                by_date[d] = []
            by_date[d].append(ev)

        return {
            "start": start,
            "end": end,
            "total_events": len(results),
            "events_by_date": by_date,
            "events": results,
        }
    finally:
        await db.close()


@router.post("/star/{event_id}")
async def star_event(event_id: str):
    """Star an event."""
    db = await get_db()
    try:
        await star_lookahead_event(db, event_id)
        return {"starred": True}
    finally:
        await db.close()


@router.delete("/star/{event_id}")
async def unstar_event(event_id: str):
    """Unstar an event."""
    db = await get_db()
    try:
        await unstar_lookahead_event(db, event_id)
        return {"starred": False}
    finally:
        await db.close()


@router.post("/refresh")
async def force_refresh(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
):
    """Force a cache refresh for a date range."""
    db = await get_db()
    try:
        count = await _refresh_cache_if_needed(db, start, end, force=True)
        return {"refreshed": True, "event_count": count or 0}
    finally:
        await db.close()
