from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_user_db_session
from app.schemas.emotion import EmotionCategoryRead
from app.services.emotion_service import aktif_duygulari_getir

router = APIRouter()


@router.get('/v1/emotions', response_model=list[EmotionCategoryRead])
async def emotions(session: Annotated[AsyncSession, Depends(get_user_db_session, scope='function')]):
    return await aktif_duygulari_getir(session)
