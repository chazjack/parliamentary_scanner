"""Scan orchestrator: ties together API search, pre-filter, classification,
deduplication, member enrichment, and DB storage.

Progress is written to the scans table so the SSE endpoint can stream it.
"""

import asyncio
import json
import logging

from backend.database import (
    get_db,
    get_all_topics,
    update_scan_progress,
    get_scan,
    insert_result,
    insert_audit_log_batch,
)
from backend.config import KEYWORD_PARALLELISM
from backend.services.parliament import ParliamentAPIClient, Contribution
from backend.services.classifier import TopicClassifier, is_procedural

logger = logging.getLogger(__name__)


def _dedup_contributions(contributions: list[Contribution]) -> list[Contribution]:
    """Deduplicate by (source_type, id). Merge matched_keywords for duplicates."""
    seen: dict[str, Contribution] = {}
    for c in contributions:
        key = f"{c.source_type}:{c.id}"
        if key in seen:
            existing = seen[key]
            for kw in c.matched_keywords:
                if kw not in existing.matched_keywords:
                    existing.matched_keywords.append(kw)
        else:
            seen[key] = c
    return list(seen.values())


def _forum_label(contribution: Contribution) -> str:
    """Generate human-readable forum label from source type and context."""
    labels = {
        "hansard": f"Debate: {contribution.context}" if contribution.context else "Parliamentary debate",
        "written_question": f"Written Question: {contribution.context}" if contribution.context else "Written Question",
        "written_statement": f"Written Statement: {contribution.context}" if contribution.context else "Written Statement",
        "edm": contribution.context or "Early Day Motion",
        "bill": contribution.context or "Bill",
        "division": contribution.context or "Division vote",
    }
    return labels.get(contribution.source_type, contribution.source_type)


async def run_scan(scan_id: int, cancel_event: asyncio.Event):
    """Execute a full scan pipeline. Updates progress in DB throughout."""
    db = await get_db()
    try:
        await _run_scan_inner(scan_id, cancel_event, db)
    except Exception as e:
        logger.exception("Scan %d failed: %s", scan_id, e)
        await update_scan_progress(
            db, scan_id, status="error", error_message=str(e)
        )
    finally:
        await db.close()


async def _run_scan_inner(scan_id: int, cancel_event: asyncio.Event, db):
    """Inner scan logic with detailed stats tracking and audit logging."""
    await update_scan_progress(db, scan_id, status="running", progress=0)

    # Detailed stats dict — encoded as JSON in current_phase for SSE
    stats = {
        "phase": "Preparing...",
        "per_source": {},
        "per_source_relevant": {},
        "total_api_results": 0,
        "unique_after_dedup": 0,
        "removed_by_prefilter": 0,
        "sent_to_classifier": 0,
        "classified_relevant": 0,
        "classified_discarded": 0,
        "kw_status": {},           # {keyword: "active"|"done"} — absent = pending
        "kw_counts": {},           # {keyword: api_result_count}
        "total_keywords": 0,
        "completed_keywords": 0,
        "search_done": False,
    }

    async def _update_with_stats(progress, **kwargs):
        kwargs["current_phase"] = json.dumps(stats)
        await update_scan_progress(db, scan_id, progress=progress, **kwargs)

    # Load scan config
    scan = await get_scan(db, scan_id)
    start_date = scan["start_date"]
    end_date = scan["end_date"]
    topic_ids = json.loads(scan["topic_ids"])
    enabled_sources = json.loads(scan["sources"]) if scan.get("sources") else None

    # Load topics and their keywords
    all_topics = await get_all_topics(db)
    selected_topics = {
        t["name"]: t["keywords"]
        for t in all_topics
        if t["id"] in topic_ids
    }
    # All topics dict for cross-topic classification
    all_topics_dict = {t["name"]: t["keywords"] for t in all_topics}

    if not selected_topics:
        await update_scan_progress(
            db, scan_id, status="error", error_message="No topics selected"
        )
        return

    # Build keyword list from selected topics only (for API search)
    all_keywords = set()
    for kws in selected_topics.values():
        all_keywords.update(kws)

    total_keywords = len(all_keywords)
    stats["total_keywords"] = total_keywords
    logger.info(
        "Scan %d: %d topics, %d keywords, date range %s to %s",
        scan_id, len(selected_topics), total_keywords, start_date, end_date,
    )

    # ---- PIPELINED SEARCH + CLASSIFICATION ----
    # Search and classification run concurrently: as each keyword's results
    # arrive they are incrementally deduped, pre-filtered, and fed to the
    # classifier via an asyncio.Queue — no waiting for all keywords to finish.

    stats["phase"] = "Searching Parliament APIs..."
    client = ParliamentAPIClient()
    keyword_list = sorted(all_keywords)

    # Shared state (protected by progress_lock)
    keyword_sem = asyncio.Semaphore(KEYWORD_PARALLELISM)
    progress_lock = asyncio.Lock()
    completed_keywords = 0
    total_api_results = 0
    seen: dict[str, Contribution] = {}       # incremental dedup registry
    procedural_items: list[Contribution] = []
    queued_for_classify = 0                   # how many sent to classifier

    # Pipeline queue: search → classification
    classify_queue: asyncio.Queue[Contribution | None] = asyncio.Queue()

    # Classifier setup (sees ALL topics for cross-topic detection)
    classifier = TopicClassifier(all_topics_dict)
    classify_sem = asyncio.Semaphore(10)
    total_relevant = 0
    not_relevant_audit: list[tuple] = []
    classified_count = 0
    search_done = False

    # ---- Producer: keyword search with incremental dedup + pre-filter ----

    async def _search_keyword(kw: str):
        nonlocal completed_keywords, total_api_results, queued_for_classify
        async with keyword_sem:
            if cancel_event.is_set():
                return

            # Mark keyword as actively being searched
            async with progress_lock:
                stats["kw_status"][kw] = "active"

            async def on_source_start(source_name, source_idx, total_src):
                async with progress_lock:
                    progress = (completed_keywords / total_keywords) * 60
                    classify_part = ""
                    if classified_count > 0:
                        classify_part = f" | Classifying {classified_count}/{queued_for_classify}"
                    stats["phase"] = (
                        f'Searching "{kw}" ({completed_keywords + 1}/{total_keywords} done)'
                        + classify_part
                    )
                    await _update_with_stats(progress)

            results = await client.search_all(
                kw, start_date, end_date, cancel_event, on_source_start,
                enabled_sources=enabled_sources,
            )

            # Incremental dedup + pre-filter under lock, then enqueue
            async with progress_lock:
                completed_keywords += 1
                total_api_results += len(results)
                stats["total_api_results"] = total_api_results

                # Mark keyword as done with result count
                stats["kw_status"][kw] = "done"
                stats["kw_counts"][kw] = len(results)
                stats["completed_keywords"] = completed_keywords

                for c in results:
                    src = c.source_type
                    stats["per_source"][src] = stats["per_source"].get(src, 0) + 1

                    key = f"{c.source_type}:{c.id}"
                    if key in seen:
                        # Merge keywords onto existing entry (already queued)
                        existing = seen[key]
                        for mk in c.matched_keywords:
                            if mk not in existing.matched_keywords:
                                existing.matched_keywords.append(mk)
                    else:
                        seen[key] = c
                        if is_procedural(c.text, c.source_type):
                            procedural_items.append(c)
                            stats["removed_by_prefilter"] = len(procedural_items)
                        else:
                            queued_for_classify += 1
                            stats["sent_to_classifier"] = queued_for_classify
                            await classify_queue.put(c)

                # Update dedup count incrementally and force progress write
                stats["unique_after_dedup"] = len(seen)
                progress = (completed_keywords / total_keywords) * 60
                await _update_with_stats(min(progress, 59))

    async def _run_all_searches():
        nonlocal search_done
        tasks = [_search_keyword(kw) for kw in keyword_list]
        await asyncio.gather(*tasks)
        search_done = True
        stats["search_done"] = True
        await classify_queue.put(None)  # sentinel: no more items

    # ---- Consumer: concurrent classification from queue ----

    async def _classify_one(contribution: Contribution):
        nonlocal classified_count, total_relevant
        async with classify_sem:
            if cancel_event.is_set():
                return
            classification = await classifier.classify(contribution)

            if classification:
                # Enrich with member info and store immediately
                member_info = {"name": "", "party": "", "member_type": "", "constituency": ""}
                if contribution.member_id:
                    member_info = await client.lookup_member(contribution.member_id)

                dedup_key = f"{contribution.source_type}:{contribution.id}"
                topics_json = json.dumps(classification["topics"])

                await insert_result(
                    db,
                    scan_id,
                    dedup_key=dedup_key,
                    member_name=contribution.member_name,
                    member_id=contribution.member_id,
                    party=member_info.get("party", ""),
                    member_type=member_info.get("member_type", ""),
                    constituency=member_info.get("constituency", ""),
                    topics=topics_json,
                    summary=classification["summary"],
                    activity_date=contribution.date.strftime("%Y-%m-%d"),
                    forum=_forum_label(contribution),
                    verbatim_quote=classification.get("verbatim_quote", ""),
                    source_url=contribution.url,
                    confidence=classification["confidence"],
                    position_signal=classification.get("position_signal", ""),
                    source_type=contribution.source_type,
                    raw_text=contribution.text[:2000],
                )

            async with progress_lock:
                classified_count += 1

                if classification:
                    total_relevant += 1
                    stats["classified_relevant"] = total_relevant
                    src = contribution.source_type
                    stats["per_source_relevant"][src] = (
                        stats["per_source_relevant"].get(src, 0) + 1
                    )
                else:
                    stats["classified_discarded"] += 1
                    not_relevant_audit.append((
                        scan_id, contribution.member_name, contribution.source_type,
                        contribution.text[:200], "not_relevant",
                        contribution.date.strftime("%Y-%m-%d") if contribution.date else "",
                        contribution.context or "", contribution.text[:2000],
                    ))

                # Update progress periodically
                if classified_count % 2 == 0 or classified_count <= 5:
                    if search_done:
                        progress = 60 + (classified_count / max(queued_for_classify, 1)) * 35
                        stats["phase"] = f"Classifying {classified_count}/{queued_for_classify}..."
                    else:
                        search_pct = (completed_keywords / total_keywords) * 60
                        progress = search_pct
                        stats["phase"] = (
                            f"Searching ({completed_keywords}/{total_keywords} done)"
                            f" | Classifying {classified_count}/{queued_for_classify}..."
                        )
                    await _update_with_stats(
                        min(progress, 95),
                        total_relevant=total_relevant,
                    )

    async def _classification_consumer():
        pending: set[asyncio.Task] = set()
        while True:
            if cancel_event.is_set():
                break
            item = await classify_queue.get()
            if item is None:
                break
            task = asyncio.create_task(_classify_one(item))
            pending.add(task)
            task.add_done_callback(pending.discard)
        # Wait for all in-flight classifications to finish
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    # ---- Run search + classification concurrently ----
    search_task = asyncio.create_task(_run_all_searches())
    classify_task = asyncio.create_task(_classification_consumer())

    try:
        await search_task
        await classify_task
    finally:
        await client.close()

    # Log summary stats
    stats["unique_after_dedup"] = len(seen)
    logger.info("Scan %d: %d API results -> %d unique", scan_id, total_api_results, len(seen))
    logger.info("Scan %d: %d after pre-filter (removed %d procedural)",
                scan_id, queued_for_classify, len(procedural_items))

    # Batch insert procedural audit entries
    if procedural_items:
        audit_rows = [
            (scan_id, c.member_name, c.source_type, c.text[:200],
             "procedural_filter", c.date.strftime("%Y-%m-%d") if c.date else "",
             c.context or "", c.text[:2000])
            for c in procedural_items
        ]
        await insert_audit_log_batch(db, audit_rows)

    # Batch insert not-relevant audit entries
    if not_relevant_audit:
        await insert_audit_log_batch(db, not_relevant_audit)

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    logger.info("Scan %d: %d/%d classified as relevant",
                scan_id, total_relevant, queued_for_classify)

    # Mark complete (results already stored inline during classification)
    stats["phase"] = "Scan complete"
    await update_scan_progress(
        db, scan_id,
        status="completed",
        progress=100,
        current_phase=json.dumps(stats),
        total_relevant=total_relevant,
    )
    logger.info("Scan %d completed: %d relevant results stored", scan_id, total_relevant)
