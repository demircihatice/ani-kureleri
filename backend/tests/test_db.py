import json
import asyncio
from io import StringIO
from pathlib import Path
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from alembic import command
from alembic.config import Config

from app.core.config import Ayarlar
from app.db.baseline import autogenerate_engelle, include_name
from app.db.context import (
    DbGuvenlikHatasi, UID_COALESCE, UID_JSON, kullanici_baglamini_kur,
    runtime_rolunu_dogrula, uid_tanimini_dogrula,
)
from app.db.session import OturumYonetici, db_url_dogrula, engine_olustur
from app.main import create_app
from app.schemas.auth import DogrulanmisKullanici
from tests.test_auth import duzen, token_uret  # Bağımsız imzalı JWT ve mock JWKS fixture'ı.


def guvenli_rol():
    return dict(rolname='app_runtime', rolcanlogin=True, temiz_rol=True, uye=True,
                rolsuper=False, rolbypassrls=False, rolcreaterole=False, rolcreatedb=False,
                rolreplication=False, rolinherit=False, fazla_uyelik=False, sahip=False,
                sema_olusturma=False, admin_uyelik=False, miras=False)


@pytest.mark.parametrize('alan', ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb',
                                 'rolreplication', 'rolinherit', 'fazla_uyelik', 'sahip', 'sema_olusturma',
                                 'admin_uyelik', 'miras'])
def test_yetkili_runtime_reddedilir(alan):
    kayit = guvenli_rol()
    kayit[alan] = True
    with pytest.raises(DbGuvenlikHatasi):
        runtime_rolunu_dogrula(kayit)


@pytest.mark.parametrize('degisiklik', [{'rolname': 'postgres'}, {'temiz_rol': False},
                                      {'uye': False}, {'rolcanlogin': False}])
def test_runtime_rol_kimligi(degisiklik):
    with pytest.raises(DbGuvenlikHatasi):
        runtime_rolunu_dogrula(guvenli_rol() | degisiklik)


def test_kisitli_rol_kabul():
    runtime_rolunu_dogrula(guvenli_rol())


@pytest.mark.parametrize('body', [UID_JSON, UID_COALESCE])
def test_uid_tanimi_desteklenir(body):
    uid_tanimini_dogrula({'prosrc': body, 'prosecdef': False, 'lanname': 'sql'})


@pytest.mark.parametrize('degisiklik', [
    {'prosrc': "select current_setting('request.jwt.claim.sub', true)::uuid"},
    {'prosrc': 'select null::uuid'}, {'prosecdef': True}, {'lanname': 'plpgsql'},
    {'prosrc': "select coalesce(current_setting('request.jwt.claim.sub', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))::uuid"},
])
def test_bilinmeyen_legacy_uid_tahmin_edilmez(degisiklik):
    with pytest.raises(DbGuvenlikHatasi):
        uid_tanimini_dogrula({'prosrc': UID_JSON, 'prosecdef': False, 'lanname': 'sql'} | degisiklik)


@pytest.mark.parametrize('adres', [
    'postgresql+asyncpg://postgres:test@localhost:5432/postgres',
    'postgresql+asyncpg://service_role:test@localhost:5432/postgres',
    'postgresql+asyncpg://app_runtime:test@localhost:6543/postgres',
    'postgresql://app_runtime:test@localhost:5432/postgres',
    'postgresql+asyncpg://app_runtime@localhost:5432/postgres',
    'postgresql+asyncpg://app_runtime:test@localhost:5432/postgres?sslmode=disable',
    'not-a-url',
])
def test_gecersiz_db_url(adres):
    with pytest.raises(DbGuvenlikHatasi) as hata:
        db_url_dogrula(adres)
    assert adres not in str(hata.value)


def test_runtime_migration_ayri():
    adres = 'postgresql+asyncpg://app_runtime:test@localhost:5432/postgres'
    db_url_dogrula(adres)
    db_url_dogrula('postgresql+asyncpg://app_runtime.ref:test@localhost:5432/postgres')
    with pytest.raises(DbGuvenlikHatasi):
        db_url_dogrula(adres, migration=True)


async def test_engine_ag_acmaz_ve_guvenli_ayarlar():
    ayarlar = Ayarlar(_env_file=None, supabase_url='https://test.supabase.co',
                      database_runtime_url='postgresql+asyncpg://app_runtime:test@localhost:5432/postgres',
                      database_migration_url='postgresql+asyncpg://migrator:test@localhost:5432/postgres')
    engine = engine_olustur(ayarlar)
    assert engine.sync_engine.hide_parameters and not engine.echo
    assert engine.pool.size() == 2 and engine.pool.checkedout() == 0
    assert 'test@' not in repr(ayarlar)
    migration = engine_olustur(ayarlar, migration=True)
    assert isinstance(migration.pool, NullPool)
    await engine.dispose()
    await migration.dispose()


def test_sistem_semalari_autogenerate_disinda():
    for name in ['auth', 'storage', 'extensions', 'realtime', 'supabase_functions']:
        assert not include_name(name, 'schema', {})
    assert include_name('memories', 'table', {'schema_name': 'public'})
    assert not include_name('unknown_table', 'table', {'schema_name': 'public'})
    assert not include_name('memories', 'table', {'schema_name': 'auth'})
    with pytest.raises(DbGuvenlikHatasi):
        autogenerate_engelle(SimpleNamespace(config=SimpleNamespace(
            cmd_opts=SimpleNamespace(autogenerate=True))), None, [])


def test_baseline_offline_uygulama_tablolarina_dokunmaz():
    cikti = StringIO()
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'), output_buffer=cikti)
    command.upgrade(config, 'head', sql=True)
    sql = cikti.getvalue()
    assert 'CREATE TABLE public.alembic_version' in sql
    assert 'DROP' not in sql
    for tablo in ['profiles', 'sphere_sets', 'spheres', 'memories', 'memory_images', 'auth.', 'storage.']:
        assert tablo not in sql


class Sonuc:
    def __init__(self, value):
        self.value = value

    def mappings(self):
        return self

    def one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value


class SahteSession:
    def __init__(self, *, temiz=True, esit=True):
        self.calls = []
        self.temiz = temiz
        self.esit = esit
        self.acik = True

    def in_transaction(self):
        return self.acik

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.calls.append((sql, params))
        if 'FROM pg_roles r WHERE r.rolname = session_user' in sql:
            return Sonuc(guvenli_rol())
        if "WHERE rolname = 'authenticated'" in sql:
            return Sonuc(dict(rolsuper=False, rolbypassrls=False, rolcreaterole=False,
                              rolcreatedb=False, rolreplication=False, sahip=False, uye=False))
        if 'p.prosrc' in sql:
            return Sonuc(dict(prosrc=UID_COALESCE, prosecdef=False, lanname='sql'))
        if 'AS temiz' in sql:
            return Sonuc(self.temiz)
        return Sonuc(self.esit)


async def test_context_sadece_transaction_local_tek_kimlik():
    session = SahteSession()
    kullanici = DogrulanmisKullanici(user_id=uuid4())
    await kullanici_baglamini_kur(session, kullanici)
    sql, params = next(c for c in session.calls if 'set_config(' in c[0])
    assert "set_config('request.jwt.claims', :claims, true)" in sql
    assert "set_config('request.jwt.claim.sub', '', true)" in sql
    assert json.loads(params['claims']) == {'sub': str(kullanici.user_id), 'role': 'authenticated'}
    assert ('SET LOCAL ROLE authenticated', None) in session.calls
    assert str(kullanici.user_id) not in sql  # UUID parametre olarak gönderilir.


async def test_acik_transaction_zorunlu():
    session = SahteSession()
    session.acik = False
    with pytest.raises(DbGuvenlikHatasi):
        await kullanici_baglamini_kur(session, DogrulanmisKullanici(user_id=uuid4()))
    assert not session.calls


@pytest.mark.parametrize('temiz,esit', [(False, True), (True, False)])
async def test_kirli_ve_eslesmeyen_baglam_reddedilir(temiz, esit):
    with pytest.raises(DbGuvenlikHatasi):
        await kullanici_baglamini_kur(SahteSession(temiz=temiz, esit=esit),
                                     DogrulanmisKullanici(user_id=uuid4()))


@pytest.mark.parametrize('token_turu', ['eksik', 'bozuk', 'expired'])
async def test_jwt_olmadan_db_session_acilmaz(duzen, token_turu):
    ayarlar = Ayarlar(_env_file=None, supabase_url='https://test.supabase.co', db_check_enabled=True)
    uygulama = create_app(ayarlar)
    uygulama.state.jwt_dogrulayici = duzen[3]
    manager = SimpleNamespace(kullanici_oturumu=AsyncMock())
    uygulama.state.db = manager
    headers = {}
    if token_turu != 'eksik':
        token = 'invalid' if token_turu == 'bozuk' else token_uret(duzen[1], {'exp': 1})
        headers['Authorization'] = 'Bearer ' + token
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama), base_url='http://test') as istemci:
        assert (await istemci.get('/v1/db-check', headers=headers)).status_code == 401
    manager.kullanici_oturumu.assert_not_called()


async def test_query_body_kimlik_ve_rolu_degistiremez(duzen):
    user_id = uuid4()
    gelen = []

    @asynccontextmanager
    async def session(kullanici):
        gelen.append(kullanici.user_id)
        yield SahteSession()

    uygulama = create_app(Ayarlar(_env_file=None, supabase_url='https://test.supabase.co', db_check_enabled=True))
    uygulama.state.jwt_dogrulayici = duzen[3]
    uygulama.state.db = SimpleNamespace(kullanici_oturumu=session)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama), base_url='http://test') as istemci:
        yanit = await istemci.request('GET', '/v1/db-check?user_id=' + str(uuid4()) + '&role=postgres',
            json={'user_id': str(uuid4()), 'role': 'service_role'},
            headers={'Authorization': 'Bearer ' + token_uret(duzen[1], {'sub': str(user_id)})})
    assert yanit.json() == {'database': 'ok', 'user_context': True}
    assert gelen == [user_id]


async def test_db_check_production_kapali():
    uygulama = create_app(Ayarlar(_env_file=None, supabase_url='https://test.supabase.co',
                                  app_env='production', db_check_enabled=True))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama), base_url='http://test') as istemci:
        assert (await istemci.get('/v1/db-check')).status_code == 404


@pytest.mark.parametrize('sonradan', [False, True])
async def test_db_hatasi_secret_dondurmez(duzen, sonradan):
    @asynccontextmanager
    async def hatali(kullanici):
        if sonradan:
            yield SahteSession()
        raise SQLAlchemyError('TEST_SECRET_CONNECTION_STRING')

    uygulama = create_app(Ayarlar(_env_file=None, supabase_url='https://test.supabase.co', db_check_enabled=True))
    uygulama.state.jwt_dogrulayici = duzen[3]
    uygulama.state.db = SimpleNamespace(kullanici_oturumu=hatali)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama), base_url='http://test') as istemci:
        yanit = await istemci.get('/v1/db-check', headers={
            'Authorization': 'Bearer ' + token_uret(duzen[1])})
    assert yanit.status_code == 503
    assert 'TEST_SECRET' not in yanit.text


async def test_db_yok_eski_endpointler_calismaya_devam(duzen):
    uygulama = create_app(Ayarlar(_env_file=None, supabase_url='https://test.supabase.co', db_check_enabled=True))
    uygulama.state.jwt_dogrulayici = duzen[3]
    token = token_uret(duzen[1])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama), base_url='http://test') as istemci:
        assert (await istemci.get('/health')).status_code == 200
        assert (await istemci.get('/v1/me', headers={'Authorization': 'Bearer ' + token})).status_code == 200
        assert (await istemci.get('/v1/db-check', headers={'Authorization': 'Bearer ' + token})).status_code == 503


@pytest.mark.parametrize('hata', [None, RuntimeError, DbGuvenlikHatasi, asyncio.CancelledError])
async def test_session_commit_rollback_ve_invalidate(monkeypatch, hata):
    olaylar = []

    class Session(SahteSession):
        @asynccontextmanager
        async def begin(self):
            olaylar.append('begin')
            try:
                yield
            except BaseException:
                olaylar.append('rollback')
                raise
            else:
                olaylar.append('commit')

        async def invalidate(self):
            olaylar.append('invalidate')

    @asynccontextmanager
    async def factory():
        try:
            yield Session()
        finally:
            olaylar.append('close')

    manager = OturumYonetici.__new__(OturumYonetici)
    manager.sessions = factory
    monkeypatch.setattr('app.db.session.kullanici_baglamini_kur', AsyncMock())
    try:
        async with manager.kullanici_oturumu(DogrulanmisKullanici(user_id=uuid4())):
            if hata:
                raise hata('test')
    except (RuntimeError, DbGuvenlikHatasi, asyncio.CancelledError):
        assert hata is not None
    assert olaylar == ['begin', 'rollback' if hata else 'commit'] + (
        ['invalidate'] if hata is DbGuvenlikHatasi else []) + ['close']
