"""Async clients for all UK Parliament APIs.

Adapted from v1 api_client.py (sync/requests) to async httpx, with new sources:
EDMs, Bills, Commons Divisions.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from backend.config import (
    HANSARD_API_BASE,
    WRITTEN_QS_API_BASE,
    EDM_API_BASE,
    BILLS_API_BASE,
    DIVISIONS_API_BASE,
    MEMBERS_API_BASE,
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
    source_type: str  # "hansard", "written_question", "written_statement", "edm", "bill", "division"
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
                            source_type="written_question",
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

    # ---- Unified search ----

    SOURCE_NAMES = [
        "Hansard",
        "Written Questions",
        "Written Statements",
        "Early Day Motions",
        "Bills",
        "Divisions",
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
        """Fetch all Hansard contributions by a specific member using memberId param."""
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
                "queryParameters.orderBy": "SittingDateDesc",
            }

            data = await self._get(f"{HANSARD_API_BASE}/search.json", params)
            if not data:
                break

            items = data.get("Contributions", [])
            if not items:
                break

            total = data.get("TotalContributions", 0)

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

            for edm in response:
                edm_id = str(edm.get("Id", ""))
                title = edm.get("Title", "")
                motion_text = edm.get("MotionText", "")
                date_tabled = edm.get("DateTabled", "")
                sponsor = edm.get("PrimarySponsor", {})
                sponsor_name = sponsor.get("Name", "") or member_name
                sponsor_id = str(sponsor.get("MnisId", member_id))
                sponsors_count = edm.get("SponsorsCount", 0)

                try:
                    dt = datetime.fromisoformat(date_tabled.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    dt = datetime.now()

                text = f"{title}\n\n{_strip_html(motion_text)}" if motion_text else title
                url = f"https://edm.parliament.uk/early-day-motion/{edm_id}"

                contributions.append(Contribution(
                    id=f"edm-{edm_id}",
                    member_name=sponsor_name.strip(),
                    member_id=sponsor_id,
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

    async def fetch_member_all(
        self,
        member_id: str,
        member_name: str,
        start_date: str,
        end_date: str,
        enabled_sources: list[str] | None = None,
        cancel_event: asyncio.Event | None = None,
    ) -> list[Contribution]:
        """Fetch all activity for a specific member from applicable sources in parallel.

        Divisions and Bills are omitted — no per-member list endpoints exist.
        They are still covered in keyword+member mode via post-filtering.
        """
        all_sources = [
            ("hansard", self.fetch_member_hansard),
            ("written_questions", self.fetch_member_written_questions),
            ("written_statements", self.fetch_member_written_statements),
            ("edms", self.fetch_member_edms),
        ]

        if enabled_sources is not None:
            sources = [(key, method) for key, method in all_sources if key in enabled_sources]
        else:
            sources = all_sources

        async def _fetch_one(key, method):
            if cancel_event and cancel_event.is_set():
                return []
            try:
                logger.info("Fetching member %s from %s", member_id, key)
                found = await method(member_id, member_name, start_date, end_date)
                logger.info("  -> %d results from %s", len(found), key)
                return found
            except Exception as e:
                logger.error("Error fetching member %s from %s: %s", member_id, key, e)
                return []

        tasks = [_fetch_one(key, method) for key, method in sources]
        source_results = await asyncio.gather(*tasks)

        results = []
        for found in source_results:
            results.extend(found)
        return results
