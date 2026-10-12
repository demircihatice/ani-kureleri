from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import db_check, health, me
from app.core.auth import JwtDogrulayici
from app.core.config import Ayarlar
from app.db.session import OturumYonetici


def create_app(ayarlar: Ayarlar | None = None) -> FastAPI:
    ayarlar = ayarlar or Ayarlar()

    @asynccontextmanager
    async def lifespan(uygulama: FastAPI):
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as istemci:
            uygulama.state.jwt_dogrulayici = JwtDogrulayici(ayarlar, istemci)
            uygulama.state.db = OturumYonetici(ayarlar) if ayarlar.database_runtime_url else None
            try:
                yield
            finally:
                if uygulama.state.db is not None:
                    await uygulama.state.db.kapat()

    uygulama = FastAPI(title='Anı Küreleri API', lifespan=lifespan,
                       docs_url=None, redoc_url=None, openapi_url=None)
    uygulama.add_middleware(
        CORSMiddleware, allow_origins=ayarlar.cors_origins,
        allow_methods=['GET'], allow_headers=['Authorization'], allow_credentials=False,
    )
    uygulama.include_router(health.router)
    uygulama.include_router(me.router)
    if ayarlar.db_check_enabled and ayarlar.app_env != 'production':
        uygulama.include_router(db_check.router)
    return uygulama


if __name__ == '__main__':
    ayarlar = Ayarlar()
    uvicorn.run(create_app(ayarlar), host=ayarlar.app_host, port=ayarlar.app_port,
                access_log=False)
