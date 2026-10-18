from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.repositories import memory_repository as repo


class Db:
    def __init__(self):
        self.statements=[]

    async def scalars(self,statement):
        self.statements.append(statement)
        return SimpleNamespace(one_or_none=lambda:None,all=lambda:[])

    async def execute(self,statement,params=None):
        self.statements.append(statement)


def derle(statement):
    result=statement.compile(dialect=postgresql.dialect())
    return str(result),result.params


async def test_repository_sahiplik_filtreleri_siralama_ve_sayfalama():
    db=Db()
    uid,mid,eid=uuid4(),uuid4(),uuid4()
    await repo.aniyi_bul(db,uid,mid)
    sql,params=derle(db.statements[-1])
    assert 'WHERE public.memories.id =' in sql and 'public.memories.user_id =' in sql
    assert uid in params.values() and mid in params.values()
    await repo.anilari_listele(db,uid,2,20,eid)
    sql,params=derle(db.statements[-1])
    assert 'public.memories.final_emotion_id =' in sql
    assert 'ORDER BY public.memories.memory_date DESC, public.memories.created_at DESC, public.memories.id DESC' in sql
    assert uid in params.values() and eid in params.values()
    assert db.statements[-1]._limit_clause.value == 21
    assert db.statements[-1]._offset_clause.value == 20
    assert 'joy' in params.values() and 'happiness' in params.values()
    await repo.fotograflari_getir(db,uid,[mid])
    sql,params=derle(db.statements[-1])
    assert 'JOIN public.memories' in sql and 'WHERE public.memories.user_id =' in sql
    assert 'public.memory_images.sort_order' in sql


async def test_repository_insert_ai_alanlarini_yazmaz():
    db=Db()
    uid,mid=uuid4(),uuid4()
    veri=SimpleNamespace(id=mid,title='Test',description=None,memory_date=date(2026,1,1),storage_paths=[f'{uid}/{mid}/0.jpg'])
    await repo.aniyi_ekle(db,uid,veri)
    sql,params=derle(db.statements[-1])
    columns=sql.split('VALUES')[0]
    for field in ['predicted_emotion_id','predicted_confidence','final_emotion_id','final_emotion_source','model_version','version']:
        assert field not in columns
    assert params['user_id']==uid and params['sphere_id'] is None
    assert params['analysis_status']=='awaiting_nfc'
    assert 'ON CONFLICT (id) DO NOTHING' in sql
    await repo.kayit_kilidi(db,mid)
    assert str(db.statements[-1])=='SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(:id,0))'


async def test_repository_patch_version_ve_user_tek_update():
    db=Db()
    uid,mid=uuid4(),uuid4()
    await repo.aniyi_guncelle(db,uid,mid,3,{'title':'Yeni'})
    sql,params=derle(db.statements[-1])
    assert 'public.memories.user_id =' in sql and 'public.memories.version =' in sql
    assert uid in params.values() and 3 in params.values()
    assert sql.startswith('UPDATE public.memories SET title=')
    assert 'version=' not in sql.split('WHERE')[0]


async def test_storage_sadece_select_ve_bucket_yol_suzer():
    db=Db()
    paths=['test-path']
    await repo.yuklenen_yollari_getir(db,paths)
    sql,params=derle(db.statements[-1])
    assert sql.startswith('SELECT storage.objects.name')
    assert 'storage.objects.bucket_id =' in sql and 'storage.objects.name IN' in sql
    assert 'ani-fotograflari' in params.values()
