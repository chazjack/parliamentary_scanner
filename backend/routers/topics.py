"""Topic and keyword CRUD endpoints."""

from fastapi import APIRouter, HTTPException

from backend.database import (
    create_topic,
    delete_topic,
    get_all_topics,
    get_db,
    replace_keywords,
    update_topic_name,
)
from backend.models import KeywordsUpdate, TopicCreate, TopicUpdate

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("")
async def list_topics():
    db = await get_db()
    try:
        return await get_all_topics(db)
    finally:
        await db.close()


@router.post("", status_code=201)
async def create_topic_endpoint(body: TopicCreate):
    db = await get_db()
    try:
        return await create_topic(db, body.name, body.keywords)
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, f"Topic '{body.name}' already exists")
        raise
    finally:
        await db.close()


@router.put("/{topic_id}")
async def update_topic_endpoint(topic_id: int, body: TopicUpdate):
    db = await get_db()
    try:
        if not await update_topic_name(db, topic_id, body.name):
            raise HTTPException(404, "Topic not found")
        return {"ok": True}
    finally:
        await db.close()


@router.delete("/{topic_id}")
async def delete_topic_endpoint(topic_id: int):
    db = await get_db()
    try:
        if not await delete_topic(db, topic_id):
            raise HTTPException(404, "Topic not found")
        return {"ok": True}
    finally:
        await db.close()


@router.put("/{topic_id}/keywords")
async def update_keywords_endpoint(topic_id: int, body: KeywordsUpdate):
    db = await get_db()
    try:
        if not await replace_keywords(db, topic_id, body.keywords):
            raise HTTPException(404, "Topic not found")
        return {"ok": True}
    finally:
        await db.close()
