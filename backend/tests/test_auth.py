import json
import time
from uuid import uuid4

import httpx
import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.core.auth import JwtDogrulayici
from app.core.config import Ayarlar
from app.main import create_app


@pytest_asyncio.fixture
async def duzen():
    ayarlar = Ayarlar(_env_file=None, supabase_url='https://test.supabase.co')
    anahtar = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(anahtar.public_key()))
    jwk.update(kid='test-key', alg='ES256', use='sig')
    durum = {'keys': [jwk], 'calls': 0, 'fail': False}

    def yanit(request):
        assert str(request.url) == ayarlar.jwks_url
        durum['calls'] += 1
        return httpx.Response(503 if durum['fail'] else 200, json={'keys': durum['keys']})

    async with httpx.AsyncClient(transport=httpx.MockTransport(yanit)) as ag:
        dogrulayici = JwtDogrulayici(ayarlar, ag)
        uygulama = create_app(ayarlar)
        uygulama.state.jwt_dogrulayici = dogrulayici
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=uygulama),
                                     base_url='http://test') as istemci:
            yield istemci, anahtar, durum, dogrulayici


def token_uret(anahtar, degisiklik=None, eksik=None, kid='test-key', alg='ES256'):
    claims = {'sub': str(uuid4()), 'iss': 'https://test.supabase.co/auth/v1',
              'aud': 'authenticated', 'role': 'authenticated', 'exp': int(time.time()) + 300}
    claims.update(degisiklik or {})
    if eksik:
        claims.pop(eksik)
    return jwt.encode(claims, anahtar, algorithm=alg, headers={'kid': kid})


async def iste(duzen, token):
    return await duzen[0].get('/v1/me', headers={'Authorization': 'Bearer ' + token})


async def test_gecerli_ve_cache(duzen):
    user_id = str(uuid4())
    token = token_uret(duzen[1], {'sub': user_id})
    for _ in range(2):
        yanit = await iste(duzen, token)
        assert yanit.status_code == 200
        assert yanit.json() == {'user_id': user_id}
    assert duzen[2]['calls'] == 1


@pytest.mark.parametrize('degisiklik', [
    {'exp': int(time.time()) - 60}, {'iss': 'https://other.supabase.co/auth/v1'},
    {'aud': 'anon'}, {'aud': ['authenticated', 'anon']}, {'sub': ''},
    {'sub': 'not-a-uuid'}, {'role': 'service_role'}, {'role': 'anon'},
    {'nbf': int(time.time()) + 600},
    {'exp': float('inf')},
])
async def test_gecersiz_claim(duzen, degisiklik):
    token = token_uret(duzen[1], degisiklik)
    yanit = await iste(duzen, token)
    assert yanit.status_code == 401
    assert yanit.headers['www-authenticate'] == 'Bearer'
    assert token not in yanit.text


@pytest.mark.parametrize('eksik', ['sub', 'exp', 'iss', 'aud', 'role'])
async def test_eksik_claim(duzen, eksik):
    assert (await iste(duzen, token_uret(duzen[1], eksik=eksik))).status_code == 401


async def test_yanlis_imza(duzen):
    baska = ec.generate_private_key(ec.SECP256R1())
    assert (await iste(duzen, token_uret(baska))).status_code == 401


@pytest.mark.parametrize('token', ['abc', '', 'a' * 17000])
async def test_bozuk_token(duzen, token):
    assert (await iste(duzen, token)).status_code == 401


async def test_hs256_ve_none_reddedilir(duzen):
    for alg, anahtar in [('HS256', 'only-for-tests-' * 4), ('none', None)]:
        assert (await iste(duzen, token_uret(anahtar, alg=alg))).status_code == 401
    assert duzen[2]['calls'] == 0


async def test_kimlik_queryden_alinmaz(duzen):
    user_id = str(uuid4())
    token = token_uret(duzen[1], {'sub': user_id})
    yanit = await duzen[0].get('/v1/me?user_id=' + str(uuid4()),
                               headers={'Authorization': 'Bearer ' + token})
    assert yanit.json() == {'user_id': user_id}


async def test_rotation_ve_eski_anahtarin_kaldirilmasi(duzen):
    eski = token_uret(duzen[1])
    assert (await iste(duzen, eski)).status_code == 200
    yeni = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(yeni.public_key()))
    jwk.update(kid='new-key', alg='ES256')
    duzen[2]['keys'] = [jwk]
    duzen[3].son_deneme -= 11
    assert (await iste(duzen, token_uret(yeni, kid='new-key'))).status_code == 200
    assert (await iste(duzen, eski)).status_code == 401
    assert duzen[2]['calls'] == 2


async def test_bilinmeyen_kid_ag_cagrisi_sinirli(duzen):
    for i in range(5):
        assert (await iste(duzen, token_uret(duzen[1], kid=str(i)))).status_code == 401
    assert duzen[2]['calls'] == 1


async def test_jwks_kesintisi_kabul_edilmez(duzen):
    duzen[2]['fail'] = True
    assert (await iste(duzen, token_uret(duzen[1]))).status_code == 503


async def test_suresi_dolmus_cache_kullanilmaz(duzen):
    token = token_uret(duzen[1])
    assert (await iste(duzen, token)).status_code == 200
    duzen[3].son_yenileme -= 301
    duzen[3].son_deneme -= 11
    duzen[2]['fail'] = True
    assert (await iste(duzen, token)).status_code == 503


async def test_rs256(duzen):
    anahtar = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(anahtar.public_key()))
    jwk.update(kid='rsa-key', alg='RS256')
    duzen[2]['keys'] = [jwk]
    assert (await iste(duzen, token_uret(anahtar, kid='rsa-key', alg='RS256'))).status_code == 200
