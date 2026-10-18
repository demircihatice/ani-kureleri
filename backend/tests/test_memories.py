from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Ayarlar
from app.main import create_app
from app.repositories import memory_repository as repo
from app.schemas.memory import MemoryCreate, MemoryPatch
from tests.test_auth import duzen, token_uret


def test_kayit_ve_duzenleme_gelecek_tarihi_reddeder():
    bugun = datetime.now(timezone(timedelta(hours=3))).date()
    mid = uuid4()
    for tarih in (bugun - timedelta(days=1), bugun, bugun + timedelta(days=1)):
        for sema, alanlar in (
            (MemoryCreate, dict(id=mid, title='Anı', storage_paths=[f'{uuid4()}/{mid}/0.jpg'])),
            (MemoryPatch, dict(version=1)),
        ):
            if tarih > bugun:
                with pytest.raises(ValidationError, match='bugünden sonra'):
                    sema(**alanlar, memory_date=tarih.isoformat())
            else:
                assert sema(**alanlar, memory_date=tarih.isoformat()).memory_date == tarih


class Bellek:
    """Unit testi deposu. PostgreSQL veya gerçek RLS kanıtı değildir."""
    def __init__(self):
        self.memories = {}
        self.images = []
        self.hashes = {}
        self.storage = set()
        self.emotions = {}
        self.fail_images = False
        self.lose_update = False
        self.calls = []

    def ekle(self,user_id,*,memory_id=None,emotion=None,images=2,legacy=False):
        mid = memory_id or uuid4()
        fields = dict(id=mid,user_id=user_id,sphere_id=None,title='Bir anı',description='Açıklama',
            image_url=f'{user_id}/{mid}/0.jpg',memory_date=date(2025,1,2),created_at=datetime.now(timezone.utc),
            analysis_status='not_required' if legacy else 'awaiting_nfc',predicted_emotion_id=None,
            predicted_confidence=None,final_emotion_id=emotion,final_emotion_source='legacy_manual' if legacy else None,
            analyzed_at=None,model_version=None,version=1)
        self.memories[mid] = SimpleNamespace(**fields)
        for i in reversed(range(images)):
            self.images.append(SimpleNamespace(memory_id=mid,storage_path=f'{user_id}/{mid}/{i}.jpg',sort_order=i))
        return self.memories[mid]

    async def aniyi_bul(self,db,user_id,memory_id):
        assert db.user_id == user_id
        m = self.memories.get(memory_id)
        return m if m and m.user_id == user_id else None

    async def aktif_duyguyu_bul(self,db,code):
        return next((e for e in self.emotions.values() if e.code==code and e.is_active),None)

    async def anilari_listele(self,db,user_id,page,page_size,emotion_id):
        assert db.user_id == user_id
        self.calls.append(('list',user_id,emotion_id))
        rows = [m for m in self.memories.values() if m.user_id==user_id and (emotion_id is None or m.final_emotion_id==emotion_id)]
        rows.sort(key=lambda m:(m.memory_date,m.created_at,m.id),reverse=True)
        return rows[(page-1)*page_size:(page-1)*page_size+page_size+1]

    async def fotograflari_getir(self,db,user_id,ids):
        return [p for p in self.images if p.memory_id in ids and self.memories[p.memory_id].user_id==user_id]

    async def duygulari_getir(self,db,ids):
        return {eid:e for eid,e in self.emotions.items() if eid in ids}

    async def kayit_kilidi(self,db,memory_id):
        self.calls.append(('lock',memory_id))

    async def ilk_istek_ozeti(self,db,user_id,memory_id):
        return self.hashes.get((user_id,memory_id))

    async def yuklenen_yollari_getir(self,db,paths):
        return self.storage.intersection(paths)

    async def aniyi_ekle(self,db,user_id,veri):
        if veri.id in self.memories:
            return None
        row = self.ekle(user_id,memory_id=veri.id,images=0)
        row.title,row.description,row.memory_date = veri.title,veri.description,veri.memory_date
        return row

    async def fotograf_ve_ozeti_ekle(self,db,user_id,veri,ozet):
        if self.fail_images:
            raise SQLAlchemyError('DATABASE_SECRET_AND_SQL_MUST_NOT_LEAK')
        self.images.extend(SimpleNamespace(memory_id=veri.id,storage_path=p,sort_order=i)
                           for i,p in enumerate(veri.storage_paths))
        self.hashes[(user_id,veri.id)] = ozet

    async def aniyi_guncelle(self,db,user_id,memory_id,version,degisiklik):
        row = await self.aniyi_bul(db,user_id,memory_id)
        if self.lose_update or row is None or row.version!=version:
            return None
        assert set(degisiklik) <= {'title','description','memory_date'}
        for key,value in degisiklik.items():
            setattr(row,key,value)
        row.version += 1
        return row


@pytest_asyncio.fixture
async def api(duzen,monkeypatch):
    store = Bellek()
    for name in ['aniyi_bul','aktif_duyguyu_bul','anilari_listele','fotograflari_getir','duygulari_getir',
                 'kayit_kilidi','ilk_istek_ozeti','yuklenen_yollari_getir','aniyi_ekle','fotograf_ve_ozeti_ekle','aniyi_guncelle']:
        monkeypatch.setattr(repo,name,getattr(store,name))
    a,b = uuid4(),uuid4()
    @asynccontextmanager
    async def session(kullanici):
        once = deepcopy((store.memories,store.images,store.hashes))
        try:
            yield SimpleNamespace(user_id=kullanici.user_id)
        except BaseException:
            store.memories,store.images,store.hashes = once
            raise
    app = create_app(Ayarlar(_env_file=None,supabase_url='https://test.supabase.co'))
    app.state.jwt_dogrulayici = duzen[3]
    app.state.db = SimpleNamespace(kullanici_oturumu=session)
    headers = {'Authorization':'Bearer '+token_uret(duzen[1],{'sub':str(a)})}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        yield SimpleNamespace(client=client,headers=headers,store=store,a=a,b=b)


def payload(api):
    mid = uuid4()
    paths = [f'{api.a}/{mid}/{i}.jpg' for i in range(2)]
    api.store.storage.update(paths)
    return {'id':str(mid),'title':' Yeni anı ','description':' metin ','memory_date':'2025-02-03','storage_paths':paths}


@pytest.mark.parametrize('method,path', [('GET',''),('GET','/00000000-0000-4000-8000-000000000001'),
                                       ('POST',''),('PATCH','/00000000-0000-4000-8000-000000000001')])
async def test_tokensiz_memory_401(api,method,path):
    assert (await api.client.request(method,'/v1/memories'+path,json={} if method!='GET' else None)).status_code==401


async def test_baska_user_ve_olmayan_id_ayni_404(api):
    other = api.store.ekle(api.b)
    one = await api.client.get('/v1/memories/'+str(other.id),headers=api.headers)
    two = await api.client.get('/v1/memories/'+str(uuid4()),headers=api.headers)
    assert one.status_code==two.status_code==404 and one.json()==two.json()
    assert (await api.client.patch('/v1/memories/'+str(other.id),headers=api.headers,
                                   json={'version':1,'title':'Saldırı'})).status_code==404


async def test_baska_hesabin_uuid_ile_post_icerik_aciklamaz(api):
    other=api.store.ekle(api.b)
    veri=payload(api)
    veri['id']=str(other.id)
    veri['storage_paths']=[f'{api.a}/{other.id}/0.jpg']
    api.store.storage.update(veri['storage_paths'])
    r=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert r.status_code==404 and r.json()=={'detail':'Anı bulunamadı.'}
    assert api.store.memories[other.id].user_id==api.b


async def test_liste_sahip_sira_sayfalama(api):
    rows = [api.store.ekle(api.a) for _ in range(3)]
    rows[0].memory_date=date(2023,1,1)
    api.store.ekle(api.b)
    r = await api.client.get('/v1/memories?page_size=2',headers=api.headers)
    assert r.status_code==200
    assert len(r.json()['items'])==2 and r.json()['has_more']
    assert [x['id'] for x in r.json()['items']]==[str(rows[2].id),str(rows[1].id)]
    r2 = await api.client.get('/v1/memories?page=2&page_size=2',headers=api.headers)
    assert [x['id'] for x in r2.json()['items']]==[str(rows[0].id)]
    assert not r2.json()['has_more']


async def test_duygu_filtresi_legacy_detay(api):
    for code,active in [('joy',True),('nostalgia',False)]:
        e=SimpleNamespace(id=uuid4(),code=code,display_name_tr='Test',color_hex='#ABCDEF',sort_order=1,category_kind='model' if active else 'legacy',is_active=active)
        api.store.emotions[e.id]=e
        api.store.ekle(api.a,emotion=e.id,legacy=True)
    r=await api.client.get('/v1/memories?emotion=joy',headers=api.headers)
    assert len(r.json()['items'])==1 and r.json()['items'][0]['final_emotion']['code']=='joy'
    for code in ['fake','nostalgia','invalid!']:
        assert (await api.client.get('/v1/memories?emotion='+code,headers=api.headers)).status_code==422
    nostalgic=next(m for m in api.store.memories.values() if api.store.emotions[m.final_emotion_id].code=='nostalgia')
    detail=await api.client.get('/v1/memories/'+str(nostalgic.id),headers=api.headers)
    assert detail.json()['final_emotion']['code']=='nostalgia'
    assert detail.json()['final_emotion']['is_active'] is False


@pytest.mark.parametrize('ek', [{'user_id':'fake'}, {'sphere_id':None}, {'predicted_emotion_id':None},
                              {'analysis_status':'completed'},{'final_emotion_id':None},{'model_version':'evil'},
                              {'predicted_confidence':0.8}])
async def test_post_server_alanlari_kabul_edilmez(api,ek):
    r=await api.client.post('/v1/memories',headers=api.headers,json=payload(api)|ek)
    assert r.status_code==422 and not api.store.memories


async def test_post_awaiting_nfc_coklu_fotograf_ve_idempotency(api):
    veri=payload(api)
    r=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert r.status_code==201
    body=r.json()
    assert body['user_id']==str(api.a) and body['sphere_id'] is None
    assert body['analysis_status']=='awaiting_nfc'
    assert all(body[k] is None for k in ['predicted_emotion_id','predicted_confidence','final_emotion_id',
                                       'final_emotion_source','analyzed_at','model_version'])
    assert body['title']=='Yeni anı'
    assert [p['storage_path'] for p in body['photos']]==veri['storage_paths']
    replay=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert replay.status_code==200 and replay.json()==body
    assert len(api.store.memories)==1 and len(api.store.images)==2
    conflict=await api.client.post('/v1/memories',headers=api.headers,json=veri|{'title':'Başka içerik'})
    assert conflict.status_code==409 and len(api.store.memories)==1


async def test_patch_ve_degistirilmis_kayitta_ilk_post_retry(api):
    veri=payload(api)
    await api.client.post('/v1/memories',headers=api.headers,json=veri)
    r=await api.client.patch('/v1/memories/'+veri['id'],headers=api.headers,
        json={'version':1,'title':'Düzenlenen','description':None,'memory_date':'2024-03-04'})
    assert r.status_code==200
    assert (r.json()['title'],r.json()['description'],r.json()['memory_date'],r.json()['version'])==('Düzenlenen',None,'2024-03-04',2)
    retry=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert retry.status_code==200 and retry.json()['title']=='Düzenlenen'
    assert retry.json()['version']==2


@pytest.mark.parametrize('alan', ['user_id','sphere_id','analysis_status','predicted_emotion_id',
                                 'predicted_confidence','final_emotion_id','model_version','storage_paths'])
async def test_patch_izinli_alanlar_disindakiler_reddedilir(api,alan):
    own=api.store.ekle(api.a)
    r=await api.client.patch('/v1/memories/'+str(own.id),headers=api.headers,
        json={'version':1,'title':'Yeni',alan:'evil'})
    assert r.status_code==422 and api.store.memories[own.id].version==1


async def test_patch_optimistic_conflict(api):
    own=api.store.ekle(api.a)
    r=await api.client.patch('/v1/memories/'+str(own.id),headers=api.headers,json={'version':2,'title':'Yeni'})
    assert r.status_code==409
    api.store.lose_update=True
    r=await api.client.patch('/v1/memories/'+str(own.id),headers=api.headers,json={'version':1,'title':'Yeni'})
    assert r.status_code==409 and api.store.memories[own.id].title=='Bir anı'


async def test_fotograf_sirasi_kapak_ve_yabanci_path_suzulur(api):
    own=api.store.ekle(api.a,images=3)
    api.store.images.append(SimpleNamespace(memory_id=own.id,storage_path=f'{api.b}/{own.id}/4.jpg',sort_order=4))
    r=await api.client.get('/v1/memories/'+str(own.id),headers=api.headers)
    assert [p['sort_order'] for p in r.json()['photos']]==[0,1,2]
    assert r.json()['cover']['sort_order']==0
    assert all(str(api.b) not in p['storage_path'] for p in r.json()['photos'])


async def test_yeniden_siralanan_dosya_adlari_kaybolmaz(api):
    own=api.store.ekle(api.a,images=2)
    for image in api.store.images:
        image.sort_order=1-image.sort_order
    r=await api.client.get('/v1/memories/'+str(own.id),headers=api.headers)
    assert len(r.json()['photos'])==2
    assert r.json()['cover']['storage_path'].endswith('/1.jpg')


async def test_legacy_ham_url_ve_yabanci_kapak_cevaba_sizmaz(api):
    own=api.store.ekle(api.a,images=0)
    own.image_url='https://other.example/private?token=must-not-leak'
    r=await api.client.get('/v1/memories/'+str(own.id),headers=api.headers)
    assert r.status_code==200 and r.json()['cover'] is None
    assert r.json()['photos']==[] and 'image_url' not in r.json()
    assert 'must-not-leak' not in r.text


@pytest.mark.parametrize('tip', ['foreign','url','order','duplicate','missing'])
async def test_gecersiz_storage(api,tip):
    veri=payload(api)
    if tip=='foreign': veri['storage_paths'][0]=veri['storage_paths'][0].replace(str(api.a),str(api.b))
    if tip=='url': veri['storage_paths'][0]='https://example.test/image.jpg'
    if tip=='order': veri['storage_paths'].reverse()
    if tip=='duplicate': veri['storage_paths'][1]=veri['storage_paths'][0]
    if tip=='missing': api.store.storage.clear()
    r=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert r.status_code==422 and not api.store.memories


async def test_fotograf_db_hatasinda_transaction_geri_alinir(api):
    veri=payload(api)
    api.store.fail_images=True
    r=await api.client.post('/v1/memories',headers=api.headers,json=veri)
    assert r.status_code==503 and 'DATABASE_SECRET' not in r.text
    assert not api.store.memories and not api.store.images and not api.store.hashes
    assert set(veri['storage_paths']) <= api.store.storage  # Belirsiz sonuçta backend dosya silmez.


@pytest.mark.parametrize('ek', [{'title':None},{'title':' '},{'memory_date':None},{'memory_date':123},
                              {'memory_date':'2025-02-30'},{'version':True}])
def test_patch_null_tarih_ve_baslik(ek):
    with pytest.raises(ValidationError):
        MemoryPatch.model_validate({'version':1,'title':'İyi'}|ek)


async def test_bos_liste_ve_invalid_sayfa(api):
    r=await api.client.get('/v1/memories',headers=api.headers)
    assert r.json()['items']==[] and not r.json()['has_more']
    for query in ['page=0','page_size=101','user_id=other']:
        assert (await api.client.get('/v1/memories?'+query,headers=api.headers)).status_code==422

async def test_galeri_liste_tum_fotograflari_sirali_ve_sahiplik_filtreli_dondurur(api):
    own = api.store.ekle(api.a,images=3)
    api.store.ekle(api.b,images=2)
    r = await api.client.get('/v1/memories',headers=api.headers)
    assert r.status_code == 200
    assert len(r.json()['items']) == 1
    item = r.json()['items'][0]
    assert item['id'] == str(own.id)
    assert [photo['sort_order'] for photo in item['photos']] == [0,1,2]
    assert all(photo['storage_path'].startswith(str(api.a)+'/') for photo in item['photos'])
