from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EmotionCategory


async def aktif_duygulari_getir(session: AsyncSession):
    sorgu = (select(EmotionCategory)
             .where(EmotionCategory.is_active.is_(True))
             .order_by(EmotionCategory.sort_order, EmotionCategory.code))
    return (await session.scalars(sorgu)).all()
