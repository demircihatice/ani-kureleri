"""İsteğe bağlı, salt okunur gerçek PostgreSQL testleri. DDL veya kullanıcı kaydı yok."""

import os
import asyncio

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.auth import JwtDogrulayici
from app.core.config import Ayarlar
from app.db.context import ROL_DENETIMI, runtime_rolunu_dogrula
from app.db.session import OturumYonetici

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope='module')]


@pytest_asyncio.fixture(scope='module', loop_scope='module')
async def canli():
    if os.getenv('RUN_DB_INTEGRATION') != 'true':
        pytest.skip('Canlı DB testleri açıkça etkinleştirilmedi (RUN_DB_INTEGRATION=true).')
    ayarlar = Ayarlar(database_pool_size=1)
    if ayarlar.database_runtime_url is None:
        pytest.skip('DATABASE_RUNTIME_URL verilmedi; canlı PostgreSQL/RLS doğrulanmadı.')
    token_a = os.getenv('TEST_ACCESS_TOKEN_A')
    token_b = os.getenv('TEST_ACCESS_TOKEN_B')
    if not token_a or not token_b:
        pytest.skip('İki doğrulanmış hesabın access token değerleri test ortamında gerekli.')
    yonetici = None
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as istemci:
            dogrulayici = JwtDogrulayici(ayarlar, istemci)
            a = await dogrulayici.dogrula(token_a)
            b = await dogrulayici.dogrula(token_b)
        if a.user_id == b.user_id:
            pytest.fail('İki farklı test hesabı gerekli.', pytrace=False)
        yonetici = OturumYonetici(ayarlar)
        yield yonetici, a, b
    except Exception:
        pytest.fail('Canlı DB testi başarısız; URL/rol/JWT/şema denetimini kontrol edin. Gizli ayrıntılar bastırılmadı.', pytrace=False)
    finally:
        if yonetici is not None:
            await yonetici.kapat()


async def temiz_baglantiyi_kontrol_et(manager):
    async with manager.engine.connect() as connection:
        async with connection.begin():
            temiz = (await connection.execute(text("""
                SELECT auth.uid() IS NULL AND current_user = 'app_runtime'
                  AND coalesce(current_setting('request.jwt.claim.sub', true), '') = ''
                  AND coalesce(current_setting('request.jwt.claims', true), '') IN ('', '{}')
            """))).scalar_one()
            assert temiz


async def test_context_yokken_uid_yok(canli):
    await temiz_baglantiyi_kontrol_et(canli[0])


async def test_runtime_superuser_bypass_owner_degil(canli):
    async with canli[0].engine.connect() as connection:
        kayit = (await connection.execute(ROL_DENETIMI)).mappings().one()
        runtime_rolunu_dogrula(kayit)


@pytest.mark.parametrize('index', [1, 2])
async def test_kendi_verisi_ve_diger_kullanicinin_gorunmezligi(canli, index):
    manager, a, b = canli
    kendi, diger = (a, b) if index == 1 else (b, a)
    async with manager.kullanici_oturumu(kendi) as session:
        # Yalnızca UUID/sahiplik incelenir; başlık/açıklama/fotoğraf içeriği okunmaz.
        assert (await session.execute(text('SELECT id FROM public.profiles'))).scalars().all() == [kendi.user_id]
        assert (await session.execute(text('SELECT count(*) FROM public.profiles WHERE id=CAST(:id AS uuid)'),
                                       {'id': str(diger.user_id)})).scalar_one() == 0
        sahipler = (await session.execute(text('SELECT user_id FROM public.sphere_sets'))).scalars().all()
        assert sahipler == [kendi.user_id]
        assert (await session.execute(text('SELECT count(*) FROM public.spheres'))).scalar_one() == 3
        for sorgu in [
            'SELECT user_id FROM public.memories',
            'SELECT ss.user_id FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id',
            'SELECT m.user_id FROM public.memory_images mi JOIN public.memories m ON m.id=mi.memory_id',
        ]:
            assert all(owner == kendi.user_id for owner in (await session.execute(text(sorgu))).scalars())
    await temiz_baglantiyi_kontrol_et(manager)


async def test_ayni_connection_a_b_commit_sonrasi_temiz(canli):
    manager, a, b = canli
    pidler = []
    for kullanici in [a, b, a, b]:
        async with manager.kullanici_oturumu(kullanici) as session:
            row = (await session.execute(text('SELECT pg_backend_pid(), auth.uid()'))).one()
            pidler.append(row[0])
            assert row[1] == kullanici.user_id
        await temiz_baglantiyi_kontrol_et(manager)
    assert len(set(pidler)) == 1  # pool_size=1, direct/session bağlantısı fiziksel yeniden kullanılır.


async def test_exception_rollback_sonrasi_temiz(canli):
    manager, a, b = canli
    with pytest.raises(RuntimeError):
        async with manager.kullanici_oturumu(a):
            raise RuntimeError('Kontrollü test hatası')
    await temiz_baglantiyi_kontrol_et(manager)
    async with manager.kullanici_oturumu(b) as session:
        assert (await session.execute(text('SELECT auth.uid()'))).scalar_one() == b.user_id


async def test_sql_exception_rollback_sonrasi_temiz(canli):
    manager, a, _ = canli
    with pytest.raises(SQLAlchemyError):
        async with manager.kullanici_oturumu(a) as session:
            await session.execute(text('SELECT 1 / 0'))
    await temiz_baglantiyi_kontrol_et(manager)


async def test_task_iptali_sonrasi_temiz(canli):
    manager, a, _ = canli
    with pytest.raises(asyncio.CancelledError):
        async with manager.kullanici_oturumu(a):
            raise asyncio.CancelledError()
    await temiz_baglantiyi_kontrol_et(manager)
