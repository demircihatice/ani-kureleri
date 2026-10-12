"""Supabase JWKS ile doğrulama; token veya claim içerikleri loglanmaz."""

import asyncio
import time
from typing import Annotated
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Ayarlar
from app.schemas.auth import DogrulanmisKullanici

bearer = HTTPBearer(auto_error=False)


class JwtDogrulayici:
    def __init__(self, ayarlar: Ayarlar, istemci: httpx.AsyncClient):
        self.ayarlar = ayarlar
        self.istemci = istemci
        self.anahtarlar: dict[str, jwt.PyJWK] = {}
        self.son_yenileme = float('-inf')
        self.son_deneme = float('-inf')
        self.kilit = asyncio.Lock()

    async def anahtari_al(self, kid: str) -> jwt.PyJWK:
        async with self.kilit:
            simdi = time.monotonic()
            eski = simdi - self.son_yenileme >= 300
            # Bilinmeyen kid yenilemeyi tetikler; saldırgan sınırsız ağ isteği üretemez.
            if (eski or kid not in self.anahtarlar) and simdi - self.son_deneme >= 10:
                self.son_deneme = simdi
                try:
                    yanit = await self.istemci.get(self.ayarlar.jwks_url)
                    yanit.raise_for_status()
                    kayitlar = yanit.json()['keys']
                    yeni = {}
                    for kayit in kayitlar:
                        if (kayit.get('alg') in ('ES256', 'RS256')
                                and kayit.get('use', 'sig') == 'sig'
                                and 'verify' in kayit.get('key_ops', ['verify'])):
                            yeni[kayit['kid']] = jwt.PyJWK.from_dict(kayit)
                    self.anahtarlar = yeni
                    self.son_yenileme = simdi
                except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, jwt.PyJWTError):
                    raise HTTPException(503, 'Kimlik doğrulama hizmetine şu anda erişilemiyor.') from None
            if simdi - self.son_yenileme >= 300:
                raise HTTPException(503, 'Kimlik doğrulama hizmetine şu anda erişilemiyor.')
            if kid not in self.anahtarlar:
                raise jwt.InvalidTokenError()
            return self.anahtarlar[kid]

    async def dogrula(self, token: str) -> DogrulanmisKullanici:
        try:
            if len(token) > 16384:
                raise jwt.InvalidTokenError()
            # Header yalnızca anahtar seçer; kimlik bilgisi olarak kullanılmaz.
            baslik = jwt.get_unverified_header(token)
            alg = baslik.get('alg')
            kid = baslik.get('kid')
            if alg not in ('ES256', 'RS256') or not isinstance(kid, str) or not kid or len(kid) > 256:
                raise jwt.InvalidTokenError()
            anahtar = await self.anahtari_al(kid)
            if anahtar.algorithm_name != alg:
                raise jwt.InvalidTokenError()
            claims = jwt.decode(
                token, anahtar.key, algorithms=[anahtar.algorithm_name],
                issuer=self.ayarlar.supabase_jwt_issuer,
                audience=self.ayarlar.supabase_jwt_audience,
                options={'require': ['exp', 'iss', 'aud', 'sub', 'role'], 'strict_aud': True},
            )
            if claims['role'] != 'authenticated':
                raise jwt.InvalidTokenError()
            return DogrulanmisKullanici(user_id=UUID(claims['sub']))
        except (jwt.PyJWTError, ValueError, TypeError, AttributeError, OverflowError):
            raise HTTPException(
                401, 'Geçerli bir kullanıcı oturumu gerekli.',
                headers={'WWW-Authenticate': 'Bearer'},
            ) from None


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> DogrulanmisKullanici:
    if credentials is None:
        raise HTTPException(401, 'Oturum gerekli.', headers={'WWW-Authenticate': 'Bearer'})
    return await request.app.state.jwt_dogrulayici.dogrula(credentials.credentials)
