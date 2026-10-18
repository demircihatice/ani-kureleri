// Gerçek SQL, yerel PostgreSQL/PGlite. Canlı Supabase ve gerçek kullanıcı yok.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(), q=(s,p)=>db.query(s,p);
const oku=p=>readFile(new URL(p,import.meta.url),'utf8');
const id=n=>`17000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let count=0;
const esit=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const red=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);count++;};
async function user(uid,fn,backend=false){
  if(backend)await db.exec('SET SESSION AUTHORIZATION app_runtime');
  await db.exec('BEGIN');
  try{
    await q("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,role:'authenticated'})]);
    if(!backend)await db.exec('SET LOCAL ROLE authenticated');
    const value=await fn();await db.exec('COMMIT');return value;
  }catch(e){await db.exec('ROLLBACK');throw e;}
  finally{if(backend)await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');}
}
const command=(uid,mid,act,code=null,confidence=null,model=null,version=null)=>user(uid,async()=>
  (await q('SELECT ani_kureleri_private.analysis_command($1,$2,$3,$4,$5,$6) AS r',[mid,act,code,confidence,model,version])).rows[0].r,true);
const memory=async mid=>(await q('SELECT * FROM public.memories WHERE id=$1',[mid])).rows[0];
try{
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE app_runtime LOGIN NOINHERIT NOBYPASSRLS;
    GRANT authenticated TO app_runtime;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated,anon;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;`);
  for(const p of ['202610010001_asama3_tablolar_ve_rls.sql','202610010002_asama4_otomatik_baslangic.sql','202610010003_asama6_fotograflar_ve_storage.sql'])await db.exec(await oku('../../supabase/migrations/'+p));
  for(const p of ['20261016_02_emotions_up.sql','20261016_03_memory_requests_up.sql'])await db.exec(await oku('../sql/'+p));
  for(const n of [1,2])await q("INSERT INTO auth.users VALUES($1,now(),'{\"full_name\":\"Yerel test\"}')",[id(n)]);
  await db.exec(await oku('../sql/20261017_04_analysis_up.sql'));
  const insert=(uid,mid)=>user(uid,()=>q("INSERT INTO public.memories(id,title,image_url,memory_date,analysis_status) VALUES($1,'Test','path','2026-01-01','awaiting_nfc')",[mid]));
  await insert(id(1),id(10));
  await command(id(1),id(10),'nfc');await command(id(1),id(10),'processing');
  await command(id(1),id(10),'result','happiness',0.9,'local-old-fixture');
  const path=`${id(1)}/${id(10)}/0.jpg`;
  await q("INSERT INTO storage.objects(bucket_id,name) VALUES('ani-fotograflari',$1)",[path]);
  await user(id(1),()=>q('INSERT INTO public.memory_images(memory_id,storage_path,sort_order) VALUES($1,$2,0)',[id(10),path]));
  const before=await memory(id(10));
  const imagesBefore=(await q('SELECT * FROM public.memory_images')).rows;
  const up=await oku('../sql/20261017_05_final_emotions_up.sql');await db.exec(up);
  esit(await memory(id(10)),before,'Geçmiş tahmin dahil tüm anı alanları aynen korunur');
  esit((await q('SELECT * FROM public.memory_images')).rows,imagesBefore,'Fotoğraf UUID/yol/sıra aynen korunur');
  await red(()=>user(id(1),()=>q("UPDATE public.emotion_categories SET category_kind='model' WHERE code='alexithymia'")),'42501');
  const catalog=(await q('SELECT * FROM public.emotion_categories WHERE is_active ORDER BY sort_order')).rows;
  esit(catalog.map(e=>e.code),['anger','shame','joy','disgust','sadness','surprise','fear','alexithymia'],'Aktif katalog');
  esit(catalog.filter(e=>e.category_kind==='model').length,7,'Yalnız 7 model sınıfı');
  esit(catalog[7].category_kind,'fallback','Aleksitimi fallback');
  esit(catalog.map(e=>e.color_hex),['#E53935','#FB8C00','#FDD835','#43A047','#1E88E5','#1A237E','#8E24AA','#111111'],'Sabit renkler');
  const archived=(await q("SELECT code FROM public.emotion_categories WHERE category_kind='legacy' ORDER BY code")).rows;
  esit(archived.map(e=>e.code),['calm','happiness','love','nostalgia'],'Eski kategori kimlikleri silinmez');
  await user(id(1),()=>q("UPDATE public.memories SET title='Düzenlenebilir geçmiş' WHERE id=$1",[id(10)]));
  esit((await memory(id(10))).predicted_emotion_id,before.predicted_emotion_id,'Legacy metadata düzenlemesi tahmini bozmaz');
  await red(()=>db.exec(up),'P0001');
  for(const [n,code,fallback] of [[11,'joy',true],[12,'anger',false]]){
    await insert(id(1),id(n));
    await command(id(1),id(n),'nfc');await command(id(1),id(n),'processing');
    const run=(uid,c=code,f=fallback)=>user(uid,async()=>(await q('SELECT ani_kureleri_private.analysis_command($1,$2,$3,$4,$5,$6,$7) AS r',[id(n),'result',c,0.25,'local-unit',null,f])).rows[0].r,true);
    esit((await run(id(2))).error,'not_found','Yabancı sonuç yazımı engelli');
    for(const c of ['alexithymia','happiness','calm','nostalgia'])esit((await run(id(1),c)).error,'invalid_result','Yeni tahmin fallback veya legacy olamaz');
    await run(id(1));const m=await memory(id(n));
    const pred=catalog.find(e=>e.id===m.predicted_emotion_id), final=catalog.find(e=>e.id===m.final_emotion_id);
    esit(pred.code,code,'Yedi sınıftan asıl tahmin saklanır');
    esit([m.final_emotion_source,final.code],fallback?['fallback','alexithymia']:['model',code],'Final fallback ayrımı');
    esit(m.predicted_confidence,0.25,'Eşik uygulanmaz; worker kararı açıkça verilir');
    const fb=await command(id(1),id(n),'feedback',fallback?'sadness':'alexithymia',null,null,m.version);
    esit(fb.changed,true,'Kullanıcı final duyguyu düzeltebilir');
    const after=await memory(id(n));esit(after.predicted_emotion_id,m.predicted_emotion_id,'Düzeltme ilk tahmini değiştirmez');
    const snap=(await q('SELECT * FROM public.memory_feedback WHERE memory_id=$1',[id(n)])).rows[0];
    esit(snap.previous_final_emotion_id,m.final_emotion_id,'Fallback dahil önceki final snapshot');
    await red(()=>user(id(1),()=>q('UPDATE public.memories SET predicted_emotion_id=$1 WHERE id=$2',[catalog[7].id,id(n)])),'42501');
    await red(()=>user(id(2),()=>q("SELECT ani_kureleri_private.analysis_command($1,'nfc')",[id(n)])),'42501');
    esit((await user(id(2),()=>q('SELECT * FROM public.memories WHERE id=$1',[id(n)]))).rows.length,0,'RLS yabancı anı gizli');
  }
  await db.exec('BEGIN; SET LOCAL ROLE anon');
  try{await red(()=>q("SELECT ani_kureleri_private.analysis_command($1,'nfc')",[id(11)]),'42501');}finally{await db.exec('ROLLBACK');}
  // Sahip rolü de yanlış fallback/predicted tutarlılığı yazamaz.
  await insert(id(1),id(13));
  await red(()=>q("UPDATE public.memories SET analysis_status='completed',predicted_emotion_id=$1,predicted_confidence=0.4,model_version='unit',analyzed_at=now(),final_emotion_id=$1,final_emotion_source='model' WHERE id=$2",[catalog[7].id,id(13)]),'23514');
  await red(()=>q("UPDATE public.memories SET analysis_status='completed',predicted_emotion_id=$1,predicted_confidence=0.4,model_version='unit',analyzed_at=now(),final_emotion_id=$1,final_emotion_source='fallback' WHERE id=$2",[catalog[2].id,id(13)]),'23514');
  console.log(`${count} Aşama 17.1 PostgreSQL/kategori/fallback/RLS kontrolü geçti. Canlı DB kullanılmadı.`);
}catch(e){console.error({message:e.message,code:e.code,query:e.query?.slice(0,180)});process.exitCode=1;}finally{await db.close();}
