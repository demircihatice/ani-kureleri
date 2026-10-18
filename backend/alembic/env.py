import asyncio

from alembic import context
from alembic.util import CommandError

from app.core.config import Ayarlar
from app.db.baseline import autogenerate_engelle, baseline_denetle, include_name
from app.db.context import DbGuvenlikHatasi
from app.db.session import engine_olustur


def configure(connection=None):
    context.configure(
        connection=connection,
        dialect_name='postgresql',
        # Offline SQL'de RAISE NOTICE yüzde işaretleri pyformat ile ikiye katlanmasın.
        dialect_opts={'paramstyle': 'named'},
        target_metadata=None,
        include_schemas=True,
        include_name=include_name,
        process_revision_directives=autogenerate_engelle,
        version_table_schema='public',
    )


def calistir(connection):
    baseline_denetle(connection)
    # SQLAlchemy audit sorguları autobegin açar; salt-okunur kontrol transaction'ını bitir.
    connection.rollback()
    configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    ayarlar = Ayarlar()
    if not ayarlar.alembic_baseline_confirmed:
        raise CommandError('Önce canlı şema denetimini tamamlayın; baseline onayı kapalı.')
    engine = engine_olustur(ayarlar, migration=True)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(calistir)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    configure()
    with context.begin_transaction():
        context.run_migrations()
else:
    try:
        asyncio.run(online())
    except DbGuvenlikHatasi as hata:
        raise CommandError(str(hata)) from None
    except Exception:
        # Connection string, parola ve DB istisna ayrıntıları terminale taşınmaz.
        raise CommandError('Alembic işlemi tamamlanamadı. Ayrı migration URL ve şema/onay ayarlarını kontrol edin.') from None
