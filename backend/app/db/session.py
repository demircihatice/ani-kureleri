"""Her request için ayrı AsyncSession ve tek transaction; startup DB'ye bağlanmaz."""

import ssl
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth import get_current_user
from app.core.config import Ayarlar
from app.db.context import DbGuvenlikHatasi, kullanici_baglamini_kur
from app.schemas.auth import DogrulanmisKullanici


def db_url_dogrula(deger: str, *, migration: bool = False) -> URL:
    try:
        url = make_url(deger)
        rol = (url.username or '').split('.')[0]
        if (url.drivername != 'postgresql+asyncpg' or not url.host or not url.database
                or not url.password or url.port not in (None, 5432) or url.query):
            raise ValueError()
        if (not migration and rol != 'app_runtime') or (migration and rol == 'app_runtime'):
            raise ValueError()
        return url
    except (ValueError, SQLAlchemyError):
        raise DbGuvenlikHatasi('DB URL geçersiz; rol, port ve sürücü ayarlarını kontrol edin.') from None


def engine_olustur(ayarlar: Ayarlar, *, migration: bool = False):
    deger = ayarlar.database_migration_url if migration else ayarlar.database_runtime_url
    if deger is None:
        raise DbGuvenlikHatasi('DB bağlantısı yapılandırılmamış.')
    url = db_url_dogrula(deger.get_secret_value(), migration=migration)
    tls = ssl.create_default_context(cafile=ayarlar.database_ssl_ca_file)
    secenekler = {'echo': False, 'hide_parameters': True,
                 'connect_args': {'ssl': tls, 'timeout': 10, 'command_timeout': 15,
                                  'statement_cache_size': 0, 'prepared_statement_cache_size': 0}}
    if migration:
        secenekler['poolclass'] = NullPool
    else:
        secenekler.update(pool_size=ayarlar.database_pool_size, max_overflow=0,
                          pool_timeout=10, pool_pre_ping=True, pool_reset_on_return='rollback')
    # Cache kapatmak asyncpg'nin prepare() çağrısını kaldırmaz: transaction pooler yasak.
    return create_async_engine(url, **secenekler)


class OturumYonetici:
    def __init__(self, ayarlar: Ayarlar):
        self.engine = engine_olustur(ayarlar)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, autobegin=False)

    @asynccontextmanager
    async def kullanici_oturumu(self, kullanici: DogrulanmisKullanici):
        async with self.sessions() as session:
            try:
                async with session.begin():
                    await kullanici_baglamini_kur(session, kullanici)
                    yield session
                    # Endpoint erken commit/rollback yapıp yeni transaction açamaz.
                    if not session.in_transaction():
                        raise DbGuvenlikHatasi('Transaction erken kapatıldı.')
            except DbGuvenlikHatasi:
                # Kirli rol/claim veya beklenmeyen bağlam havuzdan tamamen çıkarılır.
                await session.invalidate()
                raise

    async def kapat(self):
        await self.engine.dispose()


async def get_user_db_session(
    request: Request,
    kullanici: Annotated[DogrulanmisKullanici, Depends(get_current_user)],
):
    yonetici = getattr(request.app.state, 'db', None)
    if yonetici is None:
        raise HTTPException(503, 'Veritabanı bağlantısı henüz yapılandırılmadı.')
    try:
        async with yonetici.kullanici_oturumu(kullanici) as session:
            yield session
    except (DbGuvenlikHatasi, SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, 'Veritabanı erişimi doğrulanamadı.') from None
