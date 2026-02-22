"""SQLite database initialisation, schema, and query helpers."""

import json
import logging
from pathlib import Path

import aiosqlite

from backend.config import DATABASE_PATH

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    UNIQUE(topic_id, keyword)
);

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0,
    current_phase TEXT,
    topic_ids TEXT,
    sources TEXT,
    total_api_results INTEGER DEFAULT 0,
    total_sent_to_llm INTEGER DEFAULT 0,
    total_relevant INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    dedup_key TEXT NOT NULL,
    member_name TEXT NOT NULL,
    member_id TEXT,
    party TEXT,
    member_type TEXT,
    constituency TEXT,
    topics TEXT NOT NULL,
    summary TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    forum TEXT NOT NULL,
    verbatim_quote TEXT,
    source_url TEXT,
    confidence TEXT NOT NULL,
    position_signal TEXT,
    source_type TEXT,
    raw_text TEXT,
    first_seen_scan_id INTEGER,
    UNIQUE(scan_id, dedup_key)
);

CREATE TABLE IF NOT EXISTS member_cache (
    member_id TEXT PRIMARY KEY,
    display_name TEXT,
    party TEXT,
    member_type TEXT,
    constituency TEXT,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    source_type TEXT,
    text_preview TEXT,
    classification TEXT NOT NULL,
    activity_date TEXT,
    context TEXT,
    full_text TEXT
);

CREATE TABLE IF NOT EXISTS master_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_name TEXT NOT NULL,
    member_id TEXT,
    party TEXT,
    member_type TEXT,
    constituency TEXT,
    notes TEXT DEFAULT '',
    priority TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_name)
);

CREATE TABLE IF NOT EXISTS master_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    master_id INTEGER NOT NULL REFERENCES master_list(id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
    UNIQUE(master_id, result_id)
);

CREATE TABLE IF NOT EXISTS lookahead_events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    category TEXT,
    type TEXT,
    house TEXT,
    location TEXT,
    start_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    committee_name TEXT,
    inquiry_name TEXT,
    bill_name TEXT,
    source_url TEXT NOT NULL,
    members TEXT,
    raw_json TEXT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_la_start_date ON lookahead_events(start_date);

CREATE TABLE IF NOT EXISTS lookahead_starred (
    event_id TEXT PRIMARY KEY,
    note TEXT DEFAULT '',
    starred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lookahead_cache_meta (
    cache_key TEXT PRIMARY KEY,
    fetched_at TIMESTAMP NOT NULL,
    event_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    cadence TEXT DEFAULT 'weekly',
    day_of_week TEXT DEFAULT 'monday',
    send_time TEXT DEFAULT '09:00',
    timezone TEXT DEFAULT 'Europe/London',
    topic_ids TEXT,
    sources TEXT,
    scan_period_days INTEGER DEFAULT 7,
    lookahead_days INTEGER DEFAULT 7,
    event_types TEXT,
    houses TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP,
    last_run_status TEXT,
    last_run_error TEXT
);

CREATE TABLE IF NOT EXISTS alert_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES email_alerts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    UNIQUE(alert_id, email)
);

CREATE TABLE IF NOT EXISTS alert_run_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES email_alerts(id) ON DELETE CASCADE,
    run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL,
    scan_id INTEGER,
    recipients_count INTEGER DEFAULT 0,
    results_count INTEGER DEFAULT 0,
    error_message TEXT
);
"""

# Default topics and keywords seeded on first run (from v1 config)
DEFAULT_TOPICS = {
    "AI regulation": [
        "artificial intelligence regulation",
        "AI regulation",
        "regulate AI",
        "AI bill",
        "AI act",
    ],
    "AI safety": [
        "AI safety",
        "artificial intelligence safety",
        "AI risk",
        "frontier AI",
        "AISI",
        "AI Safety Institute",
    ],
    "Online safety": [
        "online safety",
        "Online Safety Act",
        "online harms",
        "social media regulation",
        "platform regulation",
    ],
    "Mis/disinformation": [
        "misinformation",
        "disinformation",
        "fake news",
        "information manipulation",
    ],
    "Deepfakes": [
        "deepfake",
        "deep fake",
        "synthetic media",
        "AI-generated imagery",
    ],
    "AI and climate": [
        "AI climate",
        "artificial intelligence climate",
        "AI energy consumption",
        "AI data centres energy",
        "AI environmental",
    ],
    "AI and work": [
        "AI jobs",
        "AI employment",
        "AI workforce",
        "AI automation",
        "AI replacing workers",
        "AI civil servants",
        "AI productivity",
    ],
    "Biometrics": [
        "biometric",
        "facial recognition",
        "live facial recognition",
        "biometric data",
    ],
    "AI and Copyright": [
        "AI copyright",
        "AI intellectual property",
        "AI training data",
        "text and data mining",
        "AI music",
        "AI creative industries",
    ],
    "Open source AI": [
        "open source AI",
        "open-source AI",
        "open source artificial intelligence",
        "open weight",
    ],
    "AI Sovereignty": [
        "AI sovereignty",
        "sovereign AI",
        "AI national security",
        "AI compute",
        "AI infrastructure",
    ],
    "AI and public services": [
        "AI public services",
        "AI NHS",
        "AI government services",
        "AI healthcare",
        "AI education",
    ],
}


async def get_db() -> aiosqlite.Connection:
    """Get a database connection. Caller must close or use as context manager."""
    db = await aiosqlite.connect(str(DATABASE_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Create tables and seed default topics if database is empty."""
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        await db.commit()

        # Migration: add full_text column to audit_log if not present
        cursor = await db.execute("PRAGMA table_info(audit_log)")
        columns = [row[1] for row in await cursor.fetchall()]
        if "full_text" not in columns:
            await db.execute("ALTER TABLE audit_log ADD COLUMN full_text TEXT")
            await db.commit()
            logger.info("Migrated audit_log: added full_text column")

        # Migration: add trigger and alert_id columns to scans if not present
        cursor = await db.execute("PRAGMA table_info(scans)")
        scan_columns = [row[1] for row in await cursor.fetchall()]
        if "trigger" not in scan_columns:
            await db.execute("ALTER TABLE scans ADD COLUMN trigger TEXT DEFAULT 'manual'")
            await db.commit()
            logger.info("Migrated scans: added trigger column")
        if "alert_id" not in scan_columns:
            await db.execute("ALTER TABLE scans ADD COLUMN alert_id INTEGER")
            await db.commit()
            logger.info("Migrated scans: added alert_id column")

        # Check if topics table is empty — seed defaults if so
        cursor = await db.execute("SELECT COUNT(*) FROM topics")
        row = await cursor.fetchone()
        if row[0] == 0:
            logger.info("Seeding default topics and keywords")
            for topic_name, kws in DEFAULT_TOPICS.items():
                cursor = await db.execute(
                    "INSERT INTO topics (name) VALUES (?)", (topic_name,)
                )
                topic_id = cursor.lastrowid
                for kw in kws:
                    await db.execute(
                        "INSERT INTO keywords (topic_id, keyword) VALUES (?, ?)",
                        (topic_id, kw),
                    )
            await db.commit()
            logger.info("Seeded %d default topics", len(DEFAULT_TOPICS))
    finally:
        await db.close()


# --- Topic query helpers ---


async def get_all_topics(db: aiosqlite.Connection) -> list[dict]:
    """Return all topics with their keywords."""
    cursor = await db.execute("SELECT id, name FROM topics ORDER BY name")
    topics = []
    for row in await cursor.fetchall():
        kw_cursor = await db.execute(
            "SELECT keyword FROM keywords WHERE topic_id = ? ORDER BY keyword",
            (row["id"],),
        )
        keywords = [r["keyword"] for r in await kw_cursor.fetchall()]
        topics.append({"id": row["id"], "name": row["name"], "keywords": keywords})
    return topics


async def create_topic(
    db: aiosqlite.Connection, name: str, keywords: list[str]
) -> dict:
    """Create a topic with keywords. Returns the new topic dict."""
    cursor = await db.execute("INSERT INTO topics (name) VALUES (?)", (name,))
    topic_id = cursor.lastrowid
    for kw in keywords:
        await db.execute(
            "INSERT OR IGNORE INTO keywords (topic_id, keyword) VALUES (?, ?)",
            (topic_id, kw),
        )
    await db.commit()
    return {"id": topic_id, "name": name, "keywords": keywords}


async def update_topic_name(
    db: aiosqlite.Connection, topic_id: int, name: str
) -> bool:
    """Update a topic's name. Returns True if found."""
    cursor = await db.execute(
        "UPDATE topics SET name = ? WHERE id = ?", (name, topic_id)
    )
    await db.commit()
    return cursor.rowcount > 0


async def delete_topic(db: aiosqlite.Connection, topic_id: int) -> bool:
    """Delete a topic and its keywords. Returns True if found."""
    cursor = await db.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
    await db.commit()
    return cursor.rowcount > 0


async def replace_keywords(
    db: aiosqlite.Connection, topic_id: int, keywords: list[str]
) -> bool:
    """Replace all keywords for a topic. Returns True if topic exists."""
    cursor = await db.execute("SELECT id FROM topics WHERE id = ?", (topic_id,))
    if not await cursor.fetchone():
        return False
    await db.execute("DELETE FROM keywords WHERE topic_id = ?", (topic_id,))
    for kw in keywords:
        await db.execute(
            "INSERT OR IGNORE INTO keywords (topic_id, keyword) VALUES (?, ?)",
            (topic_id, kw),
        )
    await db.commit()
    return True


# --- Scan query helpers ---


async def create_scan(
    db: aiosqlite.Connection,
    start_date: str,
    end_date: str,
    topic_ids: list[int],
    sources: list[str] | None = None,
) -> int:
    """Create a scan record. Returns scan ID."""
    default_sources = [
        "hansard", "written_questions", "written_statements",
        "edms", "bills", "divisions",
    ]
    sources_json = json.dumps(sources or default_sources)
    cursor = await db.execute(
        "INSERT INTO scans (start_date, end_date, topic_ids, sources) VALUES (?, ?, ?, ?)",
        (start_date, end_date, json.dumps(topic_ids), sources_json),
    )
    await db.commit()
    return cursor.lastrowid


async def update_scan_progress(
    db: aiosqlite.Connection,
    scan_id: int,
    *,
    progress: float | None = None,
    current_phase: str | None = None,
    status: str | None = None,
    total_api_results: int | None = None,
    total_sent_to_llm: int | None = None,
    total_relevant: int | None = None,
    error_message: str | None = None,
):
    """Update scan progress fields (only non-None values are updated)."""
    updates = []
    params = []
    if progress is not None:
        updates.append("progress = ?")
        params.append(progress)
    if current_phase is not None:
        updates.append("current_phase = ?")
        params.append(current_phase)
    if status is not None:
        updates.append("status = ?")
        params.append(status)
        if status in ("completed", "cancelled", "error"):
            updates.append("completed_at = CURRENT_TIMESTAMP")
    if total_api_results is not None:
        updates.append("total_api_results = ?")
        params.append(total_api_results)
    if total_sent_to_llm is not None:
        updates.append("total_sent_to_llm = ?")
        params.append(total_sent_to_llm)
    if total_relevant is not None:
        updates.append("total_relevant = ?")
        params.append(total_relevant)
    if error_message is not None:
        updates.append("error_message = ?")
        params.append(error_message)

    if not updates:
        return

    params.append(scan_id)
    sql = f"UPDATE scans SET {', '.join(updates)} WHERE id = ?"
    await db.execute(sql, params)
    await db.commit()


async def get_scan(db: aiosqlite.Connection, scan_id: int) -> dict | None:
    """Get a scan by ID."""
    cursor = await db.execute("SELECT * FROM scans WHERE id = ?", (scan_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_scan_list(db: aiosqlite.Connection) -> list[dict]:
    """Get all scans ordered by most recent first."""
    cursor = await db.execute(
        "SELECT id, start_date, end_date, status, total_relevant, created_at "
        "FROM scans ORDER BY created_at DESC"
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_scan_results(
    db: aiosqlite.Connection, scan_id: int
) -> list[dict]:
    """Get all results for a scan."""
    cursor = await db.execute(
        "SELECT * FROM results WHERE scan_id = ? ORDER BY confidence DESC, member_name",
        (scan_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def insert_audit_log(
    db: aiosqlite.Connection,
    scan_id: int,
    member_name: str,
    source_type: str,
    text_preview: str,
    classification: str,
    activity_date: str = "",
    context: str = "",
):
    """Insert an audit log entry."""
    await db.execute(
        """INSERT INTO audit_log
        (scan_id, member_name, source_type, text_preview, classification, activity_date, context)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, member_name, source_type, text_preview, classification, activity_date, context),
    )


async def insert_audit_log_batch(db: aiosqlite.Connection, rows: list[tuple]):
    """Batch insert audit log entries for efficiency.
    Each row: (scan_id, member_name, source_type, text_preview, classification, activity_date, context, full_text)
    """
    await db.executemany(
        """INSERT INTO audit_log
        (scan_id, member_name, source_type, text_preview, classification, activity_date, context, full_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    await db.commit()


async def get_audit_log(db: aiosqlite.Connection, scan_id: int) -> list[dict]:
    """Get audit log entries for a scan."""
    cursor = await db.execute(
        "SELECT * FROM audit_log WHERE scan_id = ? ORDER BY classification, member_name",
        (scan_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_audit_entry(db: aiosqlite.Connection, audit_id: int) -> dict | None:
    """Get a single audit log entry by ID."""
    cursor = await db.execute("SELECT * FROM audit_log WHERE id = ?", (audit_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_audit_summary(db: aiosqlite.Connection, scan_id: int) -> dict:
    """Get audit summary counts for a scan."""
    cursor = await db.execute(
        """SELECT classification, COUNT(*) as count
           FROM audit_log WHERE scan_id = ?
           GROUP BY classification""",
        (scan_id,),
    )
    counts = {row["classification"]: row["count"] for row in await cursor.fetchall()}
    return counts


async def insert_result(db: aiosqlite.Connection, scan_id: int, **fields) -> int:
    """Insert a result row. Returns result ID."""
    # Determine first_seen_scan_id
    dedup_key = fields["dedup_key"]
    cursor = await db.execute(
        "SELECT MIN(scan_id) FROM results WHERE dedup_key = ?", (dedup_key,)
    )
    row = await cursor.fetchone()
    first_seen = row[0] if row and row[0] else scan_id

    cursor = await db.execute(
        """INSERT OR IGNORE INTO results
        (scan_id, dedup_key, member_name, member_id, party, member_type,
         constituency, topics, summary, activity_date, forum, verbatim_quote,
         source_url, confidence, position_signal, source_type, raw_text,
         first_seen_scan_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            scan_id,
            dedup_key,
            fields["member_name"],
            fields.get("member_id"),
            fields.get("party"),
            fields.get("member_type"),
            fields.get("constituency"),
            fields["topics"],
            fields["summary"],
            fields["activity_date"],
            fields["forum"],
            fields.get("verbatim_quote"),
            fields.get("source_url"),
            fields["confidence"],
            fields.get("position_signal"),
            fields.get("source_type"),
            fields.get("raw_text"),
            first_seen,
        ),
    )
    await db.commit()
    return cursor.lastrowid


# --- Master list query helpers ---


async def add_to_master_list(
    db: aiosqlite.Connection,
    member_name: str,
    member_id: str | None,
    party: str,
    member_type: str,
    constituency: str,
    result_id: int,
) -> dict:
    """Add a member to the master list (or update if exists) and link a result."""
    cursor = await db.execute(
        """INSERT INTO master_list (member_name, member_id, party, member_type, constituency)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(member_name) DO UPDATE SET
               party = COALESCE(excluded.party, party),
               member_type = COALESCE(excluded.member_type, member_type),
               constituency = COALESCE(excluded.constituency, constituency)""",
        (member_name, member_id, party, member_type, constituency),
    )
    master_id = cursor.lastrowid
    if not master_id:
        cursor = await db.execute(
            "SELECT id FROM master_list WHERE member_name = ?", (member_name,)
        )
        row = await cursor.fetchone()
        master_id = row["id"]

    await db.execute(
        "INSERT OR IGNORE INTO master_activities (master_id, result_id) VALUES (?, ?)",
        (master_id, result_id),
    )
    await db.commit()
    return {"master_id": master_id}


async def get_master_list(db: aiosqlite.Connection) -> list[dict]:
    """Get all master list entries with their linked activities."""
    cursor = await db.execute(
        "SELECT * FROM master_list ORDER BY member_name"
    )
    entries = []
    for row in await cursor.fetchall():
        entry = dict(row)
        act_cursor = await db.execute(
            """SELECT r.* FROM results r
               JOIN master_activities ma ON ma.result_id = r.id
               WHERE ma.master_id = ?
               ORDER BY r.activity_date DESC""",
            (entry["id"],),
        )
        entry["activities"] = [dict(r) for r in await act_cursor.fetchall()]
        entries.append(entry)
    return entries


async def update_master_entry(
    db: aiosqlite.Connection, master_id: int, notes: str | None = None, priority: str | None = None
) -> bool:
    """Update editable fields on a master list entry."""
    updates = []
    params = []
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    if priority is not None:
        updates.append("priority = ?")
        params.append(priority)
    if not updates:
        return False
    params.append(master_id)
    await db.execute(
        f"UPDATE master_list SET {', '.join(updates)} WHERE id = ?", params
    )
    await db.commit()
    return True


async def delete_master_entry(db: aiosqlite.Connection, master_id: int) -> bool:
    """Remove a member from the master list."""
    cursor = await db.execute("DELETE FROM master_list WHERE id = ?", (master_id,))
    await db.commit()
    return cursor.rowcount > 0


async def get_master_result_ids(db: aiosqlite.Connection) -> list[int]:
    """Get all result IDs that are linked to any master list entry."""
    cursor = await db.execute("SELECT result_id FROM master_activities")
    return [row["result_id"] for row in await cursor.fetchall()]


async def cleanup_stuck_scans(db: aiosqlite.Connection):
    """Mark any scans left in 'running' or 'pending' state as 'error' on startup.

    This handles the case where the server was killed mid-scan.
    """
    await db.execute(
        "UPDATE scans SET status = 'error', error_message = 'Server restarted during scan' "
        "WHERE status IN ('running', 'pending')"
    )
    await db.commit()
    cursor = await db.execute(
        "SELECT changes()"
    )
    row = await cursor.fetchone()
    if row and row[0] > 0:
        logger.info("Cleaned up %d stuck scan(s) from previous run", row[0])


async def remove_master_activity_by_result(db: aiosqlite.Connection, result_id: int) -> bool:
    """Remove a result's link to the master list. Cleans up empty master entries."""
    cursor = await db.execute(
        "SELECT master_id FROM master_activities WHERE result_id = ?", (result_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return False

    master_id = row["master_id"]
    await db.execute("DELETE FROM master_activities WHERE result_id = ?", (result_id,))

    # Clean up master entry if no activities remain
    cursor = await db.execute(
        "SELECT COUNT(*) FROM master_activities WHERE master_id = ?", (master_id,)
    )
    count_row = await cursor.fetchone()
    if count_row[0] == 0:
        await db.execute("DELETE FROM master_list WHERE id = ?", (master_id,))

    await db.commit()
    return True


# --- Look Ahead query helpers ---


async def upsert_lookahead_events(db: aiosqlite.Connection, events: list[dict]):
    """Batch upsert lookahead events."""
    for ev in events:
        await db.execute(
            """INSERT OR REPLACE INTO lookahead_events
            (id, source, title, description, event_type, category, type, house,
             location, start_date, start_time, end_time, committee_name,
             inquiry_name, bill_name, source_url, members, raw_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                ev["id"], ev["source"], ev["title"], ev.get("description", ""),
                ev["event_type"], ev.get("category", ""), ev.get("type", ""),
                ev.get("house", ""), ev.get("location", ""),
                ev["start_date"], ev.get("start_time", ""), ev.get("end_time", ""),
                ev.get("committee_name", ""), ev.get("inquiry_name", ""),
                ev.get("bill_name", ""), ev["source_url"],
                ev.get("members", "[]"), ev.get("raw_json", "{}"),
            ),
        )
    await db.commit()


async def get_lookahead_events(
    db: aiosqlite.Connection,
    start_date: str,
    end_date: str,
    event_types: list[str] | None = None,
    houses: list[str] | None = None,
    keywords: list[str] | None = None,
    starred_only: bool = False,
) -> list[dict]:
    """Query cached events with optional filters."""
    sql = """
        SELECT e.*,
               CASE WHEN s.event_id IS NOT NULL THEN 1 ELSE 0 END AS is_starred
        FROM lookahead_events e
        LEFT JOIN lookahead_starred s ON s.event_id = e.id
        WHERE e.start_date >= ? AND e.start_date <= ?
    """
    params: list = [start_date, end_date]

    if event_types:
        placeholders = ",".join("?" for _ in event_types)
        sql += f" AND e.event_type IN ({placeholders})"
        params.extend(event_types)

    if houses:
        placeholders = ",".join("?" for _ in houses)
        sql += f" AND e.house IN ({placeholders})"
        params.extend(houses)

    if keywords:
        # Word-boundary matching: pad field with spaces and replace common punctuation
        # so keywords only match whole words, not substrings inside longer words.
        def _norm(col):
            return (
                f"(' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("
                f"LOWER({col}), ':', ' '), ',', ' '), '-', ' '), '/', ' '), '(', ' ') || ' ')"
            )

        fields = ["e.title", "e.description", "e.inquiry_name", "e.committee_name", "e.bill_name"]
        kw_clauses = []
        for kw in keywords:
            pattern = f"% {kw.lower()} %"
            field_checks = " OR ".join(f"{_norm(f)} LIKE ?" for f in fields)
            kw_clauses.append(f"({field_checks})")
            params.extend([pattern] * len(fields))
        sql += f" AND ({' OR '.join(kw_clauses)})"

    if starred_only:
        sql += " AND s.event_id IS NOT NULL"

    sql += " ORDER BY e.start_date, e.start_time"
    cursor = await db.execute(sql, params)
    return [dict(row) for row in await cursor.fetchall()]


async def star_lookahead_event(db: aiosqlite.Connection, event_id: str) -> bool:
    """Star a lookahead event. Returns True if newly starred."""
    cursor = await db.execute(
        "INSERT OR IGNORE INTO lookahead_starred (event_id) VALUES (?)",
        (event_id,),
    )
    await db.commit()
    return cursor.rowcount > 0


async def unstar_lookahead_event(db: aiosqlite.Connection, event_id: str) -> bool:
    """Unstar a lookahead event. Returns True if was starred."""
    cursor = await db.execute(
        "DELETE FROM lookahead_starred WHERE event_id = ?", (event_id,)
    )
    await db.commit()
    return cursor.rowcount > 0


async def get_lookahead_cache_meta(
    db: aiosqlite.Connection, cache_key: str
) -> dict | None:
    """Get cache metadata for a key."""
    cursor = await db.execute(
        "SELECT * FROM lookahead_cache_meta WHERE cache_key = ?", (cache_key,)
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def set_lookahead_cache_meta(
    db: aiosqlite.Connection, cache_key: str, event_count: int
):
    """Set cache metadata for a key."""
    await db.execute(
        """INSERT OR REPLACE INTO lookahead_cache_meta (cache_key, fetched_at, event_count)
           VALUES (?, CURRENT_TIMESTAMP, ?)""",
        (cache_key, event_count),
    )
    await db.commit()


async def clear_old_lookahead_events(db: aiosqlite.Connection, before_date: str):
    """Remove lookahead events with start_date before the given date."""
    await db.execute(
        "DELETE FROM lookahead_events WHERE start_date < ?", (before_date,)
    )
    await db.commit()


# --- Email Alert query helpers ---


async def get_all_alerts(db: aiosqlite.Connection) -> list[dict]:
    """Get all alerts with their recipients."""
    cursor = await db.execute("SELECT * FROM email_alerts ORDER BY created_at DESC")
    alerts = []
    for row in await cursor.fetchall():
        alert = dict(row)
        rcpt_cursor = await db.execute(
            "SELECT email FROM alert_recipients WHERE alert_id = ?", (alert["id"],)
        )
        alert["recipients"] = [r["email"] for r in await rcpt_cursor.fetchall()]
        alerts.append(alert)
    return alerts


async def get_alert(db: aiosqlite.Connection, alert_id: int) -> dict | None:
    """Get a single alert with recipients."""
    cursor = await db.execute("SELECT * FROM email_alerts WHERE id = ?", (alert_id,))
    row = await cursor.fetchone()
    if not row:
        return None
    alert = dict(row)
    rcpt_cursor = await db.execute(
        "SELECT email FROM alert_recipients WHERE alert_id = ?", (alert_id,)
    )
    alert["recipients"] = [r["email"] for r in await rcpt_cursor.fetchall()]
    return alert


async def create_alert(db: aiosqlite.Connection, data: dict) -> int:
    """Create an alert and its recipients. Returns alert ID."""
    cursor = await db.execute(
        """INSERT INTO email_alerts
        (name, alert_type, enabled, cadence, day_of_week, send_time, timezone,
         topic_ids, sources, scan_period_days, lookahead_days, event_types, houses)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["name"], data["alert_type"], data.get("enabled", 1),
            data.get("cadence", "weekly"), data.get("day_of_week", "monday"),
            data.get("send_time", "09:00"), data.get("timezone", "Europe/London"),
            json.dumps(data.get("topic_ids", [])),
            json.dumps(data.get("sources", [])),
            data.get("scan_period_days", 7),
            data.get("lookahead_days", 7),
            json.dumps(data.get("event_types")) if data.get("event_types") else None,
            json.dumps(data.get("houses")) if data.get("houses") else None,
        ),
    )
    alert_id = cursor.lastrowid

    for email in data.get("recipients", []):
        await db.execute(
            "INSERT OR IGNORE INTO alert_recipients (alert_id, email) VALUES (?, ?)",
            (alert_id, email),
        )
    await db.commit()
    return alert_id


async def update_alert(db: aiosqlite.Connection, alert_id: int, data: dict) -> bool:
    """Update an alert's configuration and recipients."""
    fields = []
    params = []
    field_map = {
        "name": "name", "alert_type": "alert_type", "enabled": "enabled",
        "cadence": "cadence", "day_of_week": "day_of_week",
        "send_time": "send_time", "timezone": "timezone",
        "scan_period_days": "scan_period_days", "lookahead_days": "lookahead_days",
    }
    for key, col in field_map.items():
        if key in data:
            fields.append(f"{col} = ?")
            params.append(data[key])

    # JSON fields
    for key in ("topic_ids", "sources", "event_types", "houses"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(json.dumps(data[key]) if data[key] is not None else None)

    if fields:
        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(alert_id)
        await db.execute(
            f"UPDATE email_alerts SET {', '.join(fields)} WHERE id = ?", params
        )

    # Replace recipients if provided
    if "recipients" in data:
        await db.execute("DELETE FROM alert_recipients WHERE alert_id = ?", (alert_id,))
        for email in data["recipients"]:
            await db.execute(
                "INSERT OR IGNORE INTO alert_recipients (alert_id, email) VALUES (?, ?)",
                (alert_id, email),
            )

    await db.commit()
    return True


async def delete_alert(db: aiosqlite.Connection, alert_id: int) -> bool:
    """Delete an alert and its recipients (CASCADE)."""
    cursor = await db.execute("DELETE FROM email_alerts WHERE id = ?", (alert_id,))
    await db.commit()
    return cursor.rowcount > 0


async def toggle_alert(db: aiosqlite.Connection, alert_id: int, enabled: bool) -> bool:
    """Enable or disable an alert."""
    cursor = await db.execute(
        "UPDATE email_alerts SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (1 if enabled else 0, alert_id),
    )
    await db.commit()
    return cursor.rowcount > 0


async def update_alert_run_status(
    db: aiosqlite.Connection,
    alert_id: int,
    status: str,
    error: str | None = None,
):
    """Update last_run fields on an alert."""
    await db.execute(
        """UPDATE email_alerts SET
            last_run_at = CURRENT_TIMESTAMP,
            last_run_status = ?,
            last_run_error = ?
        WHERE id = ?""",
        (status, error, alert_id),
    )
    await db.commit()


async def insert_alert_run_log(
    db: aiosqlite.Connection,
    alert_id: int,
    status: str,
    scan_id: int | None = None,
    recipients_count: int = 0,
    results_count: int = 0,
    error_message: str | None = None,
) -> int:
    """Log an alert execution run."""
    cursor = await db.execute(
        """INSERT INTO alert_run_log
        (alert_id, status, scan_id, recipients_count, results_count, error_message)
        VALUES (?, ?, ?, ?, ?, ?)""",
        (alert_id, status, scan_id, recipients_count, results_count, error_message),
    )
    await db.commit()
    return cursor.lastrowid


async def get_alert_run_history(
    db: aiosqlite.Connection, alert_id: int, limit: int = 20
) -> list[dict]:
    """Get run history for an alert."""
    cursor = await db.execute(
        "SELECT * FROM alert_run_log WHERE alert_id = ? ORDER BY run_at DESC LIMIT ?",
        (alert_id, limit),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_enabled_alerts(db: aiosqlite.Connection) -> list[dict]:
    """Get all enabled alerts with recipients (for scheduler)."""
    cursor = await db.execute(
        "SELECT * FROM email_alerts WHERE enabled = 1"
    )
    alerts = []
    for row in await cursor.fetchall():
        alert = dict(row)
        rcpt_cursor = await db.execute(
            "SELECT email FROM alert_recipients WHERE alert_id = ?", (alert["id"],)
        )
        alert["recipients"] = [r["email"] for r in await rcpt_cursor.fetchall()]
        alerts.append(alert)
    return alerts
