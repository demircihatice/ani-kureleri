from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.schemas.auth import DogrulanmisKullanici

router = APIRouter()


@router.get('/v1/me', response_model=DogrulanmisKullanici)
async def me(kullanici: Annotated[DogrulanmisKullanici, Depends(get_current_user)]):
    return kullanici
