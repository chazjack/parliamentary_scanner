"""FastAPI dependency helpers for authentication and authorisation."""

from fastapi import HTTPException, Request


def get_current_user(request: Request) -> dict:
    """Return the authenticated user (set by auth middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


def require_admin(request: Request) -> dict:
    """Return user if admin, raise 403 otherwise."""
    user = get_current_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user
