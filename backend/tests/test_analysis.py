from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import ValidationError
from app.main import create_app
from app.core.config import Ayarlar
from app.repositories import analysis_repository as repo
from app.schemas.analysis import FeedbackCreate
from app.services.analysis_service import AnalysisResult, apply_analysis_result
from tests.test_memories import api
from tests.test_auth import duzen


@pytest.fixture
async def analysis_api(api, monkeypatch):
    jobs, calls = {}, []

    async def job(db, user, mid):
        return jobs.get(mid)

    async def command(db, mid, action, **kw):
        calls.append((mid, action, kw))
        m = api.store.memories.get(mid)
        if not m or m.user_id != db.user_id:
            return {'error': 'not_found'}
        if action in ('nfc', 'development_simulation'):
            if m.analysis_status in ('queued', 'processing'):
                return {'changed': False}
            if m.analysis_status != 'awaiting_nfc':
                return {'error': 'conflict'}
            m.analysis_status = 'queued'
            m.version += 1
            jobs[mid] = SimpleNamespace(id=uuid4(), trigger_source=action, error_code=None)
            return {'changed': True}
        return {'error': 'conflict'}

    monkeypatch.setattr(repo, 'son_isi_getir', job)
    monkeypatch.setattr(repo, 'komut', command)
    api.calls = calls
    return api


@pytest.mark.parametrize('method,path,body', [
    ('GET', 'analysis', None), ('POST', 'analysis/start', {}),
    ('POST', 'emotion-feedback', {'corrected_emotion_code': 'sadness', 'expected_version': 1}),
])
async def test_auth_ve_yabanci_id(analysis_api, method, path, body):
    a = analysis_api
    m = a.store.ekle(a.b)
    url = f'/v1/memories/{m.id}/{path}'
    assert (await a.client.request(method, url, json=body)).status_code == 401
    assert (await a.client.request(method, url, json=body, headers=a.headers)).status_code == 404
    assert not a.calls


async def test_durum_ve_idempotent_start(analysis_api):
    a = analysis_api
    m = a.store.ekle(a.a)
    url = f'/v1/memories/{m.id}/analysis'
    assert (await a.client.get(url, headers=a.headers)).json()['status'] == 'awaiting_nfc'
    r = await a.client.post(url + '/start', json={}, headers=a.headers)
    assert r.status_code == 200 and r.json()['status'] == 'queued'
    assert (await a.client.post(url + '/start', json={}, headers=a.headers)).json() == r.json()
    assert m.predicted_emotion_id is None and m.final_emotion_id is None


@pytest.mark.parametrize('field', ['predicted_emotion_id', 'predicted_confidence', 'user_id', 'model_version', 'final_emotion_id', 'use_fallback'])
async def test_model_alanlari_request_ile_yazilamaz(analysis_api, field):
    a = analysis_api
    m = a.store.ekle(a.a)
    for path, body in [('analysis/start', {}), ('emotion-feedback', {'corrected_emotion_code': 'sadness', 'expected_version': 1})]:
        r = await a.client.post(f'/v1/memories/{m.id}/{path}', json=body | {field: 'evil'}, headers=a.headers)
        assert r.status_code == 422
    assert not a.calls


async def test_completed_olmayan_feedback_409(analysis_api):
    a = analysis_api
    m = a.store.ekle(a.a)
    r = await a.client.post(f'/v1/memories/{m.id}/emotion-feedback', headers=a.headers,
        json={'corrected_emotion_code': 'sadness', 'expected_version': 1})
    assert r.status_code == 409


@pytest.mark.parametrize('env,enabled,expected', [
    ('production', True, 404), ('production', False, 404), ('development', False, 404), ('test', True, 401),
])
async def test_simulasyon_ortam_kilidi(env, enabled, expected):
    app = create_app(Ayarlar(_env_file=None, supabase_url='https://test.supabase.co', app_env=env, analysis_simulation_enabled=enabled))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as c:
        assert (await c.post(f'/v1/memories/{uuid4()}/analysis/simulate-trigger', json={})).status_code == expected
        assert (await c.post(f'/v1/memories/{uuid4()}/analysis/result', json={})).status_code == 404


@pytest.mark.parametrize('data', [
    {'corrected_emotion_code': 'fake!', 'expected_version': 1},
    {'corrected_emotion_code': 'disgust', 'expected_version': True},
    {'corrected_emotion_code': 'disgust', 'expected_version': 0},
])
def test_feedback_dto(data):
    with pytest.raises(ValidationError):
        FeedbackCreate.model_validate(data)


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -0.1, 1.1])
def test_internal_sonuc_guven_araligi(value):
    with pytest.raises(ValidationError):
        AnalysisResult(emotion_code='joy', confidence=value, model_version='test')


async def test_internal_result_servisi(monkeypatch):
    command = AsyncMock(return_value={'changed': True})
    monkeypatch.setattr(repo, 'komut', command)
    db, mid = object(), uuid4()
    await apply_analysis_result(db, mid, AnalysisResult(emotion_code='joy', confidence=0.82, model_version='test'))
    command.assert_awaited_once_with(db, mid, 'result', code='joy', confidence=0.82, model='test', fallback=False)


async def test_repository_rolu_geri_koyar():
    class Db:
        def __init__(self): self.sql, self.expired = [], False
        async def execute(self, sql, params=None):
            self.sql.append(str(sql))
            return SimpleNamespace(scalar_one=lambda: {'changed': True})
        def expire_all(self): self.expired = True
    db = Db()
    await repo.komut(db, uuid4(), 'nfc')
    assert db.sql[0] == 'SET LOCAL ROLE app_runtime'
    assert db.sql[-1] == 'SET LOCAL ROLE authenticated'
    assert db.expired

async def test_feedback_http_model_alanlarini_korumali(analysis_api, monkeypatch):
    from datetime import datetime, timezone
    a = analysis_api
    happy = SimpleNamespace(id=uuid4(),code='joy',display_name_tr='Neşe',color_hex='#FFEEDD',sort_order=1,category_kind='model',is_active=True)
    sad = SimpleNamespace(id=uuid4(),code='sadness',display_name_tr='Üzüntü',color_hex='#DDEEFF',sort_order=2,category_kind='model',is_active=True)
    a.store.emotions = {happy.id:happy,sad.id:sad}
    m = a.store.ekle(a.a)
    m.analysis_status='completed';m.predicted_emotion_id=happy.id;m.final_emotion_id=happy.id
    m.predicted_confidence=0.82;m.model_version='fixture';m.analyzed_at=datetime.now(timezone.utc);m.final_emotion_source='model'
    calls=[]
    async def command(db,mid,action,**kw):
        calls.append((mid,action,kw))
        m.final_emotion_id=sad.id;m.final_emotion_source='user';m.version+=1
        return {'changed':True,'feedback_id':str(uuid4())}
    monkeypatch.setattr(repo,'komut',command)
    r=await a.client.post(f'/v1/memories/{m.id}/emotion-feedback',headers=a.headers,
        json={'corrected_emotion_code':'sadness','expected_version':1})
    assert r.status_code==200
    data=r.json()['analysis']
    assert data['predicted_emotion']['code']=='joy' and data['final_emotion']['code']=='sadness'
    assert data['predicted_confidence']==0.82 and data['model_version']=='fixture'
    assert calls==[(m.id,'feedback',{'code':'sadness','expected':1})]


async def test_simulasyon_authenticated_sadece_queue(analysis_api, duzen):
    from contextlib import asynccontextmanager
    a=analysis_api;m=a.store.ekle(a.a)
    @asynccontextmanager
    async def session(user):
        yield SimpleNamespace(user_id=user.user_id)
    app=create_app(Ayarlar(_env_file=None,supabase_url='https://test.supabase.co',app_env='test',analysis_simulation_enabled=True))
    app.state.jwt_dogrulayici=duzen[3];app.state.db=SimpleNamespace(kullanici_oturumu=session)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
        r=await c.post(f'/v1/memories/{m.id}/analysis/simulate-trigger',json={},headers=a.headers)
    assert r.status_code==200 and r.json()['status']=='queued'
    assert r.json()['predicted_emotion'] is None and r.json()['final_emotion'] is None
    assert a.calls[0][1]=='development_simulation'
