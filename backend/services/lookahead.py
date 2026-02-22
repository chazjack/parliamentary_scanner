"""Async client for Parliament forward-looking calendar APIs.

Fetches upcoming events from the What's On Calendar API and Committees API,
normalises them into a unified format for caching in SQLite.
"""

import asyncio
import json
import logging
import re
from urllib.parse import urlparse

import httpx

from backend.config import (
    WHATSON_API_BASE,
    COMMITTEES_API_BASE,
    REQUEST_DELAY,
)

logger = logging.getLogger(__name__)


def _strip_html(text: str) -> str:
    """Remove HTML tags, collapse whitespace and newlines."""
    clean = re.sub(r"<[^>]+>", "", text)
    # Replace literal \n sequences and actual newlines
    clean = clean.replace("\\n", "\n")
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def _clean_title(summary: str, api_type: str, house: str) -> str:
    """Extract a clean title from SummarisedDetails.

    The field often starts with a "House - Type" prefix line, e.g.:
    "Commons - Main Chamber  Committee of the whole House and..."
    We strip this prefix to get the meaningful title.
    """
    if not summary:
        return ""

    # Remove common prefixes like "Commons - Main Chamber",
    # "Lords - Main Chamber", "Commons - Westminster Hall", etc.
    prefixes = [
        f"{house} - {api_type}",
        f"Commons - {api_type}",
        f"Lords - {api_type}",
        "Commons - Main Chamber",
        "Lords - Main Chamber",
        "Commons - Westminster Hall",
        "Lords - Grand Committee",
        "Commons - General Committee",
        "Commons - Select & Joint Committees",
        "Lords - Select & Joint Committees",
    ]
    cleaned = summary
    for prefix in prefixes:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
            break

    return cleaned if cleaned else summary


# --- Event type normalisation ---

# What's On API Type values (from /calendar/types/list.json):
#   "General Committee", "Grand Committee", "Main Chamber" (Commons),
#   "Main Chamber" (Lords), "Select & Joint Committees" (Commons),
#   "Select & Joint Committees" (Lords), "Westminster Hall"

_ORAL_Q_CATEGORIES = {
    "oral questions", "prime minister's question time",
    "departmental question time",
}

_DEBATE_CATEGORIES = {
    "debate", "general debate", "backbench business",
    "opposition day debate", "adjournment", "ten minute rule motion",
    "e-petition debate",
}

_STATEMENT_CATEGORIES = {
    "statements", "business statement", "short debate",
    "urgent question",
}

_BILL_CATEGORIES = {
    "legislation", "public bill committee", "presentation bill",
    "private members' bills",
}


def _normalise_event_type(api_type: str, api_category: str) -> str:
    """Map What's On API Type + Category to normalised event type."""
    cat_lower = (api_category or "").lower().strip()
    type_lower = (api_type or "").lower().strip()

    if cat_lower in _ORAL_Q_CATEGORIES:
        return "oral_questions"
    if cat_lower in _BILL_CATEGORIES:
        return "bill_stage"
    if cat_lower in _STATEMENT_CATEGORIES:
        return "statement"
    if "westminster hall" in type_lower:
        if cat_lower == "westminster hall debate":
            return "westminster_hall"
        return "westminster_hall"
    if "general committee" in type_lower or "grand committee" in type_lower:
        return "general_committee"
    if "select" in type_lower and "committee" in type_lower:
        return "committee"
    if cat_lower in _DEBATE_CATEGORIES:
        return "debate"
    # Main Chamber fallbacks
    if "main chamber" in type_lower:
        return "debate"

    return "debate"  # safe fallback


class LookaheadClient:
    """Async client for What's On and Committees APIs."""

    _host_semaphores: dict[str, asyncio.Semaphore] = {}

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=60.0,
            headers={"Accept": "application/json"},
            follow_redirects=True,
        )

    async def close(self):
        await self.client.aclose()

    @classmethod
    def _get_host_sem(cls, url: str) -> asyncio.Semaphore:
        host = urlparse(url).hostname or url
        if host not in cls._host_semaphores:
            cls._host_semaphores[host] = asyncio.Semaphore(2)
        return cls._host_semaphores[host]

    async def _get(
        self, url: str, params: dict, max_retries: int = 3
    ) -> dict | list | None:
        """GET with per-host rate limiting, retry and exponential backoff."""
        host_sem = self._get_host_sem(url)
        async with host_sem:
            for attempt in range(max_retries):
                try:
                    await asyncio.sleep(REQUEST_DELAY)
                    resp = await self.client.get(url, params=params)
                    resp.raise_for_status()
                    return resp.json()
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        wait = 2 ** (attempt + 1)
                        logger.warning("Rate limited on %s, waiting %ds", url, wait)
                        await asyncio.sleep(wait)
                        continue
                    logger.error("HTTP %s for %s: %s", e.response.status_code, url, e)
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    return None
                except httpx.RequestError as e:
                    logger.error("Request error for %s: %s", url, e)
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    return None
            return None

    # --- What's On Calendar API ---

    async def fetch_whatson_events(
        self, start_date: str, end_date: str, house: str = "Commons"
    ) -> list[dict]:
        """Fetch events from the What's On Calendar API for a single house."""
        url = f"{WHATSON_API_BASE}/calendar/events/list.json"
        data = await self._get(url, {
            "startDate": start_date,
            "endDate": end_date,
            "house": house,
        })
        if not data or not isinstance(data, list):
            logger.warning("No What's On data for %s %s–%s", house, start_date, end_date)
            return []

        events = []
        for raw in data:
            event_id = raw.get("Id")
            if not event_id:
                continue

            api_type = raw.get("Type", "")
            api_category = raw.get("Category", "")
            event_type = _normalise_event_type(api_type, api_category)

            # Build title from SummarisedDetails or Category
            raw_summary = raw.get("SummarisedDetails", "")
            summary = _strip_html(raw_summary)
            title = _clean_title(summary, api_type, house) or api_category or api_type

            # Extract committee info
            committee = raw.get("Committee")
            committee_name = ""
            if committee:
                committee_name = committee.get("Description", "")
                inquiries = committee.get("Inquiries", [])
                inquiry_name = inquiries[0].get("Name", "") if inquiries else ""
            else:
                inquiry_name = ""

            # Extract members
            members_list = []
            for m in raw.get("Members") or []:
                name = m.get("Name", "")
                if name:
                    members_list.append(name)

            # Build source URL
            source_url = f"https://whatson.parliament.uk/event/cal{event_id}"

            # Bill info
            bill_name = raw.get("BillName") or ""
            if raw.get("BillPageLink"):
                bill_url = raw["BillPageLink"]
                # If bill page link exists, prefer it as the source URL for bill stages
                if event_type == "bill_stage" and bill_url:
                    source_url = bill_url

            events.append({
                "id": f"whatson-{event_id}",
                "source": "whatson",
                "title": title,
                "description": summary,
                "event_type": event_type,
                "category": api_category,
                "type": api_type,
                "house": raw.get("House") or house,
                "location": raw.get("Location") or "",
                "start_date": (raw.get("StartDate") or "")[:10],
                "start_time": raw.get("StartTime") or "",
                "end_time": raw.get("EndTime") or "",
                "committee_name": committee_name,
                "inquiry_name": inquiry_name,
                "bill_name": bill_name,
                "source_url": source_url,
                "members": json.dumps(members_list),
                "raw_json": json.dumps(raw),
            })

        logger.info(
            "Fetched %d What's On events for %s (%s–%s)",
            len(events), house, start_date, end_date,
        )
        return events

    # --- Committees API ---

    async def fetch_committee_events(
        self, start_date: str, end_date: str
    ) -> list[dict]:
        """Fetch events from the Committees API."""
        url = f"{COMMITTEES_API_BASE}/api/Events"
        all_items = []
        skip = 0
        take = 100

        while True:
            data = await self._get(url, {
                "StartDateFrom": start_date,
                "StartDateTo": end_date,
                "take": take,
                "skip": skip,
            })
            if not data or not isinstance(data, dict):
                break

            items = data.get("items", [])
            all_items.extend(items)

            total = data.get("totalResults", 0)
            skip += take
            if skip >= total or not items:
                break

        events = []
        for raw in all_items:
            event_id = raw.get("id")
            if not event_id:
                continue

            event_type_info = raw.get("eventType", {})
            event_type_name = event_type_info.get("name", "")

            committees = raw.get("committees", [])
            committee_name = committees[0]["name"] if committees else ""
            house = committees[0].get("house", "") if committees else ""

            # Build title
            title = raw.get("name") or ""
            if not title and committee_name:
                title = f"{committee_name}: {event_type_name}"

            # Get inquiry info from activities
            inquiry_name = ""
            for activity in raw.get("activities", []):
                inq = activity.get("inquiry")
                if inq:
                    inquiry_name = inq.get("name", "")
                    break

            events.append({
                "id": f"committee-{event_id}",
                "source": "committees",
                "title": title,
                "description": f"{committee_name}: {title}" if committee_name else title,
                "event_type": "committee",
                "category": event_type_name,
                "type": "Select & Joint Committees",
                "house": house,
                "location": raw.get("location") or "",
                "start_date": (raw.get("startDate") or "")[:10],
                "start_time": (raw.get("startDate") or "")[11:16],
                "end_time": (raw.get("endDate") or "")[11:16],
                "committee_name": committee_name,
                "inquiry_name": inquiry_name,
                "bill_name": "",
                "source_url": f"https://committees.parliament.uk/event/{event_id}/",
                "members": "[]",
                "raw_json": json.dumps(raw),
            })

        logger.info(
            "Fetched %d committee events (%s–%s)", len(events), start_date, end_date,
        )
        return events

    # --- Recess / non-sitting dates ---

    async def fetch_recess_periods(
        self, start_date: str, end_date: str
    ) -> list[dict]:
        """Fetch parliamentary recess periods (categoryCode=REC) for both houses."""
        url = f"{WHATSON_API_BASE}/calendar/events/nonsitting.json"
        results = []
        for house in ("Commons", "Lords"):
            data = await self._get(url, {
                "startDate": start_date,
                "endDate": end_date,
                "categoryCode": "REC",
                "house": house,
            })
            if not data or not isinstance(data, list):
                logger.warning("No recess data for %s %s–%s", house, start_date, end_date)
                continue
            for raw in data:
                start = (raw.get("StartDate") or "")[:10]
                end = (raw.get("EndDate") or "")[:10]
                if not start or not end:
                    continue
                description = (
                    raw.get("Description")
                    or raw.get("Category")
                    or "Recess"
                )
                results.append({
                    "start_date": start,
                    "end_date": end,
                    "house": raw.get("House") or house,
                    "description": description,
                })
        logger.info("Fetched %d recess periods (%s–%s)", len(results), start_date, end_date)
        return results

    # --- Combined fetch ---

    async def fetch_all_events(
        self, start_date: str, end_date: str
    ) -> list[dict]:
        """Fetch from all sources in parallel, deduplicate, return normalised events."""
        commons_task = self.fetch_whatson_events(start_date, end_date, "Commons")
        lords_task = self.fetch_whatson_events(start_date, end_date, "Lords")
        committees_task = self.fetch_committee_events(start_date, end_date)

        results = await asyncio.gather(
            commons_task, lords_task, committees_task,
            return_exceptions=True,
        )

        all_events = []
        seen_ids = set()
        for batch in results:
            if isinstance(batch, Exception):
                logger.error("Error fetching events: %s", batch)
                continue
            for ev in batch:
                if ev["id"] not in seen_ids:
                    seen_ids.add(ev["id"])
                    all_events.append(ev)

        logger.info("Total unique events fetched: %d", len(all_events))
        return all_events
