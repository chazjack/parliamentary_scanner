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
from backend.config import KEYWORD_PARALLELISM, CLASSIFIER_CONCURRENCY, CLASSIFIER_STAGGER
from backend.services.parliament import ParliamentAPIClient, Contribution
from backend.services.classifier import TopicClassifier, ClassifierAPIError, is_procedural

logger = logging.getLogger(__name__)

# ---- Concurrent scan limit ----
_active_scans: int = 0
MAX_CONCURRENT_SCANS: int = 2
_on_scan_complete_cb = None


def get_active_scan_count() -> int:
    return _active_scans


def register_scan_complete_callback(fn) -> None:
    global _on_scan_complete_cb
    _on_scan_complete_cb = fn


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
    global _active_scans
    _active_scans += 1
    db = await get_db()
    try:
        await _run_scan_inner(scan_id, cancel_event, db)
    except Exception as e:
        logger.exception("Scan %d failed: %s", scan_id, e)
        await update_scan_progress(
            db, scan_id, status="error", error_message=str(e)
        )
    finally:
        _active_scans -= 1
        await db.close()
        if _on_scan_complete_cb:
            asyncio.create_task(_on_scan_complete_cb())


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
        "discard_category_counts": {},
        "classifier_api_errors": 0,
        "api_paused": False,
        "api_error_reason": "",
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
    # Parse member IDs/names — stored as JSON arrays (or legacy plain string)
    def _parse_member_field(raw):
        if not raw:
            return []
        try:
            val = json.loads(raw)
            if isinstance(val, list):
                return [str(v) for v in val if v]
            return [str(val)] if val else []
        except Exception:
            return [str(raw)] if raw else []

    target_member_ids = _parse_member_field(scan.get("target_member_id"))
    target_member_names = _parse_member_field(scan.get("target_member_name"))

    # Load topics and their keywords
    all_topics = await get_all_topics(db)
    selected_topics = {
        t["name"]: t["keywords"]
        for t in all_topics
        if t["id"] in topic_ids
    }

    # Three-way branch based on topics + member selection
    if not selected_topics and not target_member_ids:
        await update_scan_progress(
            db, scan_id, status="error", error_message="No topics or member selected"
        )
        return

    if not selected_topics and target_member_ids:
        # Case 2: Member only — fetch all activity, store raw (no LLM)
        await _run_member_only_scan(
            scan_id, cancel_event, db,
            start_date, end_date, target_member_ids, target_member_names,
            enabled_sources, stats, _update_with_stats,
        )
        return

    if selected_topics and target_member_ids:
        # Case 3: Member + topics — fetch member activity directly, then classify
        # (more reliable than broad keyword search + member_id post-filter)
        await _run_member_topic_scan(
            scan_id, cancel_event, db,
            start_date, end_date, target_member_ids, target_member_names,
            enabled_sources, selected_topics, stats, _update_with_stats,
        )
        return

    # Case 1: Topics only — keyword search + classification

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

    # Classifier setup (sees only selected topics)
    classifier = TopicClassifier(selected_topics)
    classify_sem = asyncio.Semaphore(CLASSIFIER_CONCURRENCY)
    total_relevant = 0
    classified_count = 0
    search_done = False
    api_failed: list[Contribution] = []  # items to retry after pipeline

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

            # Post-filter to target members if specified
            if target_member_ids:
                results = [c for c in results if c.member_id in target_member_ids]

            # Incremental dedup + pre-filter under lock, then enqueue
            new_procedural: list[Contribution] = []
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
                            new_procedural.append(c)
                            stats["removed_by_prefilter"] = len(procedural_items)
                        else:
                            queued_for_classify += 1
                            stats["sent_to_classifier"] = queued_for_classify
                            await classify_queue.put(c)

                # Update dedup count incrementally and force progress write
                stats["unique_after_dedup"] = len(seen)
                progress = (completed_keywords / total_keywords) * 60
                await _update_with_stats(min(progress, 59))

            # Insert procedural audit entries immediately (outside lock)
            if new_procedural:
                audit_rows = [
                    (scan_id, c.member_name, c.source_type, c.text[:200],
                     "procedural_filter", c.date.strftime("%Y-%m-%d") if c.date else "",
                     c.context or "", c.text[:2000], json.dumps(c.matched_keywords), c.url, None, None)
                    for c in new_procedural
                ]
                await insert_audit_log_batch(db, audit_rows)

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
            # If API is known to be down, skip the call and queue for retry
            if stats["api_paused"]:
                async with progress_lock:
                    api_failed.append(contribution)
                    stats["classifier_api_errors"] = len(api_failed)
                return
            if CLASSIFIER_STAGGER > 0:
                await asyncio.sleep(CLASSIFIER_STAGGER)
            try:
                classification, discard_reason, discard_category = await classifier.classify(contribution)
            except ClassifierAPIError as e:
                async with progress_lock:
                    api_failed.append(contribution)
                    stats["classifier_api_errors"] = classifier.api_errors
                    err_str = str(e).lower()
                    if "rate" in err_str:
                        stats["api_error_reason"] = "Rate limit reached"
                    elif "timeout" in err_str:
                        stats["api_error_reason"] = "API timeout"
                    elif "auth" in err_str or "key" in err_str:
                        stats["api_error_reason"] = "Authentication error — check API key"
                    else:
                        stats["api_error_reason"] = "API unavailable"
                    stats["api_paused"] = True
                    prog = (
                        60 + (classified_count / max(queued_for_classify, 1)) * 35
                        if search_done
                        else (completed_keywords / total_keywords) * 60
                    )
                    stats["phase"] = "Classification paused whilst API reconnects..."
                    await _update_with_stats(min(prog, 95), total_relevant=total_relevant)
                return

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

            audit_row = None
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
                    cat_key = discard_category or "generic"
                    stats["discard_category_counts"][cat_key] = (
                        stats["discard_category_counts"].get(cat_key, 0) + 1
                    )
                    stats["classifier_api_errors"] = classifier.api_errors
                    audit_row = (
                        scan_id, contribution.member_name, contribution.source_type,
                        contribution.text[:200], "not_relevant",
                        contribution.date.strftime("%Y-%m-%d") if contribution.date else "",
                        contribution.context or "", contribution.text[:2000],
                        json.dumps(contribution.matched_keywords),
                        contribution.url,
                        discard_reason,
                        discard_category,
                    )

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

            # Insert not-relevant audit entry immediately (outside lock)
            if audit_row:
                await insert_audit_log_batch(db, [audit_row])

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

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    # ---- Retry any items that failed due to API errors ----
    if api_failed:
        retry_wait = 30
        max_retry_rounds = 4
        logger.warning(
            "Scan %d: %d items failed due to API errors — retrying (up to %d rounds)",
            scan_id, len(api_failed), max_retry_rounds,
        )
        # The original client is already closed — open a fresh one for member lookups during retry
        retry_client = ParliamentAPIClient()
        try:
          for retry_round in range(max_retry_rounds):
            if cancel_event.is_set():
                break
            stats["api_paused"] = True
            stats["phase"] = (
                f"Classification paused whilst API reconnects "
                f"(retrying {len(api_failed)} items, round {retry_round + 1}/{max_retry_rounds})..."
            )
            await _update_with_stats(97, total_relevant=total_relevant)
            await asyncio.sleep(retry_wait)
            retry_wait = min(retry_wait * 2, 300)

            still_failed = []
            for c in api_failed:
                if cancel_event.is_set():
                    still_failed.extend(api_failed)
                    break
                try:
                    classification, discard_reason, discard_category = await classifier.classify(c)
                    if classification:
                        member_info = {"name": "", "party": "", "member_type": "", "constituency": ""}
                        if c.member_id:
                            member_info = await retry_client.lookup_member(c.member_id)
                        await insert_result(
                            db, scan_id,
                            dedup_key=f"{c.source_type}:{c.id}",
                            member_name=c.member_name,
                            member_id=c.member_id,
                            party=member_info.get("party", ""),
                            member_type=member_info.get("member_type", ""),
                            constituency=member_info.get("constituency", ""),
                            topics=json.dumps(classification["topics"]),
                            summary=classification["summary"],
                            activity_date=c.date.strftime("%Y-%m-%d"),
                            forum=_forum_label(c),
                            verbatim_quote=classification.get("verbatim_quote", ""),
                            source_url=c.url,
                            confidence=classification["confidence"],
                            position_signal=classification.get("position_signal", ""),
                            source_type=c.source_type,
                            raw_text=c.text[:2000],
                        )
                        total_relevant += 1
                    else:
                        await insert_audit_log_batch(db, [(
                            scan_id, c.member_name, c.source_type, c.text[:200], "not_relevant",
                            c.date.strftime("%Y-%m-%d") if c.date else "",
                            c.context or "", c.text[:2000],
                            json.dumps(c.matched_keywords), c.url, discard_reason, discard_category,
                        )])
                except ClassifierAPIError:
                    still_failed.append(c)

            logger.info(
                "Scan %d retry round %d: %d succeeded, %d still failing",
                scan_id, retry_round + 1,
                len(api_failed) - len(still_failed), len(still_failed),
            )
            api_failed = still_failed
            if not api_failed:
                stats["api_paused"] = False
                break
        finally:
            await retry_client.close()

        # Write any permanently failed items to audit
        if api_failed:
            logger.error(
                "Scan %d: %d items permanently failed after all retries",
                scan_id, len(api_failed),
            )
            await insert_audit_log_batch(db, [
                (scan_id, c.member_name, c.source_type, c.text[:200], "not_relevant",
                 c.date.strftime("%Y-%m-%d") if c.date else "",
                 c.context or "", c.text[:2000],
                 json.dumps(c.matched_keywords), c.url,
                 "Rate limited — classification failed after all retries", None)
                for c in api_failed
            ])

    logger.info("Scan %d: %d/%d classified as relevant",
                scan_id, total_relevant, queued_for_classify)
    if classifier.api_errors:
        logger.warning("Scan %d: %d classifier API errors (some may have been recovered via retry)",
                     scan_id, classifier.api_errors)

    # Mark complete (results already stored inline during classification)
    stats["phase"] = "Scan complete"
    stats["api_paused"] = False
    stats["classifier_api_errors"] = classifier.api_errors
    await update_scan_progress(
        db, scan_id,
        status="completed",
        progress=100,
        current_phase=json.dumps(stats),
        total_relevant=total_relevant,
    )
    logger.info("Scan %d completed: %d relevant results stored", scan_id, total_relevant)


async def _run_member_topic_scan(
    scan_id: int,
    cancel_event: asyncio.Event,
    db,
    start_date: str,
    end_date: str,
    target_member_ids: list[str],
    target_member_names: list[str],
    enabled_sources: list[str] | None,
    selected_topics: dict,
    stats: dict,
    _update_with_stats,
):
    """Fetch member activity via dedicated endpoints, then classify against topics."""
    display_names = ", ".join(target_member_names) if target_member_names else ", ".join(target_member_ids)
    stats["phase"] = f"Fetching activity for {display_names}..."
    await _update_with_stats(10)

    client = ParliamentAPIClient()
    try:
        member_tasks = [
            client.fetch_member_all(
                mid,
                target_member_names[i] if i < len(target_member_names) else "",
                start_date, end_date,
                enabled_sources=enabled_sources,
                cancel_event=cancel_event,
            )
            for i, mid in enumerate(target_member_ids)
        ]
        all_results = await asyncio.gather(*member_tasks)
        raw = [c for group in all_results for c in group]
        # Hard filter: keep only contributions whose member_id is in the requested set
        member_id_set = set(target_member_ids)
        raw = [c for c in raw if c.member_id in member_id_set]
        contributions = _dedup_contributions(raw)
    finally:
        await client.close()

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    total_api = len(contributions)
    stats["total_api_results"] = total_api
    stats["unique_after_dedup"] = total_api
    await update_scan_progress(db, scan_id, total_api_results=total_api)

    # Pre-filter procedurals
    to_classify = []
    procedural_items = []
    for c in contributions:
        if is_procedural(c.text, c.source_type):
            procedural_items.append(c)
        else:
            to_classify.append(c)

    stats["removed_by_prefilter"] = len(procedural_items)
    stats["sent_to_classifier"] = len(to_classify)
    await _update_with_stats(25)

    if procedural_items:
        audit_rows = [
            (scan_id, c.member_name, c.source_type, c.text[:200],
             "procedural_filter", c.date.strftime("%Y-%m-%d") if c.date else "",
             c.context or "", c.text[:2000], json.dumps(c.matched_keywords), c.url, None, None)
            for c in procedural_items
        ]
        await insert_audit_log_batch(db, audit_rows)

    # Enrich member info
    client2 = ParliamentAPIClient()
    try:
        member_infos = await asyncio.gather(*[client2.lookup_member(mid) for mid in target_member_ids])
    finally:
        await client2.close()
    member_info_map = {mid: info for mid, info in zip(target_member_ids, member_infos)}

    # Classify against selected topics
    classifier = TopicClassifier(selected_topics)
    total_relevant = 0
    classified_count = 0
    api_failed: list[Contribution] = []

    for c in to_classify:
        if cancel_event.is_set():
            break

        # If API is known to be down, queue item for retry without attempting API call
        if stats["api_paused"]:
            api_failed.append(c)
            stats["classifier_api_errors"] = len(api_failed)
            continue

        try:
            classification, discard_reason, discard_category = await classifier.classify(c)
        except ClassifierAPIError as e:
            api_failed.append(c)
            err_str = str(e).lower()
            if "rate" in err_str:
                stats["api_error_reason"] = "Rate limit reached"
            elif "timeout" in err_str:
                stats["api_error_reason"] = "API timeout"
            elif "auth" in err_str or "key" in err_str:
                stats["api_error_reason"] = "Authentication error — check API key"
            else:
                stats["api_error_reason"] = "API unavailable"
            stats["api_paused"] = True
            stats["classifier_api_errors"] = len(api_failed)
            progress = 25 + (classified_count / max(len(to_classify), 1)) * 70
            stats["phase"] = "Classification paused whilst API reconnects..."
            await _update_with_stats(min(progress, 95), total_relevant=total_relevant)
            continue

        classified_count += 1

        if classification:
            info = member_info_map.get(c.member_id) or member_info_map.get(target_member_ids[0], {})
            await insert_result(
                db, scan_id,
                dedup_key=f"{c.source_type}:{c.id}",
                member_name=c.member_name or info.get("name", ""),
                member_id=c.member_id,
                party=info.get("party", ""),
                member_type=info.get("member_type", ""),
                constituency=info.get("constituency", ""),
                topics=json.dumps(classification["topics"]),
                summary=classification["summary"],
                activity_date=c.date.strftime("%Y-%m-%d"),
                forum=_forum_label(c),
                verbatim_quote=classification.get("verbatim_quote", ""),
                source_url=c.url,
                confidence=classification["confidence"],
                position_signal=classification.get("position_signal", ""),
                source_type=c.source_type,
                raw_text=c.text[:2000],
            )
            total_relevant += 1
        else:
            await insert_audit_log_batch(db, [(
                scan_id, c.member_name, c.source_type, c.text[:200], "not_relevant",
                c.date.strftime("%Y-%m-%d") if c.date else "",
                c.context or "", c.text[:2000], json.dumps(c.matched_keywords), c.url,
                discard_reason, discard_category,
            )])

        if not classification:
            cat_key = discard_category or "generic"
            stats["discard_category_counts"][cat_key] = (
                stats["discard_category_counts"].get(cat_key, 0) + 1
            )
        stats["classified_relevant"] = total_relevant
        stats["classified_discarded"] = classified_count - total_relevant
        progress = 25 + (classified_count / max(len(to_classify), 1)) * 70
        stats["phase"] = f"Classifying {classified_count}/{len(to_classify)}..."
        await _update_with_stats(min(progress, 95), total_relevant=total_relevant)

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    # Retry items that failed due to API errors
    if api_failed:
        retry_wait = 30
        max_retry_rounds = 4
        logger.warning(
            "Scan %d: %d items failed due to API errors — retrying (up to %d rounds)",
            scan_id, len(api_failed), max_retry_rounds,
        )
        for retry_round in range(max_retry_rounds):
            if cancel_event.is_set():
                break
            stats["api_paused"] = True
            stats["phase"] = (
                f"Classification paused whilst API reconnects "
                f"(retrying {len(api_failed)} items, round {retry_round + 1}/{max_retry_rounds})..."
            )
            await _update_with_stats(97, total_relevant=total_relevant)
            await asyncio.sleep(retry_wait)
            retry_wait = min(retry_wait * 2, 300)

            still_failed = []
            for c in api_failed:
                if cancel_event.is_set():
                    still_failed.extend(api_failed)
                    break
                try:
                    classification, discard_reason, discard_category = await classifier.classify(c)
                    if classification:
                        info = member_info_map.get(c.member_id) or member_info_map.get(target_member_ids[0], {})
                        await insert_result(
                            db, scan_id,
                            dedup_key=f"{c.source_type}:{c.id}",
                            member_name=c.member_name or info.get("name", ""),
                            member_id=c.member_id,
                            party=info.get("party", ""),
                            member_type=info.get("member_type", ""),
                            constituency=info.get("constituency", ""),
                            topics=json.dumps(classification["topics"]),
                            summary=classification["summary"],
                            activity_date=c.date.strftime("%Y-%m-%d"),
                            forum=_forum_label(c),
                            verbatim_quote=classification.get("verbatim_quote", ""),
                            source_url=c.url,
                            confidence=classification["confidence"],
                            position_signal=classification.get("position_signal", ""),
                            source_type=c.source_type,
                            raw_text=c.text[:2000],
                        )
                        total_relevant += 1
                    else:
                        await insert_audit_log_batch(db, [(
                            scan_id, c.member_name, c.source_type, c.text[:200], "not_relevant",
                            c.date.strftime("%Y-%m-%d") if c.date else "",
                            c.context or "", c.text[:2000],
                            json.dumps(c.matched_keywords), c.url, discard_reason, discard_category,
                        )])
                except ClassifierAPIError:
                    still_failed.append(c)

            logger.info(
                "Scan %d retry round %d: %d succeeded, %d still failing",
                scan_id, retry_round + 1,
                len(api_failed) - len(still_failed), len(still_failed),
            )
            api_failed = still_failed
            if not api_failed:
                stats["api_paused"] = False
                break

        if api_failed:
            await insert_audit_log_batch(db, [
                (scan_id, c.member_name, c.source_type, c.text[:200], "not_relevant",
                 c.date.strftime("%Y-%m-%d") if c.date else "",
                 c.context or "", c.text[:2000],
                 json.dumps(c.matched_keywords), c.url,
                 "Rate limited — classification failed after all retries", None)
                for c in api_failed
            ])

    stats["phase"] = "Scan complete"
    stats["api_paused"] = False
    stats["classifier_api_errors"] = classifier.api_errors
    await update_scan_progress(
        db, scan_id,
        status="completed",
        progress=100,
        current_phase=json.dumps(stats),
        total_relevant=total_relevant,
    )
    logger.info("Scan %d (member+topic) completed: %d/%d relevant", scan_id, total_relevant, classified_count)


async def _run_member_only_scan(
    scan_id: int,
    cancel_event: asyncio.Event,
    db,
    start_date: str,
    end_date: str,
    target_member_ids: list[str],
    target_member_names: list[str],
    enabled_sources: list[str] | None,
    stats: dict,
    _update_with_stats,
):
    """Fetch all activity for one or more members without LLM classification."""
    display_names = ", ".join(target_member_names) if target_member_names else ", ".join(target_member_ids)
    stats["phase"] = f"Fetching activity for {display_names}..."
    await _update_with_stats(10)

    # Fetch all members in parallel
    client = ParliamentAPIClient()
    try:
        member_tasks = [
            client.fetch_member_all(
                mid,
                target_member_names[i] if i < len(target_member_names) else "",
                start_date, end_date,
                enabled_sources=enabled_sources,
                cancel_event=cancel_event,
            )
            for i, mid in enumerate(target_member_ids)
        ]
        all_results = await asyncio.gather(*member_tasks)
    finally:
        await client.close()

    if cancel_event.is_set():
        await update_scan_progress(db, scan_id, status="cancelled")
        return

    member_id_set = set(target_member_ids)
    contributions = [c for group in all_results for c in group if c.member_id in member_id_set]
    total_api = len(contributions)
    stats["total_api_results"] = total_api
    await update_scan_progress(db, scan_id, total_api_results=total_api)

    # Enrich member info for each member (in parallel)
    client2 = ParliamentAPIClient()
    try:
        member_infos = await asyncio.gather(*[
            client2.lookup_member(mid) for mid in target_member_ids
        ])
    finally:
        await client2.close()
    member_info_map = {mid: info for mid, info in zip(target_member_ids, member_infos)}

    total_to_store = len(contributions)
    stats["phase"] = f"Summarising {total_to_store} items..."
    await _update_with_stats(60)

    # Use classifier to generate summaries (summarise-only mode — no topic filtering)
    classifier = TopicClassifier({})
    stored = 0
    for c in contributions:
        if cancel_event.is_set():
            break
        dedup_key = f"{c.source_type}:{c.id}"
        summary = await classifier.summarise(c)
        info = member_info_map.get(c.member_id) or member_info_map.get(target_member_ids[0], {})
        await insert_result(
            db,
            scan_id,
            dedup_key=dedup_key,
            member_name=c.member_name or info.get("name", ""),
            member_id=c.member_id,
            party=info.get("party", ""),
            member_type=info.get("member_type", ""),
            constituency=info.get("constituency", ""),
            topics=json.dumps([]),
            summary=summary,
            activity_date=c.date.strftime("%Y-%m-%d"),
            forum=_forum_label(c),
            verbatim_quote=c.text[:500],
            source_url=c.url,
            confidence="raw",
            position_signal="",
            source_type=c.source_type,
            raw_text=c.text[:2000],
        )
        stored += 1
        if stored % 5 == 0 or stored == total_to_store:
            progress = 60 + (stored / max(total_to_store, 1)) * 35
            stats["phase"] = f"Summarising {stored}/{total_to_store}..."
            await _update_with_stats(min(progress, 95))

    stats["phase"] = "Scan complete"
    await update_scan_progress(
        db, scan_id,
        status="completed",
        progress=100,
        current_phase=json.dumps(stats),
        total_relevant=stored,
    )
    logger.info("Scan %d (member-only) completed: %d items stored", scan_id, stored)
