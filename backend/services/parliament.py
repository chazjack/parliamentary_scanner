"""Async clients for all UK Parliament APIs.

Adapted from v1 api_client.py (sync/requests) to async httpx, with new sources:
EDMs, Bills, Commons Divisions.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

import base64

import httpx

from backend.config import (
    HANSARD_API_BASE,
    WRITTEN_QS_API_BASE,
    EDM_API_BASE,
    BILLS_API_BASE,
    DIVISIONS_API_BASE,
    MEMBERS_API_BASE,
    COMMITTEES_API_BASE,
    REQUEST_DELAY,
)

logger = logging.getLogger(__name__)

# Maximum pages to fetch per API source per keyword (avoids excessive pagination)
MAX_PAGES = 10


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    clean = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", clean).strip()


def _slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    return slug.strip("-")


def _build_hansard_url(
    house: str, dt: datetime, debate_section_ext_id: str,
    debate_title: str, contrib_ext_id: str,
) -> str:
    """Build correct Hansard URL for a contribution.

    Format: https://hansard.parliament.uk/{house}/{date}/debates/{sectionId}/{slug}#contribution-{contribId}
    Fallback: search URL if DebateSectionExtId unavailable.
    """
    if not debate_section_ext_id or not contrib_ext_id:
        if contrib_ext_id:
            return f"https://hansard.parliament.uk/search/contribution?contributionId={contrib_ext_id}"
        return ""

    house_lower = house.lower() if house else "commons"
    date_str = dt.strftime("%Y-%m-%d")
    title_slug = _slugify(debate_title) if debate_title else "debate"

    return (
        f"https://hansard.parliament.uk/{house_lower}/{date_str}"
        f"/debates/{debate_section_ext_id}/{title_slug}"
        f"#contribution-{contrib_ext_id}"
    )


@dataclass
class Contribution:
    """Normalised parliamentary contribution from any source."""

    id: str
    member_name: str
    member_id: str
    text: str
    date: datetime
    house: str  # "Commons" or "Lords"
    source_type: str  # "hansard", "written_question", "written_answer", "written_statement", "edm", "bill", "division"
    context: str  # debate title / question heading
    url: str
    matched_keywords: list[str] = field(default_factory=list)


class ParliamentAPIClient:
    """Async client for all UK Parliament APIs."""

    # Per-host semaphores for rate limiting (max 2 concurrent per host)
    _host_semaphores: dict[str, asyncio.Semaphore] = {}

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=60.0,
            headers={"Accept": "application/json"},
            follow_redirects=True,
        )
        self._member_cache: dict[str, dict] = {}
        # Cache of oral evidence sessions keyed by (start_date, end_date).
        # Each entry is a list of dicts: {id, text, member_name, house, context, date, url}
        # Populated once per scan; subsequent keyword searches reuse it.
        self._oral_evidence_cache: dict[tuple, list[dict]] = {}

    async def close(self):
        await self.client.aclose()

    @classmethod
    def _get_host_sem(cls, url: str) -> asyncio.Semaphore:
        """Get or create a per-host semaphore (max 2 concurrent)."""
        from urllib.parse import urlparse
        host = urlparse(url).hostname or url
        if host not in cls._host_semaphores:
            cls._host_semaphores[host] = asyncio.Semaphore(2)
        return cls._host_semaphores[host]

    async def _get(self, url: str, params: dict, max_retries: int = 3) -> dict | None:
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

    async def _get_bytes(self, url: str, max_retries: int = 3) -> bytes | None:
        """GET raw bytes (for document endpoints that return binary/base64 content)."""
        host_sem = self._get_host_sem(url)
        async with host_sem:
            for attempt in range(max_retries):
                try:
                    await asyncio.sleep(REQUEST_DELAY)
                    resp = await self.client.get(url)
                    resp.raise_for_status()
                    return resp.content
                except httpx.HTTPStatusError as e:
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

    # ---- Members API (enrichment) ----

    async def lookup_member(self, member_id: str) -> dict:
        """Look up member details. Returns dict with name, party, type, constituency."""
        if member_id in self._member_cache:
            return self._member_cache[member_id]

        url = f"{MEMBERS_API_BASE}/api/Members/{member_id}"
        data = await self._get(url, {})
        if not data:
            result = {"name": "", "party": "", "member_type": "", "constituency": ""}
            self._member_cache[member_id] = result
            return result

        value = data.get("value", {})
        name = value.get("nameDisplayAs", "")
        party = value.get("latestParty", {}).get("name", "")

        # Determine MP vs Peer from latest house membership
        memberships = value.get("latestHouseMembership", {})
        house_num = memberships.get("house", 0)
        member_type = "MP" if house_num == 1 else "Peer" if house_num == 2 else ""
        constituency = memberships.get("membershipFrom", "")

        result = {
            "name": name,
            "party": party,
            "member_type": member_type,
            "constituency": constituency,
        }
        self._member_cache[member_id] = result
        return result

    async def get_parties(self) -> list[dict]:
        """Get all active parties from Commons and Lords, merged and sorted."""
        parties: dict[str, dict] = {}
        for house_num in (1, 2):
            data = await self._get(f"{MEMBERS_API_BASE}/api/Parties/GetActive/{house_num}", {})
            if not data:
                continue
            for item in data.get("items", []):
                value = item.get("value", item)
                name = value.get("name", "").strip()
                if name and name not in parties:
                    parties[name] = {"id": str(value.get("id", "")), "name": name}
        return sorted(parties.values(), key=lambda p: p["name"])

    async def search_members(self, query: str, house: int | None = None) -> list[dict]:
        """Search for MPs and Peers by name. Returns list of {id, name, party, member_type, constituency}."""
        url = f"{MEMBERS_API_BASE}/api/Members/Search"
        params = {"Name": query, "IsCurrentMember": "true", "skip": 0, "take": 50}
        if house:
            params["House"] = house
        data = await self._get(url, params)
        if not data:
            return []

        items = data.get("items") or data.get("value", [])
        results = []
        for item in items:
            value = item.get("value", item)
            member_id = value.get("id", "")
            name = value.get("nameDisplayAs", "")
            party = value.get("latestParty", {}).get("name", "")
            membership = value.get("latestHouseMembership", {})
            house_num = membership.get("house", 0)
            member_type = "MP" if house_num == 1 else "Peer" if house_num == 2 else ""
            constituency = membership.get("membershipFrom", "")
            if name:
                results.append({
                    "id": str(member_id),
                    "name": name,
                    "party": party,
                    "member_type": member_type,
                    "constituency": constituency,
                })
        return results

    # ---- Hansard API ----

    async def search_hansard(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Hansard for oral/debate contributions."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "queryParameters.searchTerm": keyword,
                "queryParameters.startDate": start_date,
                "queryParameters.endDate": end_date,
                "queryParameters.take": 20,
                "queryParameters.skip": skip,
                "queryParameters.orderBy": "SittingDateDesc",
            }

            data = await self._get(f"{HANSARD_API_BASE}/search.json", params)
            if not data:
                break

            items = data.get("Contributions", [])
            if not items:
                break

            total = data.get("TotalContributions", 0)
            logger.debug("Hansard '%s': %d/%d (skip=%d)", keyword, len(items), total, skip)

            before = len(contributions)
            for item in items:
                member_name = item.get("MemberName") or item.get("AttributedTo", "")
                if not member_name:
                    continue
                text = item.get("ContributionTextFull") or item.get("ContributionText", "")
                if not text:
                    continue

                contrib_ext_id = item.get("ContributionExtId", "")
                debate_section_ext_id = item.get("DebateSectionExtId", "")
                sitting_date = item.get("SittingDate", "")
                try:
                    dt = datetime.fromisoformat(sitting_date.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                house = item.get("House", "")
                debate_title = item.get("DebateSection", "") or item.get("HansardSection", "")

                url = _build_hansard_url(
                    house, dt, debate_section_ext_id, debate_title, contrib_ext_id
                )

                contributions.append(Contribution(
                    id=contrib_ext_id or item.get("ItemId", ""),
                    member_name=member_name.strip(),
                    member_id=str(item.get("MemberId", "")),
                    text=_strip_html(text),
                    date=dt,
                    house=house,
                    source_type="hansard",
                    context=debate_title,
                    url=url,
                    matched_keywords=[keyword],
                ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

            page += 1
            skip += len(items)
            if skip >= total:
                break

        return contributions

    # ---- Written Questions API ----

    async def search_written_questions(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Written Questions API. Returns question + answer as separate contributions."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "searchTerm": keyword,
                "tabledWhenFrom": start_date,
                "tabledWhenTo": end_date,
                "take": 20,
                "skip": skip,
            }

            data = await self._get(
                f"{WRITTEN_QS_API_BASE}/api/writtenquestions/questions", params
            )
            if not data:
                break

            results = data.get("results", [])
            if not results:
                break
            total = data.get("totalResults", 0)

            before = len(contributions)
            for item in results:
                val = item.get("value", {})
                question_id = str(val.get("id", ""))
                uin = val.get("uin", "")
                question_text = val.get("questionText", "")
                answer_text = val.get("answerText", "")
                heading = val.get("heading", "")
                house = val.get("house", "")
                date_tabled = val.get("dateTabled", "")

                try:
                    dt = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                url = ""
                if uin:
                    url = f"https://questions-statements.parliament.uk/written-questions/detail/{dt.strftime('%Y-%m-%d')}/{uin}"

                # Asking member's question
                asking_id = val.get("askingMemberId")
                asking_member = val.get("askingMember")
                if question_text and asking_id:
                    name = asking_member.get("name", "") if asking_member else ""
                    if not name:
                        info = await self.lookup_member(str(asking_id))
                        name = info["name"]
                    if name:
                        contributions.append(Contribution(
                            id=f"wq-q-{question_id}",
                            member_name=name.strip(),
                            member_id=str(asking_id),
                            text=_strip_html(question_text),
                            date=dt,
                            house=house,
                            source_type="written_question",
                            context=heading,
                            url=url,
                            matched_keywords=[keyword],
                        ))

                # Answering member's response
                answering_id = val.get("answeringMemberId")
                answering_member = val.get("answeringMember")
                if answer_text and answering_id:
                    ans_name = answering_member.get("name", "") if answering_member else ""
                    if not ans_name:
                        info = await self.lookup_member(str(answering_id))
                        ans_name = info["name"]
                    if ans_name:
                        date_answered = val.get("dateAnswered", date_tabled)
                        try:
                            ans_dt = datetime.fromisoformat(date_answered.replace("Z", "+00:00"))
                        except (ValueError, AttributeError):
                            ans_dt = dt

                        contributions.append(Contribution(
                            id=f"wq-a-{question_id}",
                            member_name=ans_name.strip(),
                            member_id=str(answering_id),
                            text=_strip_html(answer_text),
                            date=ans_dt,
                            house=house,
                            source_type="written_answer",
                            context=heading,
                            url=url,
                            matched_keywords=[keyword],
                        ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

            skip += 20
            page += 1
            if skip >= total:
                break

        return contributions

    # ---- Written Statements API ----

    async def search_written_statements(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Written Statements API."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "searchTerm": keyword,
                "madeWhenFrom": start_date,
                "madeWhenTo": end_date,
                "take": 20,
                "skip": skip,
            }

            data = await self._get(
                f"{WRITTEN_QS_API_BASE}/api/writtenstatements/statements", params
            )
            if not data:
                break

            results = data.get("results", [])
            if not results:
                break
            total = data.get("totalResults", 0)

            before = len(contributions)
            for item in results:
                val = item.get("value", {})
                statement_id = str(val.get("id", ""))
                text = val.get("text", "") or val.get("statementText", "")
                heading = val.get("title", "") or val.get("heading", "")
                house = val.get("house", "")
                date_made = val.get("dateMade", "")

                try:
                    dt = datetime.fromisoformat(date_made.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                if not text:
                    continue

                member = val.get("member") or val.get("makingMember")
                member_id_val = str(val.get("memberId", ""))
                if member:
                    member_name = member.get("name", "")
                elif member_id_val:
                    info = await self.lookup_member(member_id_val)
                    member_name = info["name"]
                else:
                    continue

                if not member_name:
                    continue

                url = ""
                uin = val.get("uin", "")
                if uin:
                    url = f"https://questions-statements.parliament.uk/written-statements/detail/{dt.strftime('%Y-%m-%d')}/{uin}"

                contributions.append(Contribution(
                    id=f"ws-{statement_id}",
                    member_name=member_name.strip(),
                    member_id=member_id_val or (str(member.get("id", "")) if member else ""),
                    text=_strip_html(text),
                    date=dt,
                    house=house,
                    source_type="written_statement",
                    context=heading,
                    url=url,
                    matched_keywords=[keyword],
                ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

            skip += 20
            page += 1
            if skip >= total:
                break

        return contributions

    # ---- Early Day Motions API (NEW) ----

    async def search_edms(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Early Day Motions API."""
        contributions = []
        skip = 0

        while True:
            params = {
                "searchTerm": keyword,
                "tabledStartDate": start_date,
                "tabledEndDate": end_date,
                "take": 100,
                "skip": skip,
            }

            data = await self._get(f"{EDM_API_BASE}/EarlyDayMotions/list", params)
            if not data:
                break

            response = data.get("Response", [])
            if not response:
                # Try alternate response structure
                response = data if isinstance(data, list) else []
                if not response:
                    break

            paging = data.get("PagingInfo", {})
            total = paging.get("Total", len(response))

            before = len(contributions)
            for edm in response:
                edm_id = str(edm.get("Id", ""))
                title = edm.get("Title", "")
                motion_text = edm.get("MotionText", "")
                date_tabled = edm.get("DateTabled", "")
                sponsor = edm.get("PrimarySponsor", {})
                sponsor_name = sponsor.get("Name", "")
                sponsor_id = str(sponsor.get("MnisId", ""))
                sponsors_count = edm.get("SponsorsCount", 0)

                try:
                    dt = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                text = f"{title}\n\n{_strip_html(motion_text)}" if motion_text else title
                url = f"https://edm.parliament.uk/early-day-motion/{edm_id}"

                if sponsor_name:
                    contributions.append(Contribution(
                        id=f"edm-{edm_id}",
                        member_name=sponsor_name.strip(),
                        member_id=sponsor_id,
                        text=text,
                        date=dt,
                        house="Commons",  # EDMs are Commons only
                        source_type="edm",
                        context=f"Early Day Motion: {title} ({sponsors_count} sponsors)",
                        url=url,
                        matched_keywords=[keyword],
                    ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

            skip += 100
            if skip >= total:
                break

        return contributions

    # ---- Bills API (NEW) ----

    async def search_bills(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Bills API for relevant bills and their sponsors.

        Bills API list endpoint doesn't include sponsors, so we fetch
        individual bill details for each match.
        """
        contributions = []
        skip = 0

        while True:
            params = {
                "SearchTerm": keyword,
                "Skip": skip,
                "Take": 20,
            }

            data = await self._get(f"{BILLS_API_BASE}/api/v1/Bills", params)
            if not data:
                break

            items = data.get("items", [])
            if not items:
                break
            total = data.get("totalResults", len(items))

            before = len(contributions)
            for bill in items:
                bill_id = str(bill.get("billId", ""))
                title = bill.get("shortTitle", "") or bill.get("longTitle", "")
                current_house = bill.get("currentHouse", "")
                last_update = bill.get("lastUpdate", "")

                try:
                    dt = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                # Filter by date range (Bills API doesn't support date params)
                start_dt = datetime.fromisoformat(start_date)
                end_dt = datetime.fromisoformat(end_date)
                if dt.replace(tzinfo=None) < start_dt or dt.replace(tzinfo=None) > end_dt:
                    continue

                # Fetch bill details to get sponsors
                detail = await self._get(f"{BILLS_API_BASE}/api/v1/Bills/{bill_id}", {})
                if not detail:
                    continue

                sponsors = detail.get("sponsors", [])
                url = f"https://bills.parliament.uk/bills/{bill_id}"

                for sponsor in sponsors:
                    member = sponsor.get("member", {})
                    member_name = member.get("name", "")
                    member_id = str(member.get("memberId", ""))

                    if member_name:
                        contributions.append(Contribution(
                            id=f"bill-{bill_id}-{member_id}",
                            member_name=member_name.strip(),
                            member_id=member_id,
                            text=f"Sponsor of bill: {title}",
                            date=dt,
                            house=current_house or member.get("house", "Commons"),
                            source_type="bill",
                            context=f"Bill: {title}",
                            url=url,
                            matched_keywords=[keyword],
                        ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

            skip += 20
            if skip >= total:
                break

        return contributions

    # ---- Commons Divisions API (NEW) ----

    async def search_divisions(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search Commons Divisions for relevant votes."""
        contributions = []

        params = {
            "queryParameters.searchTerm": keyword,
            "queryParameters.startDate": start_date,
            "queryParameters.endDate": end_date,
            "queryParameters.take": 25,
            "queryParameters.skip": 0,
        }

        data = await self._get(f"{DIVISIONS_API_BASE}/data/divisions.json/search", params)
        if not data:
            return contributions

        divisions = data if isinstance(data, list) else data.get("results", [])

        for div in divisions[:10]:  # Limit to 10 most relevant divisions
            div_id = str(div.get("DivisionId", ""))
            title = div.get("Title", "")
            date_str = div.get("Date", "")
            aye_count = div.get("AyeCount", 0)
            no_count = div.get("NoCount", 0)

            try:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                dt = datetime.now()

            # Fetch full division details to get member votes
            detail = await self._get(
                f"{DIVISIONS_API_BASE}/data/divisions.json/{div_id}", {}
            )
            if not detail:
                continue

            ayes = detail.get("Ayes", []) or []
            noes = detail.get("Noes", []) or []

            before = len(contributions)
            for voter in ayes[:50]:  # Cap to avoid huge lists
                name = voter.get("Name", "")
                mid = str(voter.get("MemberId", ""))
                party = voter.get("Party", "")
                if name:
                    contributions.append(Contribution(
                        id=f"div-{div_id}-aye-{mid}",
                        member_name=name.strip(),
                        member_id=mid,
                        text=f"Voted Aye on: {title} (Ayes: {aye_count}, Noes: {no_count})",
                        date=dt,
                        house="Commons",
                        source_type="division",
                        context=f"Division: {title}",
                        url=f"https://commonsvotes.digiminster.com/Divisions/Details/{div_id}",
                        matched_keywords=[keyword],
                    ))

            for voter in noes[:50]:
                name = voter.get("Name", "")
                mid = str(voter.get("MemberId", ""))
                if name:
                    contributions.append(Contribution(
                        id=f"div-{div_id}-no-{mid}",
                        member_name=name.strip(),
                        member_id=mid,
                        text=f"Voted No on: {title} (Ayes: {aye_count}, Noes: {no_count})",
                        date=dt,
                        house="Commons",
                        source_type="division",
                        context=f"Division: {title}",
                        url=f"https://commonsvotes.digiminster.com/Divisions/Details/{div_id}",
                        matched_keywords=[keyword],
                    ))

            if on_page and len(contributions) > before:
                await on_page(contributions[before:])

        return contributions

    # ---- Committees Oral Evidence API ----

    @staticmethod
    def _parse_transcript_text(html: str) -> str:
        """Strip HTML tags and decode entities to plain text."""
        text = re.sub(r"<[^>]+>", "", html)
        text = re.sub(r"&#xa0;|&nbsp;", " ", text)
        text = re.sub(r"&[a-z#0-9]+;", "", text)
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _extract_quote_near(text: str, keyword: str, window: int = 500) -> str:
        """Return a snippet of transcript text centred on the first occurrence of keyword."""
        idx = text.lower().find(keyword.lower())
        if idx == -1:
            return text[:window]
        start = max(0, idx - window // 2)
        end = min(len(text), idx + window // 2)
        snippet = text[start:end].strip()
        if start > 0:
            snippet = "..." + snippet
        if end < len(text):
            snippet += "..."
        return snippet

    @staticmethod
    def _find_speaker_at_keyword(text: str, keyword: str) -> str | None:
        """Attempt to identify the speaker at the point where keyword appears.

        Looks backwards from the keyword for patterns like 'Name:' or 'Q123 Name:'
        typical of Hansard/committee transcript formatting.
        """
        idx = text.lower().find(keyword.lower())
        if idx == -1:
            return None
        preceding = text[:idx]
        # Speaker patterns: optional Q-number, then title-case name words, then colon
        matches = list(re.finditer(
            r'(?:Q\s*\d+\s+)?([A-Z][a-zA-Z\-\']+(?:\s+[A-Z][a-zA-Z\-\']+){0,4}):',
            preceding
        ))
        if matches:
            return matches[-1].group(1).strip()
        return None

    @staticmethod
    def _extract_present_members(plain_text: str) -> list[str]:
        """Parse 'Members present' and 'Also present' sections from transcript plain text.

        Returns cleaned name strings — always MPs/Peers as only committee members
        and invited parliamentarians appear in these sections.
        """
        names = []
        for prefix in ("Members present:", "Also present:"):
            m = re.search(re.escape(prefix) + r"\s*(.+?)\.", plain_text)
            if not m:
                continue
            for raw_name in m.group(1).split(";"):
                name = re.sub(r"\(.*?\)", "", raw_name).strip()
                if name:
                    names.append(name)
        return names

    @staticmethod
    def _extract_witnesses(plain_text: str) -> list[str]:
        """Parse 'WitnessI:', 'WitnessII:' etc. from transcript plain text.

        Returns the name portion of each witness entry (before any comma/title).
        Witnesses may be external experts or parliamentarians (e.g. ministers).
        """
        names = []
        for m in re.finditer(r"Witness(?:es)?\s*[IVX\d]+\s*:\s*([^,\n]{5,80})", plain_text):
            name = m.group(1).strip()
            if name:
                names.append(name)
        return names

    def _parse_oral_evidence_item(self, item: dict) -> dict | None:
        """Extract and normalise metadata from a raw OralEvidence API item."""
        evidence_id = item.get("id")
        if not evidence_id:
            return None

        meeting_date = item.get("meetingDate") or item.get("activityStartDate", "")
        try:
            dt = datetime.fromisoformat(meeting_date.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            dt = datetime.now()

        committees = item.get("committees", []) or []
        committee_name = committees[0].get("name", "") if committees else ""
        house_raw = committees[0].get("house", "") if committees else ""
        if "lord" in house_raw.lower():
            house = "Lords"
        elif "joint" in house_raw.lower() or "both" in house_raw.lower():
            house = "Joint"
        else:
            house = "Commons"

        businesses = item.get("committeeBusinesses", []) or []
        inquiry_name = businesses[0].get("name", "") if businesses else ""

        witnesses = item.get("witnesses", []) or []
        witness_names = []
        for w in witnesses:
            name = w.get("name") or ""
            if not name:
                orgs = w.get("organisations", []) or []
                name = orgs[0].get("name", "") if orgs else ""
            if name:
                witness_names.append(name)
        member_name = ", ".join(witness_names) if witness_names else committee_name or "Committee witness"

        return {
            "id": evidence_id,
            "dt": dt,
            "house": house,
            "committee_name": committee_name,
            "inquiry_name": inquiry_name,
            "member_name": member_name,
        }

    async def _load_oral_evidence_sessions(self, start_date: str, end_date: str) -> list[dict]:
        """Fetch all oral evidence sessions in the date range, download their transcript
        text, and cache the results. Called once per scan regardless of keyword count."""
        cache_key = (start_date, end_date)
        if cache_key in self._oral_evidence_cache:
            return self._oral_evidence_cache[cache_key]

        sessions = []
        skip = 0
        while True:
            params = {"StartDate": start_date, "EndDate": end_date, "Take": 30, "Skip": skip}
            data = await self._get(f"{COMMITTEES_API_BASE}/api/OralEvidence", params)
            if not data:
                break
            items = data.get("items", []) if isinstance(data, dict) else []
            if not items:
                break

            for item in items:
                meta = self._parse_oral_evidence_item(item)
                if not meta:
                    continue

                # Fetch and decode transcript
                doc_url = f"{COMMITTEES_API_BASE}/api/OralEvidence/{meta['id']}/Document/Html"
                raw_bytes = await self._get_bytes(doc_url)
                plain = ""
                if raw_bytes:
                    try:
                        plain = self._parse_transcript_text(
                            base64.b64decode(raw_bytes).decode("utf-8", errors="replace")
                        )
                    except Exception:
                        plain = self._parse_transcript_text(
                            raw_bytes.decode("utf-8", errors="replace")
                        )

                meta["parliamentarians"] = self._extract_present_members(plain)
                meta["witnesses"] = self._extract_witnesses(plain)
                meta["text"] = plain
                sessions.append(meta)
                logger.debug(
                    "Loaded oral evidence session %s (%d chars, %d members, %d witnesses)",
                    meta["id"], len(plain), len(meta["parliamentarians"]), len(meta["witnesses"])
                )

            total = data.get("totalResults", 0) if isinstance(data, dict) else 0
            skip += 30
            if skip >= total or not items:
                break

        self._oral_evidence_cache[cache_key] = sessions
        logger.info("Oral evidence cache: %d sessions for %s–%s", len(sessions), start_date, end_date)
        return sessions

    async def search_oral_evidence(
        self, keyword: str, start_date: str, end_date: str, on_page=None
    ) -> list[Contribution]:
        """Search select committee oral evidence transcripts by keyword in full text."""
        sessions = await self._load_oral_evidence_sessions(start_date, end_date)

        contributions = []
        kw_lower = keyword.lower()
        for s in sessions:
            if kw_lower not in s["text"].lower():
                continue

            parliamentarians = s.get("parliamentarians", [])
            witnesses = s.get("witnesses", [])
            all_names = parliamentarians + witnesses
            if not all_names:
                logger.debug("Skipping oral evidence session %s — no participants found", s["id"])
                continue

            # Try to identify the specific speaker at the point the keyword appears;
            # fall back to all session participants if detection fails.
            speaker = self._find_speaker_at_keyword(s["text"], keyword)
            if speaker:
                member_name = speaker
            else:
                member_name = "; ".join(all_names)
            context = s["inquiry_name"] or s["committee_name"] or "Select Committee Oral Evidence"
            url = f"https://committees.parliament.uk/oralevidence/{s['id']}/html/"

            contributions.append(Contribution(
                id=f"oe-{s['id']}",
                member_name=member_name,
                member_id="",
                text=self._extract_quote_near(s["text"], keyword),
                date=s["dt"],
                house=s["house"],
                source_type="oral_evidence",
                context=context,
                url=url,
                matched_keywords=[keyword],
            ))

        if on_page and contributions:
            await on_page(contributions)

        return contributions

    # ---- Unified search ----

    SOURCE_NAMES = [
        "Hansard",
        "Written Questions",
        "Written Statements",
        "Early Day Motions",
        "Bills",
        "Divisions",
        "Oral Evidence",
    ]

    async def search_all(
        self,
        keyword: str,
        start_date: str,
        end_date: str,
        cancel_event: asyncio.Event | None = None,
        on_source_start=None,
        on_page=None,
        enabled_sources: list[str] | None = None,
    ) -> list[Contribution]:
        """Search all 6 API sources for a keyword in parallel.

        Args:
            on_source_start: Optional async callback(source_name, source_index, total_sources)
                called before each source is searched.
            on_page: Optional async callback(count) called after each page of results is
                fetched from any source, with the number of contributions added on that page.
            enabled_sources: Optional list of source keys to search. If None, all sources are searched.
        """
        all_sources = [
            ("Hansard", "hansard", self.search_hansard),
            ("Written Questions", "written_questions", self.search_written_questions),
            ("Written Statements", "written_statements", self.search_written_statements),
            ("Early Day Motions", "edms", self.search_edms),
            ("Bills", "bills", self.search_bills),
            ("Divisions", "divisions", self.search_divisions),
            ("Oral Evidence", "oral_evidence", self.search_oral_evidence),
        ]

        # Filter to only enabled sources
        if enabled_sources is not None:
            sources = [(name, key, method) for name, key, method in all_sources if key in enabled_sources]
        else:
            sources = all_sources

        if on_source_start:
            await on_source_start(f"all sources", 0, len(sources))

        async def _search_one(name, method):
            if cancel_event and cancel_event.is_set():
                return []
            try:
                logger.info("Searching %s for '%s'", name, keyword)
                found = await method(keyword, start_date, end_date, on_page=on_page)
                logger.info("  -> %d results from %s", len(found), name)
                return found
            except Exception as e:
                logger.error("Error searching %s for '%s': %s", name, keyword, e)
                return []

        # Search all sources in parallel (per-host semaphore handles rate limiting)
        tasks = [_search_one(name, method) for name, key, method in sources]
        source_results = await asyncio.gather(*tasks)

        results = []
        for found in source_results:
            results.extend(found)

        return results

    # ---- Member-specific fetch methods ----

    async def fetch_member_hansard(
        self, member_id: str, member_name: str, start_date: str, end_date: str
    ) -> list[Contribution]:
        """Fetch all spoken Hansard contributions by a specific member."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "queryParameters.memberId": member_id,
                "queryParameters.startDate": start_date,
                "queryParameters.endDate": end_date,
                "queryParameters.take": 20,
                "queryParameters.skip": skip,
            }

            data = await self._get(f"{HANSARD_API_BASE}/search/contributions/Spoken.json", params)
            if not data:
                break

            items = data.get("Results", [])
            if not items:
                break

            total = data.get("TotalResultCount", 0)

            for item in items:
                name = item.get("MemberName") or item.get("AttributedTo", "")
                if not name:
                    name = member_name
                text = item.get("ContributionTextFull") or item.get("ContributionText", "")
                if not text:
                    continue

                contrib_ext_id = item.get("ContributionExtId", "")
                debate_section_ext_id = item.get("DebateSectionExtId", "")
                sitting_date = item.get("SittingDate", "")
                try:
                    dt = datetime.fromisoformat(sitting_date.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                house = item.get("House", "")
                debate_title = item.get("DebateSection", "") or item.get("HansardSection", "")
                url = _build_hansard_url(house, dt, debate_section_ext_id, debate_title, contrib_ext_id)

                contributions.append(Contribution(
                    id=contrib_ext_id or item.get("ItemId", ""),
                    member_name=name.strip(),
                    member_id=str(item.get("MemberId", member_id)),
                    text=_strip_html(text),
                    date=dt,
                    house=house,
                    source_type="hansard",
                    context=debate_title,
                    url=url,
                    matched_keywords=[],
                ))

            page += 1
            skip += len(items)
            if skip >= total:
                break

        return contributions

    async def fetch_member_written_questions(
        self, member_id: str, member_name: str, start_date: str, end_date: str
    ) -> list[Contribution]:
        """Fetch written questions asked by a specific member."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "askingMemberId": member_id,
                "tabledWhenFrom": start_date,
                "tabledWhenTo": end_date,
                "take": 20,
                "skip": skip,
            }

            data = await self._get(
                f"{WRITTEN_QS_API_BASE}/api/writtenquestions/questions", params
            )
            if not data:
                break

            results = data.get("results", [])
            if not results:
                break
            total = data.get("totalResults", 0)

            for item in results:
                val = item.get("value", {})
                question_id = str(val.get("id", ""))
                question_text = val.get("questionText", "")
                heading = val.get("heading", "")
                house = val.get("house", "")
                date_tabled = val.get("dateTabled", "")
                uin = val.get("uin", "")

                try:
                    dt = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                url = ""
                if uin:
                    url = f"https://questions-statements.parliament.uk/written-questions/detail/{dt.strftime('%Y-%m-%d')}/{uin}"

                asking_member = val.get("askingMember")
                name = asking_member.get("name", "") if asking_member else member_name

                if question_text and name:
                    contributions.append(Contribution(
                        id=f"wq-q-{question_id}",
                        member_name=name.strip(),
                        member_id=member_id,
                        text=_strip_html(question_text),
                        date=dt,
                        house=house,
                        source_type="written_question",
                        context=heading,
                        url=url,
                        matched_keywords=[],
                    ))

            skip += 20
            page += 1
            if skip >= total:
                break

        return contributions

    async def fetch_member_answered_written_questions(
        self, member_id: str, member_name: str, start_date: str, end_date: str
    ) -> list[Contribution]:
        """Fetch written questions answered by a specific member (as a minister)."""
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "answeringMemberId": member_id,
                "answeredWhenFrom": start_date,
                "answeredWhenTo": end_date,
                "take": 20,
                "skip": skip,
            }

            data = await self._get(
                f"{WRITTEN_QS_API_BASE}/api/writtenquestions/questions", params
            )
            if not data:
                break

            results = data.get("results", [])
            if not results:
                break
            total = data.get("totalResults", 0)

            for item in results:
                val = item.get("value", {})
                question_id = str(val.get("id", ""))
                answer_text = val.get("answerText", "")
                heading = val.get("heading", "")
                house = val.get("house", "")
                date_tabled = val.get("dateTabled", "")
                date_answered = val.get("dateAnswered", date_tabled)
                uin = val.get("uin", "")

                try:
                    dt_tabled = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt_tabled = datetime.now()

                try:
                    ans_dt = datetime.fromisoformat(date_answered.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    ans_dt = dt_tabled

                url = ""
                if uin:
                    url = f"https://questions-statements.parliament.uk/written-questions/detail/{dt_tabled.strftime('%Y-%m-%d')}/{uin}"

                answering_member = val.get("answeringMember")
                name = answering_member.get("name", "") if answering_member else member_name

                if answer_text and name:
                    contributions.append(Contribution(
                        id=f"wq-a-{question_id}",
                        member_name=name.strip(),
                        member_id=member_id,
                        text=_strip_html(answer_text),
                        date=ans_dt,
                        house=house,
                        source_type="written_answer",
                        context=heading,
                        url=url,
                        matched_keywords=[],
                    ))

            skip += 20
            page += 1
            if skip >= total:
                break

        return contributions

    async def fetch_member_written_statements(
        self, member_id: str, member_name: str, start_date: str, end_date: str
    ) -> list[Contribution]:
        """Fetch written statements made by a specific member.

        Note: The memberId param may be silently ignored by the API on some versions.
        Results are post-filtered by member_id as a fallback.
        """
        contributions = []
        skip = 0
        page = 0

        while page < MAX_PAGES:
            params = {
                "memberId": member_id,
                "madeWhenFrom": start_date,
                "madeWhenTo": end_date,
                "take": 20,
                "skip": skip,
            }

            data = await self._get(
                f"{WRITTEN_QS_API_BASE}/api/writtenstatements/statements", params
            )
            if not data:
                break

            results = data.get("results", [])
            if not results:
                break
            total = data.get("totalResults", 0)

            for item in results:
                val = item.get("value", {})
                statement_id = str(val.get("id", ""))
                text = val.get("text", "") or val.get("statementText", "")
                heading = val.get("title", "") or val.get("heading", "")
                house = val.get("house", "")
                date_made = val.get("dateMade", "")
                uin = val.get("uin", "")

                try:
                    dt = datetime.fromisoformat(date_made.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                if not text:
                    continue

                member = val.get("member") or val.get("makingMember")
                member_id_val = str(val.get("memberId", ""))
                if member:
                    name = member.get("name", "")
                    item_member_id = str(member.get("id", member_id_val or member_id))
                else:
                    name = member_name
                    item_member_id = member_id_val or member_id

                if not name:
                    continue

                # Post-filter: skip if this statement belongs to a different member
                if item_member_id and item_member_id != member_id:
                    continue

                url = ""
                if uin:
                    url = f"https://questions-statements.parliament.uk/written-statements/detail/{dt.strftime('%Y-%m-%d')}/{uin}"

                contributions.append(Contribution(
                    id=f"ws-{statement_id}",
                    member_name=name.strip(),
                    member_id=item_member_id,
                    text=_strip_html(text),
                    date=dt,
                    house=house,
                    source_type="written_statement",
                    context=heading,
                    url=url,
                    matched_keywords=[],
                ))

            skip += 20
            page += 1
            if skip >= total:
                break

        return contributions

    async def fetch_member_edms(
        self, member_id: str, member_name: str, start_date: str, end_date: str
    ) -> list[Contribution]:
        """Fetch EDMs where this member is the primary sponsor (uses MNIS ID)."""
        contributions = []
        skip = 0

        while True:
            params = {
                "primarySponsorId": member_id,
                "tabledStartDate": start_date,
                "tabledEndDate": end_date,
                "take": 100,
                "skip": skip,
            }

            data = await self._get(f"{EDM_API_BASE}/EarlyDayMotions/list", params)
            if not data:
                break

            response = data.get("Response", [])
            if not response:
                response = data if isinstance(data, list) else []
                if not response:
                    break

            paging = data.get("PagingInfo", {})
            total = paging.get("Total", len(response))

            # The EDM API's primarySponsorId uses MNIS IDs which may not match
            # Parliament Members API IDs for newer MPs. Use sponsor name as a
            # fallback guard so we only keep EDMs actually tabled by this member.
            target_name_lower = member_name.lower().strip()
            target_parts = target_name_lower.split() if target_name_lower else []

            for edm in response:
                edm_id = str(edm.get("Id", ""))
                title = edm.get("Title", "")
                motion_text = edm.get("MotionText", "")
                date_tabled = edm.get("DateTabled", "")
                sponsor = edm.get("PrimarySponsor", {})
                sponsor_name = sponsor.get("Name", "") or member_name
                sponsor_id = str(sponsor.get("MnisId", member_id))
                sponsors_count = edm.get("SponsorsCount", 0)

                # Skip EDMs not actually sponsored by this member.
                # Match all parts of the target name against the sponsor name to
                # avoid false positives from members sharing the same surname.
                sponsor_name_lower = sponsor_name.lower()
                if target_parts and not all(part in sponsor_name_lower for part in target_parts):
                    continue

                try:
                    dt = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                text = f"{title}\n\n{_strip_html(motion_text)}" if motion_text else title
                url = f"https://edm.parliament.uk/early-day-motion/{edm_id}"

                contributions.append(Contribution(
                    id=f"edm-{edm_id}",
                    member_name=sponsor_name.strip(),
                    member_id=member_id,
                    text=text,
                    date=dt,
                    house="Commons",
                    source_type="edm",
                    context=f"Early Day Motion: {title} ({sponsors_count} sponsors)",
                    url=url,
                    matched_keywords=[],
                ))

            skip += 100
            if skip >= total:
                break

        return contributions

    async def fetch_member_oral_evidence(
        self,
        member_id: str,
        member_name: str,
        start_date: str,
        end_date: str,
    ) -> list[Contribution]:
        """Find oral evidence sessions where a specific member participated.

        Searches transcript text for the member's surname (last token of member_name),
        then checks the participants list. Returns contributions with member_id set
        so they pass the scanner's member_id hard filter.
        """
        sessions = await self._load_oral_evidence_sessions(start_date, end_date)

        # Use surname for broad text search; handles "Baroness X", "Mr X MP" etc.
        name_parts = [p.lower() for p in member_name.strip().split()] if member_name.strip() else []
        surname = name_parts[-1] if name_parts else ""
        if not surname or len(surname) < 3:
            return []

        contributions = []
        for s in sessions:
            if surname not in s["text"].lower():
                continue

            all_names = s.get("parliamentarians", []) + s.get("witnesses", [])
            # Verify the member actually participated: all name parts must appear in
            # at least one participant entry to avoid false positives from same surname.
            def name_matches(n: str) -> bool:
                n_lower = n.lower()
                return all(part in n_lower for part in name_parts)

            if not any(name_matches(n) for n in all_names):
                continue

            # Use the specific matched participant name rather than all participants
            matched_name = next((n for n in all_names if name_matches(n)), member_name)
            context = s["inquiry_name"] or s["committee_name"] or "Select Committee Oral Evidence"
            url = f"https://committees.parliament.uk/oralevidence/{s['id']}/html/"

            contributions.append(Contribution(
                id=f"oe-{s['id']}",
                member_name=matched_name,
                member_id=member_id,  # set so scanner's member_id filter passes
                text=self._extract_quote_near(s["text"], surname),
                date=s["dt"],
                house=s["house"],
                source_type="oral_evidence",
                context=context,
                url=url,
                matched_keywords=[],
            ))

        return contributions

    async def fetch_member_all(
        self,
        member_id: str,
        member_name: str,
        start_date: str,
        end_date: str,
        enabled_sources: list[str] | None = None,
        cancel_event: asyncio.Event | None = None,
        on_source_complete=None,  # async callable(member_name, source_key, count)
        on_results_batch=None,   # async callable(list[Contribution]) — called as each source completes
    ) -> list[Contribution]:
        """Fetch all activity for a specific member from applicable sources in parallel.

        Divisions and Bills are omitted — no per-member list endpoints exist.
        They are still covered in keyword+member mode via post-filtering.
        """
        # EDMs are Commons-only — skip for Lords members
        member_info = await self.lookup_member(member_id)
        is_lord = member_info.get("member_type") == "Peer"

        all_sources = [
            ("hansard", self.fetch_member_hansard),
            ("written_questions", self.fetch_member_written_questions),
            ("written_questions", self.fetch_member_answered_written_questions),
            ("written_statements", self.fetch_member_written_statements),
            ("edms", self.fetch_member_edms),
            ("oral_evidence", self.fetch_member_oral_evidence),
        ]

        if enabled_sources is not None:
            sources = [(key, method) for key, method in all_sources if key in enabled_sources]
        else:
            sources = all_sources

        if is_lord:
            sources = [(key, method) for key, method in sources if key != "edms"]

        async def _fetch_one(key, method):
            if cancel_event and cancel_event.is_set():
                return []
            try:
                logger.info("Fetching member %s from %s", member_id, key)
                found = await method(member_id, member_name, start_date, end_date)
                logger.info("  -> %d results from %s", len(found), key)
                if on_source_complete:
                    await on_source_complete(member_name, key, len(found))
                if on_results_batch and found:
                    await on_results_batch(found)
                return found
            except Exception as e:
                logger.error("Error fetching member %s from %s: %s", member_id, key, e)
                if on_source_complete:
                    await on_source_complete(member_name, key, 0)
                return []

        tasks = [_fetch_one(key, method) for key, method in sources]
        source_results = await asyncio.gather(*tasks)

        results = []
        for found in source_results:
            results.extend(found)
        return results
