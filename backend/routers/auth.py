"""Authentication endpoints: login, logout, current user."""

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel

from backend.database import (
    create_session,
    delete_session,
    get_db,
    get_session_user,
    get_user_by_username,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    db = await get_db()
    try:
        user = await get_user_by_username(db, body.username)
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        token = await create_session(db, user["id"])
    finally:
        await db.close()

    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        max_age=30 * 24 * 3600,  # 30 days
    )
    return {"username": user["username"]}


@router.post("/logout")
async def logout(response: Response, session: str | None = Cookie(default=None)):
    if session:
        db = await get_db()
        try:
            await delete_session(db, session)
        finally:
            await db.close()
    response.delete_cookie("session")
    return {"ok": True}


@router.get("/me")
async def me(session: str | None = Cookie(default=None)):
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    db = await get_db()
    try:
        user = await get_session_user(db, session)
    finally:
        await db.close()
    if not user:
        raise HTTPException(status_code=401, detail="Session expired.")
    return {"username": user["username"]}
