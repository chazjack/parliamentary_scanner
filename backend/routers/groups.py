"""Member group CRUD endpoints."""

from fastapi import APIRouter, HTTPException

from backend.database import (
    create_group,
    delete_group,
    get_all_groups,
    get_db,
    update_group,
)
from backend.models import GroupCreate, GroupUpdate

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("")
async def list_groups():
    db = await get_db()
    try:
        return await get_all_groups(db)
    finally:
        await db.close()


@router.post("", status_code=201)
async def create_group_endpoint(body: GroupCreate):
    db = await get_db()
    try:
        return await create_group(db, body.name, body.member_ids, body.member_names)
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, f"Group '{body.name}' already exists")
        raise
    finally:
        await db.close()


@router.put("/{group_id}")
async def update_group_endpoint(group_id: int, body: GroupUpdate):
    db = await get_db()
    try:
        result = await update_group(db, group_id, body.name, body.member_ids, body.member_names)
        if result is None:
            raise HTTPException(404, "Group not found")
        return result
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, f"Group '{body.name}' already exists")
        raise
    finally:
        await db.close()


@router.delete("/{group_id}")
async def delete_group_endpoint(group_id: int):
    db = await get_db()
    try:
        if not await delete_group(db, group_id):
            raise HTTPException(404, "Group not found")
        return {"ok": True}
    finally:
        await db.close()
