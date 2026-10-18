"""RLS okumaları ve yalnızca backend login rolüne açık, dar DB komutu."""
from sqlalchemy import select, text
from app.db.models import AnalysisJob

async def son_isi_getir(db, user_id, memory_id):
    return (await db.scalars(select(AnalysisJob).where(AnalysisJob.memory_id==memory_id,
        AnalysisJob.user_id==user_id).order_by(AnalysisJob.created_at.desc(), AnalysisJob.id.desc()).limit(1))).one_or_none()

async def komut(db, memory_id, action, *, code=None, confidence=None, model=None, expected=None, fallback=False):
    # authenticated hiçbir yazma izni kazanmaz. Aynı transaction/JWT bağlamı korunur.
    # Başarısız SQL transaction'ı request sınırında rollback edilir; tekrar açılmaz.
    await db.execute(text('SET LOCAL ROLE app_runtime'))
    sonuc = (await db.execute(text("""
        SELECT ani_kureleri_private.analysis_command(CAST(:memory AS uuid),:action,:code,
          CAST(:confidence AS double precision),:model,CAST(:expected AS bigint),CAST(:fallback AS boolean))
    """), dict(memory=memory_id,action=action,code=code,confidence=confidence,model=model,expected=expected,fallback=fallback))).scalar_one()
    await db.execute(text('SET LOCAL ROLE authenticated'))
    # ORM identity map aynı transaction içindeki DB fonksiyonu güncellemelerini tekrar okusun.
    db.expire_all()
    return sonuc
