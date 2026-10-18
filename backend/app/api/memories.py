from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_user_db_session
from app.schemas.auth import DogrulanmisKullanici
from app.schemas.memory import MemoryCreate, MemoryDetail, MemoryListQuery, MemoryPage, MemoryPatch
from app.services import memory_service

router = APIRouter(prefix='/v1/memories')
Db = Annotated[AsyncSession, Depends(get_user_db_session, scope='function')]
User = Annotated[DogrulanmisKullanici, Depends(get_current_user)]


@router.get('',response_model=MemoryPage)
async def liste(db: Db, user: User, sorgu: Annotated[MemoryListQuery, Query()]):
    return await memory_service.anilari_getir(db,user.user_id,sorgu)


@router.get('/{memory_id}',response_model=MemoryDetail)
async def detay(memory_id: UUID, db: Db, user: User):
    return await memory_service.ani_detayini_getir(db,user.user_id,memory_id)


@router.post('',response_model=MemoryDetail,status_code=201)
async def olustur(veri: MemoryCreate, db: Db, user: User, response: Response):
    sonuc,yeni = await memory_service.ani_olustur(db,user.user_id,veri)
    response.status_code = 201 if yeni else 200
    return sonuc


@router.patch('/{memory_id}',response_model=MemoryDetail)
async def duzenle(memory_id: UUID, veri: MemoryPatch, db: Db, user: User):
    return await memory_service.ani_duzenle(db,user.user_id,memory_id,veri)
