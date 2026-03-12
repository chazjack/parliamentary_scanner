"""Admin-only endpoints: user management and activity dashboard."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.database import (
    create_user,
    delete_user,
    get_all_users,
    get_db,
    hash_password,
    seed_default_topics_for_user,
)
from backend.deps import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class ResetPasswordRequest(BaseModel):
    password: str


class RenameUserRequest(BaseModel):
    username: str


@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    db = await get_db()
    try:
        return await get_all_users(db)
    finally:
        await db.close()


@router.post("/users", status_code=201)
async def create_user_endpoint(body: CreateUserRequest, admin: dict = Depends(require_admin)):
    if not body.username.strip():
        raise HTTPException(400, "Username cannot be empty")
    if not body.password:
        raise HTTPException(400, "Password cannot be empty")
    db = await get_db()
    try:
        try:
            user_id = await create_user(db, body.username.strip(), body.password, is_admin=body.is_admin)
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(400, f"Username '{body.username}' already exists")
            raise
        # Seed default topics for new user
        await seed_default_topics_for_user(db, user_id)
        return {"id": user_id, "username": body.username.strip(), "is_admin": body.is_admin}
    finally:
        await db.close()


@router.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "Cannot delete your own account")
    db = await get_db()
    try:
        # Check if target is an admin and if they're the last one
        cursor = await db.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "User not found")
        if row["is_admin"]:
            cursor2 = await db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
            admin_count = (await cursor2.fetchone())[0]
            if admin_count <= 1:
                raise HTTPException(400, "Cannot delete the last admin account")
        deleted = await delete_user(db, user_id)
        if not deleted:
            raise HTTPException(404, "User not found")
        return {"ok": True}
    finally:
        await db.close()


@router.patch("/users/{user_id}/username")
async def rename_user_endpoint(user_id: int, body: RenameUserRequest, admin: dict = Depends(require_admin)):
    if not body.username.strip():
        raise HTTPException(400, "Username cannot be empty")
    db = await get_db()
    try:
        try:
            cursor = await db.execute(
                "UPDATE users SET username = ? WHERE id = ?", (body.username.strip(), user_id)
            )
            await db.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(400, f"Username '{body.username.strip()}' already exists")
            raise
        if cursor.rowcount == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True}
    finally:
        await db.close()


@router.patch("/users/{user_id}/password")
async def reset_password_endpoint(user_id: int, body: ResetPasswordRequest, admin: dict = Depends(require_admin)):
    if not body.password:
        raise HTTPException(400, "Password cannot be empty")
    db = await get_db()
    try:
        new_hash = hash_password(body.password)
        cursor = await db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True}
    finally:
        await db.close()


@router.get("/activity")
async def get_activity(admin: dict = Depends(require_admin)):
    db = await get_db()
    try:
        users = await get_all_users(db)
        # Get recent scans per user
        cursor = await db.execute("""
            SELECT s.id, s.user_id, u.username, s.start_date, s.end_date,
                   s.status, s.total_relevant, s.created_at
            FROM scans s
            JOIN users u ON u.id = s.user_id
            ORDER BY s.created_at DESC
            LIMIT 50
        """)
        recent_scans = [dict(row) for row in await cursor.fetchall()]
        return {"users": users, "recent_scans": recent_scans}
    finally:
        await db.close()
