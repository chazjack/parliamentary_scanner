"""FastAPI application entry point."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.database import init_db, get_db, cleanup_stuck_scans
from backend.routers import topics, scans, results, master, lookahead, alerts

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="Parliamentary Monitor", version="2.0.0")

# Register API routers
app.include_router(topics.router)
app.include_router(scans.router)
app.include_router(results.router)
app.include_router(master.router)
app.include_router(lookahead.router)
app.include_router(alerts.router)


@app.on_event("startup")
async def startup():
    await init_db()

    # Clean up any scans left in "running" state from a previous crash
    db = await get_db()
    try:
        await cleanup_stuck_scans(db)
    finally:
        await db.close()

    # Wire up the scan runner so the scans router can launch scans
    try:
        from backend.services.scanner import run_scan
        scans.register_scan_runner(run_scan)
    except Exception as e:
        logger.error(f"Failed to import scanner: {e}")
        # Server will start but scans won't work

    # Start alert scheduler and wire up alert executor
    try:
        from backend.services.scheduler import start_scheduler, execute_alert, sync_scheduler
        alerts.register_alert_executor(execute_alert, sync_scheduler)
        await start_scheduler()
    except Exception as e:
        logger.error(f"Failed to start alert scheduler: {e}")


@app.on_event("shutdown")
async def shutdown():
    try:
        from backend.services.scheduler import stop_scheduler
        stop_scheduler()
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")


# Serve frontend static files (must be last so API routes take priority)
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
