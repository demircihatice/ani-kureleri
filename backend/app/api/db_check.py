from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.context import DbGuvenlikHatasi
from app.db.session import get_user_db_session
from app.schemas.auth import DogrulanmisKullanici

router = APIRouter()


@router.get('/v1/db-check')
async def db_check(
    session: Annotated[AsyncSession, Depends(get_user_db_session, scope='function')],
    kullanici: Annotated[DogrulanmisKullanici, Depends(get_current_user)],
) -> dict[str, str | bool]:
    esit = (await session.execute(text('SELECT auth.uid() = CAST(:id AS uuid)'),
                                  {'id': str(kullanici.user_id)})).scalar_one()
    if not esit:
        raise DbGuvenlikHatasi('Kullanıcı bağlamı eşleşmedi.')
    return {'database': 'ok', 'user_context': True}
