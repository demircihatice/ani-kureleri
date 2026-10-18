from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from io import StringIO
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from alembic import command
from alembic.config import Config

from app.core.config import Ayarlar
from app.db.models import EmotionCategory, Memory
from app.main import create_app
from app.schemas.memory import MemoryAnalysisRead
from tests.test_auth import duzen, token_uret


class KatalogSession:
    def __init__(self, satirlar):
        self.satirlar = satirlar

    async def scalars(self, sorgu):
        sql = str(sorgu.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        assert 'WHERE public.emotion_categories.is_active IS true' in sql
        assert 'ORDER BY public.emotion_categories.sort_order' in sql
        return SimpleNamespace(all=lambda: sorted(
            [s for s in self.satirlar if s.is_active], key=lambda s: s.sort_order))


async def test_api_yedi_aktif_nostalji_yok_ve_db_sirasi(duzen):
    # Kategori seed'i üretim kodunda yalnızca migration SQL'inde bulunur.
    codes = ['anger','shame','joy','disgust','sadness','surprise','fear','alexithymia','nostalgia']
    satirlar = [EmotionCategory(id=uuid4(),code=c,display_name_tr='Test',color_hex='#ABCDEF',
                                sort_order=i,is_active=c!='nostalgia',category_kind='legacy' if c=='nostalgia' else 'fallback' if c=='alexithymia' else 'model') for i,c in enumerate(codes)]
    @asynccontextmanager
    async def session(kullanici):
        yield KatalogSession(list(reversed(satirlar)))

    app = create_app(Ayarlar(_env_file=None,supabase_url='https://test.supabase.co'))
    app.state.jwt_dogrulayici = duzen[3]
    app.state.db = SimpleNamespace(kullanici_oturumu=session)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as istemci:
        assert (await istemci.get('/v1/emotions')).status_code == 401
        yanit = await istemci.get('/v1/emotions',headers={'Authorization':'Bearer '+token_uret(duzen[1])})
        assert yanit.status_code == 200
        veri = yanit.json()
        assert len(veri) == 8
        assert [r['code'] for r in veri] == codes[:-1]
        assert len({r['code'] for r in veri}) == 8
        assert set(veri[0]) == {'id','code','display_name_tr','color_hex','sort_order','category_kind'}


async def test_emotions_gecersiz_token_ve_db_yok(duzen):
    app = create_app(Ayarlar(_env_file=None,supabase_url='https://test.supabase.co'))
    app.state.jwt_dogrulayici = duzen[3]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as istemci:
        assert (await istemci.get('/v1/emotions',headers={'Authorization':'Bearer invalid'})).status_code == 401
        assert (await istemci.get('/v1/emotions',headers={'Authorization':'Bearer '+token_uret(duzen[1])})).status_code == 503


def legacy():
    return dict(analysis_status='not_required',final_emotion_id=uuid4(),final_emotion_source='legacy_manual',version=1)


def test_legacy_tahmin_degil():
    model = MemoryAnalysisRead(**legacy())
    assert model.predicted_emotion_id is None
    assert model.predicted_confidence is None


@pytest.mark.parametrize('deger', [-0.1,1.1,float('inf'),float('nan')])
def test_confidence_sinir(deger):
    with pytest.raises(ValidationError):
        MemoryAnalysisRead(**(legacy() | {'predicted_confidence':deger}))


@pytest.mark.parametrize('ek', [
    {'analysis_status':'unknown'}, {'analysis_status':'completed'}, {'version':0},
    {'final_emotion_id':None}, {'final_emotion_source':'fake'}, {'predicted_emotion_id':uuid4()},
])
def test_gecersiz_state(ek):
    with pytest.raises(ValidationError):
        MemoryAnalysisRead(**(legacy() | ek))


def test_completed_ile_kullanici_duygusu_ayri():
    tahmin,son = uuid4(),uuid4()
    model = MemoryAnalysisRead(analysis_status='completed',predicted_emotion_id=tahmin,
        predicted_confidence=0.82,analyzed_at=datetime.now(timezone.utc),model_version='test-v1',
        final_emotion_id=son,final_emotion_source='user',version=2)
    assert model.predicted_emotion_id != model.final_emotion_id
    with pytest.raises(ValidationError):
        MemoryAnalysisRead(**(model.model_dump() | {'final_emotion_source':'model'}))


def test_orm_kuresiz_ve_version_sunucuda():
    assert Memory.__table__.c.sphere_id.nullable
    assert Memory.__mapper__.version_id_col is Memory.__table__.c.version
    assert Memory.__mapper__.version_id_generator is False


def test_offline_revision_sql_yuzde_ve_migration_sirasi():
    cikti = StringIO()
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'), output_buffer=cikti)
    command.upgrade(config,'20261012_01:20261016_02',sql=True)
    sql = cikti.getvalue()
    assert 'DO $migration$' in sql
    assert '%%' not in sql
    assert 'ON DELETE SET NULL' in sql
    assert 'DROP TABLE public.spheres' not in sql
    assert "SET version_num='20261016_02'" in sql
