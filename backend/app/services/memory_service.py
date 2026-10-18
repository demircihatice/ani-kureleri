import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import memory_repository as repo
from app.schemas.memory import (
    MemoryCreate, MemoryDetail, MemoryEmotion, MemoryListItem, MemoryListQuery,
    MemoryPage, MemoryPatch, MemoryPhoto, MemoryRead,
)


def storage_yolu_gecerli(path: str, user_id: UUID, memory_id: UUID, sira: int) -> bool:
    return 0 <= sira <= 4 and path == f'{user_id}/{memory_id}/{sira}.jpg'


def storage_yolu_sahibine_ait(path: str, user_id: UUID, memory_id: UUID) -> bool:
    # Dosya adı ilk yükleme sırasıdır; sonradan değişen sort_order ile karıştırılmaz.
    return any(storage_yolu_gecerli(path,user_id,memory_id,i) for i in range(5))


def ilk_istek_hash(user_id: UUID, veri: MemoryCreate) -> str:
    belge = {'schema': 1, 'user_id': str(user_id), **veri.model_dump(mode='json')}
    ham = json.dumps(belge, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(ham).hexdigest()


async def _gorunum_verileri(db, user_id, anilar):
    fotograflar = await repo.fotograflari_getir(db,user_id,[a.id for a in anilar])
    gruplar = {a.id: [] for a in anilar}
    for f in fotograflar:
        if f.memory_id in gruplar and 0 <= f.sort_order <= 4 and storage_yolu_sahibine_ait(f.storage_path,user_id,f.memory_id):
            gruplar[f.memory_id].append(MemoryPhoto(storage_path=f.storage_path,sort_order=f.sort_order))
    for a in anilar:
        gruplar[a.id].sort(key=lambda f:f.sort_order)
        if not gruplar[a.id] and storage_yolu_sahibine_ait(a.image_url,user_id,a.id):
            gruplar[a.id] = [MemoryPhoto(storage_path=a.image_url,sort_order=0)]
    ids = {e for a in anilar for e in (a.final_emotion_id,a.predicted_emotion_id) if e is not None}
    duygular = {k:MemoryEmotion.model_validate(v) for k,v in (await repo.duygulari_getir(db,ids)).items()}
    return gruplar,duygular


async def _detay(db, user_id, ani):
    gruplar,duygular = await _gorunum_verileri(db,user_id,[ani])
    photos = gruplar[ani.id]
    return MemoryDetail(**MemoryRead.model_validate(ani).model_dump(exclude={'image_url'}),photos=photos,
        cover=photos[0] if photos else None,predicted_emotion=duygular.get(ani.predicted_emotion_id),
        final_emotion=duygular.get(ani.final_emotion_id))


async def anilari_getir(db: AsyncSession, user_id: UUID, sorgu: MemoryListQuery):
    emotion_id = None
    if sorgu.emotion is not None:
        duygu = await repo.aktif_duyguyu_bul(db,sorgu.emotion)
        if duygu is None:
            raise HTTPException(422,'Geçerli bir aktif duygu kodu seçin.')
        emotion_id = duygu.id
    rows = await repo.anilari_listele(db,user_id,sorgu.page,sorgu.page_size,emotion_id)
    has_more = len(rows) > sorgu.page_size
    rows = rows[:sorgu.page_size]
    gruplar,duygular = await _gorunum_verileri(db,user_id,rows)
    items = [MemoryListItem(id=a.id,title=a.title,memory_date=a.memory_date,created_at=a.created_at,
        cover=gruplar[a.id][0] if gruplar[a.id] else None,photos=gruplar[a.id],final_emotion=duygular.get(a.final_emotion_id),
        analysis_status=a.analysis_status,version=a.version) for a in rows]
    return MemoryPage(items=items,page=sorgu.page,page_size=sorgu.page_size,has_more=has_more)


async def ani_detayini_getir(db: AsyncSession, user_id: UUID, memory_id: UUID):
    ani = await repo.aniyi_bul(db,user_id,memory_id)
    if ani is None:
        raise HTTPException(404,'Anı bulunamadı.')
    return await _detay(db,user_id,ani)


async def ani_olustur(db: AsyncSession, user_id: UUID, veri: MemoryCreate):
    if any(not storage_yolu_gecerli(p,user_id,veri.id,i) for i,p in enumerate(veri.storage_paths)):
        raise HTTPException(422,'Fotoğraf yolları kullanıcı/anı/sıra ile eşleşmelidir.')
    ozet = ilk_istek_hash(user_id,veri)
    await repo.kayit_kilidi(db,veri.id)
    mevcut = await repo.aniyi_bul(db,user_id,veri.id)
    if mevcut is not None:
        if await repo.ilk_istek_ozeti(db,user_id,veri.id) != ozet:
            raise HTTPException(409,'Bu anı kimliği farklı bir kayıt için kullanılmış.')
        return await _detay(db,user_id,mevcut), False
    if await repo.yuklenen_yollari_getir(db,veri.storage_paths) != set(veri.storage_paths):
        raise HTTPException(422,'Önce tüm fotoğrafları kendi Storage alanınıza yükleyin.')
    yeni = await repo.aniyi_ekle(db,user_id,veri)
    if yeni is None:
        # Başka sahibin UUID'si veya görünmeyen kayıt: ayrıntı/SQL bilgisi açıklanmaz.
        raise HTTPException(404,'Anı bulunamadı.')
    await repo.fotograf_ve_ozeti_ekle(db,user_id,veri,ozet)
    return await _detay(db,user_id,yeni), True


async def ani_duzenle(db: AsyncSession, user_id: UUID, memory_id: UUID, veri: MemoryPatch):
    mevcut = await repo.aniyi_bul(db,user_id,memory_id)
    if mevcut is None:
        raise HTTPException(404,'Anı bulunamadı.')
    if mevcut.version != veri.version:
        raise HTTPException(409,'Anı değişmiş. Güncel halini alıp tekrar deneyin.')
    degisiklik = veri.model_dump(exclude_unset=True,exclude={'version'})
    yeni = await repo.aniyi_guncelle(db,user_id,memory_id,veri.version,degisiklik)
    if yeni is None:
        raise HTTPException(409,'Anı değişmiş. Güncel halini alıp tekrar deneyin.')
    return await _detay(db,user_id,yeni)
