"""Member Topic Index API endpoints."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.database import (
    delete_index_config,
    get_completed_scans_summary,
    get_db,
    get_index_configs,
    get_results_for_scans,
    save_index_config,
)
from backend.services.indexer import create_index_excel, generate_index

router = APIRouter(prefix="/api/index", tags=["index"])


class GenerateRequest(BaseModel):
    scan_ids: list[int]


class SaveConfigRequest(BaseModel):
    name: str
    scan_ids: list[int]


@router.get("/scans")
async def list_completed_scans():
    """Return completed scans with topic names and result counts for the selector UI."""
    db = await get_db()
    try:
        return await get_completed_scans_summary(db)
    finally:
        await db.close()


@router.post("/generate")
async def generate_index_endpoint(body: GenerateRequest):
    """Generate an index from the selected scans."""
    if not body.scan_ids:
        raise HTTPException(400, "No scan IDs provided")
    db = await get_db()
    try:
        results = await get_results_for_scans(db, body.scan_ids)
        scans = await get_completed_scans_summary(db)
        scan_summaries = [s for s in scans if s["id"] in body.scan_ids]
    finally:
        await db.close()

    index_data = generate_index(results)
    index_data["scan_summaries"] = scan_summaries
    return index_data


@router.post("/save", status_code=201)
async def save_config(body: SaveConfigRequest):
    """Save a named index configuration."""
    if not body.name.strip():
        raise HTTPException(400, "Name cannot be empty")
    db = await get_db()
    try:
        return await save_index_config(db, body.name.strip(), body.scan_ids)
    finally:
        await db.close()


@router.get("/saved")
async def list_saved_configs():
    """List all saved index configs."""
    db = await get_db()
    try:
        return await get_index_configs(db)
    finally:
        await db.close()


@router.delete("/saved/{config_id}")
async def delete_config(config_id: int):
    """Delete a saved index config."""
    db = await get_db()
    try:
        if not await delete_index_config(db, config_id):
            raise HTTPException(404, "Config not found")
        return {"ok": True}
    finally:
        await db.close()


@router.get("/export")
async def export_excel(scan_ids: str = Query(..., description="Comma-separated scan IDs")):
    """Download an Excel file of the index for the given scan IDs."""
    try:
        ids = [int(x.strip()) for x in scan_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "Invalid scan_ids parameter")

    if not ids:
        raise HTTPException(400, "No scan IDs provided")

    db = await get_db()
    try:
        results = await get_results_for_scans(db, ids)
        scans = await get_completed_scans_summary(db)
        scan_summaries = [s for s in scans if s["id"] in ids]
    finally:
        await db.close()

    index_data = generate_index(results)

    try:
        buf = create_index_excel(index_data, scan_summaries)
    except ImportError:
        raise HTTPException(500, "openpyxl not installed — Excel export unavailable")

    filename = "member_topic_index.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
