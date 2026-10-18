// Gerçek migration SQL'i, bellekte PostgreSQL/PGlite üzerinde. Canlı Supabase kullanılmaz.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const q = (sql, params) => db.query(sql, params);
const dosya = (ad) => readFile(new URL(ad, import.meta.url), 'utf8');
const up = await dosya('../sql/20261016_02_emotions_up.sql');
const down = await dosya('../sql/20261016_02_emotions_down.sql');
const id = n => `16000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let kontroller = 0;
const kontrol = (deger, mesaj) => { assert.ok(deger, mesaj); kontroller++; };
const esit = (a, b, mesaj) => { assert.deepEqual(a,b,mesaj); kontroller++; };
async function red(fn, code) {
  await assert.rejects(fn, e => e.code === code); kontroller++;
}
async function kullanici(user, fn, rol='authenticated') {
  await db.exec('begin');
  try {
    await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:user,role:rol})]);
    await db.exec(`set local role ${rol}`); // rol sabit test girdisi, HTTP girdisi değildir.
    const sonuc = await fn();
    await db.exec('commit');
    return sonuc;
  } catch (hata) { await db.exec('rollback'); throw hata; }
}
const anilar = [];
try {
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
  `);
  for (const ad of ['202610010001_asama3_tablolar_ve_rls.sql','202610010002_asama4_otomatik_baslangic.sql','202610010003_asama6_fotograflar_ve_storage.sql']) {
    await db.exec(await dosya('../../supabase/migrations/'+ad));
  }
  for (const u of [1,2]) {
    await q('insert into auth.users values($1,now(),$2)',[id(u),{full_name:'Yerel test'}]);
    const kureler = (await q('select s.* from public.spheres s join public.sphere_sets ss on ss.id=s.sphere_set_id where ss.user_id=$1 order by emotion_type',[id(u)])).rows;
    for (const [n,s] of kureler.entries()) {
      const memory=id(10*u+n);
      const path=`${id(u)}/${memory}/0.jpg`;
      await q("insert into public.memories(id,user_id,sphere_id,title,description,image_url,memory_date) values($1,$2,$3,'Eski anı','Korunacak metin',$4,'2022-05-20')",[memory,id(u),s.id,path]);
      await q('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,0)',[memory,path]);
      if (u===1 && s.emotion_type==='nostalji') {
        await q('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,1)',[memory,`${id(u)}/${memory}/1.jpg`]);
      }
      anilar.push({id:memory,user:id(u),sphere:s.id,legacy:s.emotion_type});
    }
  }
  const once = (await q('select id,to_jsonb(m) as row from public.memories m order by id')).rows;
  const imgOnce = (await q('select to_jsonb(mi) as row from public.memory_images mi order by id')).rows;
  // Geçerli FK'ye rağmen başka kullanıcı küresine bağlanmış bozuk legacy kayıt: sessiz backfill yok.
  await q('update public.memories set sphere_id=$1 where id=$2',[anilar[3].sphere,anilar[0].id]);
  await red(()=>db.exec(up),'P0001');
  esit((await q("select to_regclass('public.emotion_categories') as tablo")).rows[0].tablo,null,'Başarısız migration kısmi tablo bırakmadı');
  esit((await q('select sphere_id from public.memories where id=$1',[anilar[0].id])).rows[0].sphere_id,anilar[3].sphere,'Bozuk veri sessizce düzeltilmedi veya silinmedi');
  await q('update public.memories set sphere_id=$1 where id=$2',[anilar[0].sphere,anilar[0].id]);
  await db.exec(await dosya('../sql/emotions_preflight.sql'));
  await db.exec(up);
  await db.exec(await dosya('../sql/emotions_verify.sql'));
  const katalog = (await q('select * from public.emotion_categories order by sort_order')).rows;
  const cat = Object.fromEntries(katalog.map(k => [k.code,k.id]));
  esit(katalog.filter(k=>k.is_active).map(k=>k.code),['happiness','sadness','anger','fear','calm','surprise','love'],'Yedi aktif kategori doğru sırada');
  kontrol(katalog.find(k=>k.code==='nostalgia').is_active===false,'Legacy Nostalji pasif');
  esit(new Set(katalog.map(k=>k.code)).size,8,'Kodlar benzersiz');
  const yeniAlanlar=['analysis_status','predicted_emotion_id','predicted_confidence','final_emotion_id','final_emotion_source','analyzed_at','model_version','version'];
  const sonra=(await q('select * from public.memories order by id')).rows;
  esit((await q('select id,to_jsonb(m)-$1::text[] as row from public.memories m order by id',[yeniAlanlar])).rows,once,'UUID, sahip, başlık, metin, tarih, kapak yolu korundu');
  esit((await q('select to_jsonb(mi) as row from public.memory_images mi order by id')).rows,imgOnce,'Fotoğraf UUID/yol/sıra verisi korundu');
  for (const ani of anilar) {
    const m=sonra.find(m=>m.id===ani.id);
    const beklenen=katalog.find(k=>k.legacy_emotion_type===ani.legacy);
    esit(m.final_emotion_id,beklenen.id,'Her legacy duygu doğru taşındı');
    esit([m.analysis_status,m.final_emotion_source,m.predicted_emotion_id,m.predicted_confidence,m.analyzed_at,m.model_version],['not_required','legacy_manual',null,null,null,null],'Legacy kayıt AI tahmini değil');
  }
  await red(()=>db.exec(up),'P0001');
  await db.exec(down);
  esit((await q('select id,to_jsonb(m) as row from public.memories m order by id')).rows,once,'Hemen geri dönüş veri kaybettirmedi');
  await db.exec(up);
  const own=anilar.find(a=>a.user===id(1)&&a.legacy==='mutluluk');
  const other=anilar.find(a=>a.user===id(2));
  for (const user of [id(1),id(2)]) {
    await kullanici(user,async()=>{
      esit((await q('select code from public.emotion_categories where is_active order by sort_order')).rows.length,7,'Authenticated aktif kataloğu okur');
      kontrol((await q('select user_id from public.memories')).rows.every(m=>m.user_id===user),'Filtresiz SELECT sadece sahibi');
    });
    await red(()=>kullanici(user,()=>q("insert into public.emotion_categories(code,display_name_tr,color_hex,sort_order) values('fake','Sahte','#000000',9)")),'42501');
    await red(()=>kullanici(user,()=>q("update public.emotion_categories set display_name_tr='Sahte'")),'42501');
    await red(()=>kullanici(user,()=>q('delete from public.emotion_categories')),'42501');
  }
  await red(()=>q("update public.emotion_categories set code='changed' where id=$1",[cat.happiness]),'23514');
  await kullanici(id(1),async()=>{
    esit((await q('select id from public.memories where id=$1',[other.id])).rows.length,0,'Yabancı UUID okunamaz');
    esit((await q("update public.memories set title='İzinsiz' where id=$1 returning id",[other.id])).rows.length,0,'Yabancı güncellenemez');
    esit((await q('delete from public.memories where id=$1 returning id',[other.id])).rows.length,0,'Yabancı silinemez');
    const row=(await q("insert into public.memories(id,title,image_url,memory_date,sphere_id,analysis_status) values($1,'Bekleyen','path','2026-01-01',null,'awaiting_nfc') returning *",[id(99)])).rows[0];
    esit([row.user_id,row.sphere_id,row.final_emotion_id,row.final_emotion_source],[id(1),null,null,null],'Küresiz anı sahibine kaydedilir');
  });
  await kullanici(id(2),async()=>esit((await q('select id from public.memories where id=$1',[id(99)])).rows.length,0,'Küresiz yabancı anı gizli'));
  await kullanici(id(1),async()=>{
    await q('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,0)',[id(99),`${id(1)}/${id(99)}/0.jpg`]);
    esit((await q('select id from public.memory_images where memory_id=$1',[id(99)])).rows.length,1,'Küresiz anının fotoğrafını sahibi okur');
  });
  await kullanici(id(2),async()=>esit((await q('select id from public.memory_images where memory_id=$1',[id(99)])).rows.length,0,'Küresiz anının fotoğrafı yabancıya gizli'));
  await red(()=>kullanici(id(1),()=>q("insert into public.memories(user_id,title,image_url,memory_date,analysis_status) values($1,'Sahte','x','2026-01-01','awaiting_nfc')",[id(2)])),'42501');
  await red(()=>kullanici(id(1),()=>q('update public.memories set sphere_id=$1 where id=$2',[other.sphere,own.id])),'42501');
  await red(()=>kullanici(id(1),()=>q('update public.memories set predicted_emotion_id=$1 where id=$2',[cat.happiness,own.id])),'42501');
  await red(()=>kullanici(id(1),()=>q("insert into public.memories(title,image_url,memory_date,analysis_status,predicted_emotion_id) values('Sahte','x','2026-01-01','completed',$1)",[cat.happiness])),'42501');
  for (const score of [-0.01,1.01,Infinity,NaN]) {
    await red(()=>q("update public.memories set analysis_status='completed',predicted_emotion_id=$3,predicted_confidence=$1,analyzed_at=now(),model_version='test-v1',final_emotion_id=$3,final_emotion_source='model' where id=$2",[score,own.id,cat.happiness]),'23514');
  }
  for (const score of [0,1]) {
    await db.exec('begin');
    await q("update public.memories set analysis_status='completed',predicted_emotion_id=$3,predicted_confidence=$1,analyzed_at=now(),model_version='test-v1',final_emotion_id=$3,final_emotion_source='model' where id=$2",[score,own.id,cat.happiness]);
    esit((await q('select predicted_confidence from public.memories where id=$1',[own.id])).rows[0].predicted_confidence,score,'0 ve 1 confidence sınırları kabul edilir');
    await db.exec('rollback');
  }
  await red(()=>q("update public.memories set analysis_status='unknown' where id=$1",[own.id]),'23514');
  // Eski mobil küre değiştirme akışı yeni final alanını da günceller.
  const sad=anilar.find(a=>a.user===id(1)&&a.legacy==='huzun');
  await kullanici(id(1),async()=>{
    const row=(await q('update public.memories set sphere_id=$1 where id=$2 returning *',[sad.sphere,own.id])).rows[0];
    esit(row.final_emotion_id,cat.sadness,'Eski istemci final duygusunu günceller');
    esit(Number((await q('select count(*) as n from public.memories where sphere_id=$1',[own.sphere])).rows[0].n),0,'Eski küre sayacı bir azalır');
    esit(Number((await q('select count(*) as n from public.memories where sphere_id=$1',[sad.sphere])).rows[0].n),2,'Hedef eski küre sayacı bir artar');
    esit(Number(row.version),2,'Version otomatik artar');
    const newer=(await q('update public.memories set final_emotion_id=$1 where id=$2 returning *',[cat.love,own.id])).rows[0];
    esit([newer.final_emotion_id,newer.final_emotion_source,newer.sphere_id],[cat.love,'user',null],'Yeni kategoride eski küre bağı çözülür');
  });
  // İlk model çıktısı sadece yönetici test düzeneğinde oluşturulur; inference yoktur.
  await q("update public.memories set analysis_status='completed',predicted_emotion_id=$1,predicted_confidence=0.82,analyzed_at=now(),model_version='test-v1',final_emotion_id=$1,final_emotion_source='model' where id=$2",[cat.happiness,own.id]);
  await kullanici(id(1),()=>q('update public.memories set final_emotion_id=$1 where id=$2',[cat.sadness,own.id]));
  const predicted=(await q('select * from public.memories where id=$1',[own.id])).rows[0];
  esit([predicted.predicted_emotion_id,predicted.final_emotion_id,predicted.predicted_confidence],[cat.happiness,cat.sadness,0.82],'İlk tahmin ile kullanıcı düzeltmesi ayrı');
  await red(()=>q('update public.memories set predicted_emotion_id=$1 where id=$2',[cat.sadness,own.id]),'23514');
  await red(()=>q('update public.memories set predicted_confidence=0.1 where id=$1',[own.id]),'23514');
  await red(()=>kullanici(id(1),()=>q('update public.memories set version=77 where id=$1',[own.id])),'42501');
  // Feedback gelecekteki güvenilir yazarın alanlarını bile memory'den türetir.
  await q("insert into public.memory_feedback(user_id,memory_id,corrected_emotion_id,request_key,model_version,predicted_confidence) values($1,$2,$3,$4,'sahte',0.01)",[id(1),own.id,cat.love,id(400)]);
  const feedback=(await q('select * from public.memory_feedback')).rows[0];
  esit([feedback.predicted_emotion_id,feedback.previous_final_emotion_id,feedback.predicted_confidence,feedback.model_version],[cat.happiness,cat.sadness,0.82,'test-v1'],'Feedback snapshot istemciden alınmaz');
  await kullanici(id(1),async()=>esit((await q('select id from public.memory_feedback')).rows.length,1,'Kendi feedback kaydı okunur'));
  await kullanici(id(2),async()=>esit((await q('select id from public.memory_feedback')).rows.length,0,'Yabancı feedback gizli'));
  await red(()=>kullanici(id(1),()=>q('insert into public.memory_feedback(memory_id,corrected_emotion_id,request_key) values($1,$2,$3)',[own.id,cat.love,id(401)])),'42501');
  await red(()=>kullanici(id(1),()=>q('update public.memory_feedback set predicted_confidence=0.2')),'42501');
  await red(()=>q('update public.memory_feedback set predicted_confidence=0.2'),'23514');
  await red(()=>q('insert into public.memory_feedback(user_id,memory_id,corrected_emotion_id,request_key) values($1,$2,$3,$4)',[id(2),own.id,cat.love,id(402)]),'23514');
  const nostalgic=anilar.find(a=>a.user===id(1)&&a.legacy==='nostalji');
  await kullanici(id(1),async()=>{
    const path=`${id(1)}/${id(88)}/0.jpg`;
    await q("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[path]);
    await q("select public.ani_olustur($1,$2,'Eski mobil',null,'2026-01-01',$3::text[])",[id(88),nostalgic.sphere,[path]]);
    const m=(await q('select final_emotion_id,final_emotion_source from public.memories where id=$1',[id(88)])).rows[0];
    esit([m.final_emotion_id,m.final_emotion_source],[cat.nostalgia,'legacy_manual'],'Eski çoklu fotoğraf RPC akışı pasif legacy Nostalji ile çalışır');
  });
  await kullanici(id(1),()=>q('delete from public.spheres where id=$1',[nostalgic.sphere]));
  const retained=(await q('select sphere_id,final_emotion_id from public.memories where id=$1',[nostalgic.id])).rows[0];
  esit([retained.sphere_id,retained.final_emotion_id],[null,cat.nostalgia],'Küre silinse de eski Nostalji anısı kalır');
  esit((await q('select id from public.memory_images where memory_id=$1',[nostalgic.id])).rows.length,2,'Küre silinse de çoklu fotoğraf kalır');
  await red(()=>db.exec(down),'P0001');
  for (const table of ['memories','memory_images','memory_feedback','emotion_categories']) {
    await red(()=>kullanici(null,()=>q(`select * from public.${table}`),'anon'),'42501');
  }
  console.log(`${kontroller} Aşama 14 yerel PostgreSQL migration/RLS kontrolü geçti.`);
} catch (hata) {
  console.error('Aşama 14 yerel testi başarısız:',hata.message);
  process.exitCode=1;
} finally { await db.close(); }
