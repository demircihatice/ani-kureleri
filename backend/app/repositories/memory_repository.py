"""Tüm fonksiyonlar get_user_db_session ile açılmış aynı transaction'ı kullanır."""
from uuid import UUID

from sqlalchemy import Column, MetaData, Table, Text, and_, or_, insert, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EmotionCategory, Memory, MemoryCreationRequest, MemoryImage

# Yönetilen Storage metadata'sı yalnızca okunur, Base.metadata/create_all kapsamına girmez.
storage_objects = Table('objects', MetaData(), Column('bucket_id', Text), Column('name', Text), schema='storage')
STORAGE_BUCKET = 'ani-fotograflari'


async def aniyi_bul(db: AsyncSession, user_id: UUID, memory_id: UUID):
    return (await db.scalars(select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id))).one_or_none()


async def aktif_duyguyu_bul(db: AsyncSession, code: str):
    return (await db.scalars(select(EmotionCategory).where(
        EmotionCategory.code == code, EmotionCategory.is_active.is_(True)))).one_or_none()


async def anilari_listele(db: AsyncSession, user_id: UUID, page: int, page_size: int, emotion_id: UUID | None):
    sorgu = select(Memory).where(Memory.user_id == user_id)
    if emotion_id is not None:
        # Eski happiness UUID'si saklanır; Neşe filtresi bu eşdeğer geçmişi de bulur.
        nese = select(EmotionCategory.id).where(EmotionCategory.code == 'joy').scalar_subquery()
        eski_nese = select(EmotionCategory.id).where(EmotionCategory.code == 'happiness')
        sorgu = sorgu.where(or_(Memory.final_emotion_id == emotion_id,
            and_(nese == emotion_id, Memory.final_emotion_id.in_(eski_nese))))
    sorgu = (sorgu.order_by(Memory.memory_date.desc(), Memory.created_at.desc(), Memory.id.desc())
             .offset((page-1)*page_size).limit(page_size+1))
    return list((await db.scalars(sorgu)).all())


async def fotograflari_getir(db: AsyncSession, user_id: UUID, ids: list[UUID]):
    if not ids:
        return []
    sorgu = (select(MemoryImage).join(Memory, Memory.id == MemoryImage.memory_id)
             .where(Memory.user_id == user_id, Memory.id.in_(ids))
             .order_by(MemoryImage.memory_id, MemoryImage.sort_order, MemoryImage.id))
    return list((await db.scalars(sorgu)).all())


async def duygulari_getir(db: AsyncSession, ids: set[UUID]):
    if not ids:
        return {}
    # Pasif legacy etiketleri detay/listede kaybolmaz; aktif filtre seçiminden ayrıdır.
    return {e.id: e for e in (await db.scalars(select(EmotionCategory).where(EmotionCategory.id.in_(ids)))).all()}


async def kayit_kilidi(db: AsyncSession, memory_id: UUID):
    # Eski ani_olustur RPC ile aynı kilit anahtarı; aynı UUID eşzamanlı kaydedilmez.
    await db.execute(text('SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(:id,0))'), {'id': str(memory_id)})


async def ilk_istek_ozeti(db: AsyncSession, user_id: UUID, memory_id: UUID):
    return (await db.scalars(select(MemoryCreationRequest.payload_hash).where(
        MemoryCreationRequest.memory_id == memory_id, MemoryCreationRequest.user_id == user_id))).one_or_none()


async def yuklenen_yollari_getir(db: AsyncSession, paths: list[str]):
    return set((await db.scalars(select(storage_objects.c.name).where(
        storage_objects.c.bucket_id == STORAGE_BUCKET, storage_objects.c.name.in_(paths)))).all())


async def aniyi_ekle(db: AsyncSession, user_id: UUID, veri):
    sorgu = (pg_insert(Memory).values(id=veri.id,user_id=user_id,sphere_id=None,
        title=veri.title,description=veri.description,memory_date=veri.memory_date,
        image_url=veri.storage_paths[0],analysis_status='awaiting_nfc')
        .on_conflict_do_nothing(index_elements=[Memory.id]).returning(Memory))
    return (await db.scalars(sorgu)).one_or_none()


async def fotograf_ve_ozeti_ekle(db: AsyncSession, user_id: UUID, veri, ozet: str):
    await db.execute(insert(MemoryImage).values([
        {'memory_id': veri.id, 'storage_path': path, 'sort_order': i}
        for i,path in enumerate(veri.storage_paths)]))
    await db.execute(insert(MemoryCreationRequest).values(memory_id=veri.id,user_id=user_id,payload_hash=ozet))


async def aniyi_guncelle(db: AsyncSession, user_id: UUID, memory_id: UUID, version: int, degisiklik: dict):
    # Bulk update'de ORM version mekanizmasına güvenilmez; koşul açıkça eklenir.
    sorgu = (update(Memory).where(Memory.id == memory_id, Memory.user_id == user_id, Memory.version == version)
             .values(**degisiklik).returning(Memory).execution_options(populate_existing=True, synchronize_session=False))
    return (await db.scalars(sorgu)).one_or_none()
