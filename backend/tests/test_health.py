import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Ayarlar
from app.main import create_app


async def test_health():
    ayarlar = Ayarlar(_env_file=None, supabase_url='https://test.supabase.co')
    uygulama = create_app(ayarlar)
    async with uygulama.router.lifespan_context(uygulama):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama),
                                     base_url='http://test') as istemci:
            yanit = await istemci.get('/health')
            assert yanit.status_code == 200
            assert yanit.json() == {'status': 'ok'}
            assert (await istemci.get('/v1/me')).status_code == 401


@pytest.mark.parametrize('ek', [
    {'supabase_url': 'http://test.supabase.co'},
    {'supabase_jwt_issuer': 'https://other.supabase.co/auth/v1'},
    {'supabase_jwt_audience': 'anon'},
    {'cors_origins': ['*']},
])
def test_guvensiz_ayar_reddedilir(ek):
    with pytest.raises(ValidationError):
        Ayarlar(_env_file=None, **({'supabase_url': 'https://test.supabase.co'} | ek))


async def test_cors():
    ayarlar = Ayarlar(_env_file=None, supabase_url='https://test.supabase.co',
                      cors_origins=['http://localhost:8081'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(ayarlar)),
                                 base_url='http://test') as istemci:
        izinli = await istemci.get('/health', headers={'Origin': 'http://localhost:8081'})
        assert izinli.headers['access-control-allow-origin'] == 'http://localhost:8081'
        yasak = await istemci.get('/health', headers={'Origin': 'https://other.example'})
        assert 'access-control-allow-origin' not in yasak.headers
