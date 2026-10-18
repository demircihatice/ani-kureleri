"""Gerçek model çalıştırmaz. Sonuç yazımı HTTP'ye açılmayan iç servis işlevidir."""
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from app.repositories import analysis_repository as repo
from app.repositories import memory_repository
from app.schemas.analysis import AnalysisRead, FeedbackResult

class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    emotion_code: Literal['anger', 'shame', 'joy', 'disgust', 'sadness', 'surprise', 'fear']
    confidence: float = Field(ge=0,le=1,allow_inf_nan=False)
    model_version: str = Field(min_length=1,max_length=200)
    # Gelecekteki worker kararı: bir güven eşiği veya sekizinci model sınıfı değildir.
    use_fallback: bool = Field(default=False, strict=True)

def komut_hatasini_yukselt(sonuc):
    hata = sonuc.get('error')
    if hata:
        durum = 404 if hata=='not_found' else 409 if hata=='conflict' else 422
        mesaj = 'Anı bulunamadı.' if durum==404 else 'Analiz durumu veya kayıt sürümü uygun değil.' if durum==409 else 'Geçerli bir aktif duygu ve analiz bilgisi gerekli.'
        raise HTTPException(durum,mesaj)

async def durumu_getir(db, user_id, memory_id):
    m = await memory_repository.aniyi_bul(db,user_id,memory_id)
    if m is None:
        raise HTTPException(404,'Anı bulunamadı.')
    duygular = await memory_repository.duygulari_getir(db,{e for e in (m.predicted_emotion_id,m.final_emotion_id) if e})
    j = await repo.son_isi_getir(db,user_id,memory_id)
    return AnalysisRead(memory_id=m.id,status=m.analysis_status,predicted_emotion=duygular.get(m.predicted_emotion_id),
        predicted_confidence=m.predicted_confidence,final_emotion=duygular.get(m.final_emotion_id),
        final_emotion_source=m.final_emotion_source,model_version=m.model_version,analyzed_at=m.analyzed_at,
        version=m.version,job_id=j.id if j else None,trigger_source=j.trigger_source if j else None,error_code=j.error_code if j else None)

async def analizi_baslat(db,user_id,memory_id,*,simulation=False):
    # Sahiplik hem RLS/okuma hem DB komutunda kontrol edilir.
    await durumu_getir(db,user_id,memory_id)
    sonuc = await repo.komut(db,memory_id,'development_simulation' if simulation else 'nfc')
    komut_hatasini_yukselt(sonuc)
    return await durumu_getir(db,user_id,memory_id)

async def geri_bildirim(db,user_id,memory_id,veri):
    await durumu_getir(db,user_id,memory_id)
    sonuc = await repo.komut(db,memory_id,'feedback',code=veri.corrected_emotion_code,expected=veri.expected_version)
    komut_hatasini_yukselt(sonuc)
    return FeedbackResult(analysis=await durumu_getir(db,user_id,memory_id),changed=sonuc['changed'],feedback_id=sonuc.get('feedback_id'))

async def mark_processing(db,memory_id):
    sonuc = await repo.komut(db,memory_id,'processing')
    komut_hatasini_yukselt(sonuc)

async def apply_analysis_result(db,memory_id,result: AnalysisResult):
    # Gelecekteki worker doğrulanmış kullanıcı transaction'ında çağırır; dış route yok.
    # Gerçek model yokken bu fonksiyonu normal akış çağırmaz.
    result = AnalysisResult.model_validate(result)
    sonuc = await repo.komut(db,memory_id,'result',code=result.emotion_code,
        confidence=result.confidence,model=result.model_version,fallback=result.use_fallback)
    komut_hatasini_yukselt(sonuc)

async def mark_failed(db,memory_id,error_code='model_unavailable'):
    sonuc = await repo.komut(db,memory_id,'failed',code=error_code)
    komut_hatasini_yukselt(sonuc)

# Salt domain eşlemesi; cihaz bağlantısı veya komut gönderimi yoktur.
DEVICE_STATES = {'awaiting_nfc':'IDLE','queued':'ANALYZING_WHITE','processing':'ANALYZING_WHITE',
                 'completed':'SHOW_EMOTION','failed':'OFF','cancelled':'OFF','not_required':'IDLE'}
