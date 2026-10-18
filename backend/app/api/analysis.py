from uuid import UUID
from fastapi import APIRouter
from app.api.memories import Db, User
from app.schemas.analysis import AnalysisRead, EmptyCommand, FeedbackCreate, FeedbackResult
from app.services import analysis_service

router = APIRouter(prefix='/v1/memories')
simulation_router = APIRouter(prefix='/v1/memories')

@router.get('/{memory_id}/analysis',response_model=AnalysisRead)
async def durum(memory_id: UUID,db: Db,user: User):
    return await analysis_service.durumu_getir(db,user.user_id,memory_id)

@router.post('/{memory_id}/analysis/start',response_model=AnalysisRead)
async def baslat(memory_id: UUID,veri: EmptyCommand,db: Db,user: User):
    return await analysis_service.analizi_baslat(db,user.user_id,memory_id)

@simulation_router.post('/{memory_id}/analysis/simulate-trigger',response_model=AnalysisRead)
async def simulasyon(memory_id: UUID,veri: EmptyCommand,db: Db,user: User):
    return await analysis_service.analizi_baslat(db,user.user_id,memory_id,simulation=True)

@router.post('/{memory_id}/emotion-feedback',response_model=FeedbackResult)
async def feedback(memory_id: UUID,veri: FeedbackCreate,db: Db,user: User):
    return await analysis_service.geri_bildirim(db,user.user_id,memory_id,veri)
