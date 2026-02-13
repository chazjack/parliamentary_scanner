"""FastAPI application entry point."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.database import init_db
from backend.routers import topics, scans, results, master

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


@app.on_event("startup")
async def startup():
    await init_db()
    # Wire up the scan runner so the scans router can launch scans
    from backend.services.scanner import run_scan
    scans.register_scan_runner(run_scan)


# Serve frontend static files (must be last so API routes take priority)
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
