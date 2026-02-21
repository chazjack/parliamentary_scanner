"""APScheduler-based alert scheduler.

Registers cron jobs for each enabled alert. On startup, loads all enabled
alerts from DB and schedules them. When alerts are created/updated/deleted,
the scheduler is synced.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.database import (
    get_db,
    get_alert,
    get_all_topics,
    get_enabled_alerts,
    get_scan_results,
    create_scan,
    update_alert_run_status,
    insert_alert_run_log,
)
from backend.services.email_service import send_email
from backend.services.email_templates import scan_digest_html, lookahead_digest_html

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(
    job_defaults={"misfire_grace_time": 3600, "coalesce": True}
)

# Lock to prevent concurrent scans (manual vs automated)
_scan_lock = asyncio.Lock()


def get_scan_lock() -> asyncio.Lock:
    """Expose the scan lock for use by the scans router."""
    return _scan_lock


DAY_MAP = {
    "monday": "mon", "tuesday": "tue", "wednesday": "wed",
    "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
}


def _build_trigger(alert: dict) -> CronTrigger:
    """Build a CronTrigger from alert schedule config."""
    hour, minute = alert["send_time"].split(":")
    if alert["cadence"] == "daily":
        return CronTrigger(hour=int(hour), minute=int(minute), timezone=alert.get("timezone", "UTC"))
    else:
        dow = DAY_MAP.get(alert["day_of_week"].lower(), "mon")
        return CronTrigger(
            day_of_week=dow, hour=int(hour), minute=int(minute),
            timezone=alert.get("timezone", "UTC"),
        )


def _job_id(alert_id: int) -> str:
    return f"alert_{alert_id}"


async def execute_alert(alert_id: int):
    """Execute an alert: run scan or fetch lookahead, format HTML, send email."""
    db = await get_db()
    try:
        alert = await get_alert(db, alert_id)
        if not alert:
            logger.error("Alert %d not found", alert_id)
            return

        recipients = alert.get("recipients", [])
        if not recipients:
            logger.warning("Alert %d has no recipients, skipping", alert_id)
            await update_alert_run_status(db, alert_id, "skipped", "No recipients")
            await insert_alert_run_log(db, alert_id, "skipped", error_message="No recipients")
            return

        logger.info("Executing alert %d (%s): %s", alert_id, alert["alert_type"], alert["name"])

        if alert["alert_type"] == "scan":
            await _execute_scan_alert(db, alert)
        else:
            await _execute_lookahead_alert(db, alert)

    except Exception as e:
        logger.exception("Alert %d failed: %s", alert_id, e)
        try:
            await update_alert_run_status(db, alert_id, "error", str(e)[:500])
            await insert_alert_run_log(db, alert_id, "error", error_message=str(e)[:500])
        except Exception:
            pass
    finally:
        await db.close()


async def _execute_scan_alert(db, alert: dict):
    """Run a scan and email the results."""
    alert_id = alert["id"]
    topic_ids = json.loads(alert["topic_ids"]) if isinstance(alert["topic_ids"], str) else alert.get("topic_ids", [])
    sources = json.loads(alert["sources"]) if isinstance(alert["sources"], str) else alert.get("sources", [])
    period_days = alert.get("scan_period_days", 7)

    end_date = datetime.utcnow().strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=period_days)).strftime("%Y-%m-%d")

    # Create scan record tagged as scheduled
    scan_id = await create_scan(db, start_date, end_date, topic_ids, sources or None)
    # Tag the scan as scheduled
    await db.execute(
        'UPDATE scans SET "trigger" = ?, alert_id = ? WHERE id = ?',
        ("scheduled", alert_id, scan_id),
    )
    await db.commit()

    # Run the scan under the lock
    async with _scan_lock:
        from backend.services.scanner import run_scan
        cancel_event = asyncio.Event()
        await run_scan(scan_id, cancel_event)

    # Fetch results
    results = await get_scan_results(db, scan_id)

    # Get topic names
    all_topics = await get_all_topics(db)
    topic_names = [t["name"] for t in all_topics if t["id"] in topic_ids]

    # Build email
    html = scan_digest_html(
        alert_name=alert["name"],
        results=results,
        scan_start=start_date,
        scan_end=end_date,
        topics=topic_names,
    )
    subject = f"{alert['name']}: {len(results)} results ({start_date} to {end_date})"

    # Send with retry
    recipients = alert["recipients"]
    last_error = None
    for attempt in range(3):
        try:
            await send_email(recipients, subject, html)
            last_error = None
            break
        except Exception as e:
            last_error = str(e)
            logger.warning("Email send attempt %d failed for alert %d: %s", attempt + 1, alert_id, e)
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    if last_error:
        await update_alert_run_status(db, alert_id, "error", f"Email send failed: {last_error}")
        await insert_alert_run_log(
            db, alert_id, "error", scan_id=scan_id,
            recipients_count=len(recipients), results_count=len(results),
            error_message=f"Email send failed: {last_error}",
        )
    else:
        await update_alert_run_status(db, alert_id, "success")
        await insert_alert_run_log(
            db, alert_id, "success", scan_id=scan_id,
            recipients_count=len(recipients), results_count=len(results),
        )

    logger.info("Scan alert %d complete: %d results, sent to %d recipients", alert_id, len(results), len(recipients))


async def _execute_lookahead_alert(db, alert: dict):
    """Fetch upcoming events and email a digest."""
    alert_id = alert["id"]
    lookahead_days = alert.get("lookahead_days", 7)
    event_types = json.loads(alert["event_types"]) if alert.get("event_types") else None
    houses = json.loads(alert["houses"]) if alert.get("houses") else None

    start_date = datetime.utcnow().strftime("%Y-%m-%d")
    end_date = (datetime.utcnow() + timedelta(days=lookahead_days)).strftime("%Y-%m-%d")

    # Fetch events via the lookahead service
    from backend.services.lookahead import LookaheadClient
    from backend.database import upsert_lookahead_events, get_lookahead_events, get_all_topics

    client = LookaheadClient()
    try:
        raw_events = await client.fetch_all_events(start_date, end_date)
        await upsert_lookahead_events(db, raw_events)
    finally:
        await client.close()

    # Resolve topic keywords for filtering
    keywords = None
    topic_ids = json.loads(alert["topic_ids"]) if isinstance(alert.get("topic_ids"), str) and alert.get("topic_ids") else []
    if topic_ids:
        all_topics = await get_all_topics(db)
        kw_set = set()
        for t in all_topics:
            if t["id"] in topic_ids:
                kw_set.update(t["keywords"])
        keywords = list(kw_set) if kw_set else None

    events = await get_lookahead_events(
        db, start_date, end_date,
        event_types=event_types,
        houses=houses,
        keywords=keywords,
    )

    # Build email
    html = lookahead_digest_html(
        alert_name=alert["name"],
        events=events,
        start_date=start_date,
        end_date=end_date,
    )
    subject = f"{alert['name']}: {len(events)} upcoming events ({start_date} to {end_date})"

    # Send with retry
    recipients = alert["recipients"]
    last_error = None
    for attempt in range(3):
        try:
            await send_email(recipients, subject, html)
            last_error = None
            break
        except Exception as e:
            last_error = str(e)
            logger.warning("Email send attempt %d failed for alert %d: %s", attempt + 1, alert_id, e)
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    if last_error:
        await update_alert_run_status(db, alert_id, "error", f"Email send failed: {last_error}")
        await insert_alert_run_log(
            db, alert_id, "error",
            recipients_count=len(recipients), results_count=len(events),
            error_message=f"Email send failed: {last_error}",
        )
    else:
        await update_alert_run_status(db, alert_id, "success")
        await insert_alert_run_log(
            db, alert_id, "success",
            recipients_count=len(recipients), results_count=len(events),
        )

    logger.info("Lookahead alert %d complete: %d events, sent to %d recipients", alert_id, len(events), len(recipients))


async def sync_scheduler():
    """Sync APScheduler jobs with the current enabled alerts in DB."""
    db = await get_db()
    try:
        enabled_alerts = await get_enabled_alerts(db)
    finally:
        await db.close()

    enabled_ids = {a["id"] for a in enabled_alerts}

    # Remove jobs for alerts that no longer exist or are disabled
    for job in scheduler.get_jobs():
        if job.id.startswith("alert_"):
            alert_id = int(job.id.split("_")[1])
            if alert_id not in enabled_ids:
                scheduler.remove_job(job.id)
                logger.info("Removed scheduler job for alert %d", alert_id)

    # Add or update jobs for enabled alerts
    for alert in enabled_alerts:
        job_id = _job_id(alert["id"])
        trigger = _build_trigger(alert)

        existing_job = scheduler.get_job(job_id)
        if existing_job:
            existing_job.reschedule(trigger)
            logger.debug("Rescheduled alert %d", alert["id"])
        else:
            scheduler.add_job(
                execute_alert,
                trigger=trigger,
                id=job_id,
                args=[alert["id"]],
                replace_existing=True,
            )
            logger.info("Scheduled alert %d (%s) - %s %s %s",
                        alert["id"], alert["name"],
                        alert["cadence"], alert.get("day_of_week", ""), alert["send_time"])


async def start_scheduler():
    """Start the APScheduler and load initial jobs."""
    scheduler.start()
    await sync_scheduler()
    logger.info("Alert scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler():
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Alert scheduler stopped")
