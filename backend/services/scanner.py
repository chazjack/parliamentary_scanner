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
    logger.info(
        "Scan %d: %d topics, %d keywords, date range %s to %s",
        scan_id, len(selected_topics), total_keywords, start_date, end_date,
    )

    # ---- PHASE 1: API Search (0-60% progress) ----
    stats["phase"] = "Searching Parliament APIs..."
    client = ParliamentAPIClient()
    all_contributions: list[Contribution] = []
    keyword_list = sorted(all_keywords)

    try:
        for i, keyword in enumerate(keyword_list):
            if cancel_event.is_set():
                await update_scan_progress(db, scan_id, status="cancelled")
                return

            base_progress = (i / total_keywords) * 60

            async def on_source_start(source_name, source_idx, total_src):
                sub_progress = base_progress + (source_idx / total_src) * (60 / total_keywords)
                stats["phase"] = f'Searching {source_name}: "{keyword}" ({i+1}/{total_keywords})'
                await _update_with_stats(sub_progress)

            results = await client.search_all(
                keyword, start_date, end_date, cancel_event, on_source_start,
                enabled_sources=enabled_sources,
            )

            # Track per-source counts
            for c in results:
                src = c.source_type
                stats["per_source"][src] = stats["per_source"].get(src, 0) + 1

            all_contributions.extend(results)
            stats["total_api_results"] = len(all_contributions)

    finally:
        await client.close()

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    total_api_results = len(all_contributions)
    stats["phase"] = "Deduplicating results..."
    await _update_with_stats(60, total_api_results=total_api_results)

    # ---- Deduplicate ----
    unique = _dedup_contributions(all_contributions)
    stats["unique_after_dedup"] = len(unique)
    logger.info("Scan %d: %d API results -> %d unique", scan_id, total_api_results, len(unique))

    # ---- PHASE 2: Pre-filter (60-65% progress) ----
    stats["phase"] = "Pre-filtering procedural content..."
    await _update_with_stats(62)

    filtered = []
    procedural_items = []
    for c in unique:
        if is_procedural(c.text, c.source_type):
            procedural_items.append(c)
        else:
            filtered.append(c)

    stats["removed_by_prefilter"] = len(procedural_items)
    logger.info("Scan %d: %d after pre-filter (removed %d procedural)",
                scan_id, len(filtered), len(procedural_items))

    # Batch insert procedural audit entries
    if procedural_items:
        audit_rows = [
            (scan_id, c.member_name, c.source_type, c.text[:200],
             "procedural_filter", c.date.strftime("%Y-%m-%d") if c.date else "",
             c.context or "", c.text[:2000])
            for c in procedural_items
        ]
        await insert_audit_log_batch(db, audit_rows)

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    # ---- PHASE 3: LLM Classification (65-95% progress) ----
    total_to_classify = len(filtered)
    stats["sent_to_classifier"] = total_to_classify
    stats["phase"] = f"Classifying {total_to_classify} contributions with AI..."
    await _update_with_stats(65, total_sent_to_llm=total_to_classify)

    # Classifier sees ALL topics for cross-topic detection
    classifier = TopicClassifier(all_topics_dict)
    relevant_results: list[tuple[Contribution, dict]] = []
    not_relevant_audit: list[tuple] = []
    completed_count = 0

    sem = asyncio.Semaphore(10)

    async def classify_one(i: int, contribution: Contribution):
        nonlocal completed_count
        async with sem:
            if cancel_event.is_set():
                return None

            result = await classifier.classify(contribution)
            completed_count += 1

            if result:
                stats["classified_relevant"] += 1
                src = contribution.source_type
                stats["per_source_relevant"][src] = stats["per_source_relevant"].get(src, 0) + 1
                return (contribution, result)
            else:
                stats["classified_discarded"] += 1
                not_relevant_audit.append((
                    scan_id, contribution.member_name, contribution.source_type,
                    contribution.text[:200], "not_relevant",
                    contribution.date.strftime("%Y-%m-%d") if contribution.date else "",
                    contribution.context or "", contribution.text[:2000],
                ))

            # Update progress periodically
            if completed_count % 5 == 0:
                progress = 65 + (completed_count / max(total_to_classify, 1)) * 30
                stats["phase"] = f"Classifying {completed_count}/{total_to_classify}..."
                await _update_with_stats(progress)

            return None

    # Process classification in batches for faster cancellation
    all_results = []
    batch_size = 10
    for batch_start in range(0, len(filtered), batch_size):
        if cancel_event.is_set():
            break
        batch = filtered[batch_start:batch_start + batch_size]
        batch_tasks = [classify_one(i, c) for i, c in enumerate(batch, batch_start)]
        batch_results = await asyncio.gather(*batch_tasks)
        all_results.extend(batch_results)

    relevant_results = [r for r in all_results if r is not None]

    # Batch insert not-relevant audit entries
    if not_relevant_audit:
        await insert_audit_log_batch(db, not_relevant_audit)

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    total_relevant = len(relevant_results)
    logger.info("Scan %d: %d/%d classified as relevant",
                scan_id, total_relevant, total_to_classify)

    # ---- PHASE 4: Enrich & Store (95-100% progress) ----
    stats["phase"] = f"Storing {total_relevant} results..."
    await _update_with_stats(95, total_relevant=total_relevant)

    # Re-open API client for member lookups
    client = ParliamentAPIClient()
    try:
        for contribution, classification in relevant_results:
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
    finally:
        await client.close()

    # Mark complete
    stats["phase"] = "Scan complete"
    await update_scan_progress(
        db, scan_id,
        status="completed",
        progress=100,
        current_phase=json.dumps(stats),
        total_relevant=total_relevant,
    )
    logger.info("Scan %d completed: %d relevant results stored", scan_id, total_relevant)
