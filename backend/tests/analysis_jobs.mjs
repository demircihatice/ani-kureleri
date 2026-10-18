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
  const insert=(uid,mid)=>user(uid,()=>q("INSERT INTO public.memories(id,title,image_url,memory_date,analysis_status) VALUES($1,'Test','path','2026-01-01','awaiting_nfc')",[mid]));
  await insert(id(1),id(10));
  const up=await oku('../sql/20261017_04_analysis_up.sql'); await db.exec(up);
  esit((await q('SELECT status FROM public.analysis_jobs WHERE memory_id=$1',[id(10)])).rows[0].status,'awaiting_nfc','Backfill');
  await db.exec(await oku('../sql/20261017_04_analysis_down.sql')); await db.exec(up);
  await insert(id(2),id(20)); await insert(id(1),id(11));
  esit((await q('SELECT count(*)::int AS n FROM public.analysis_jobs')).rows[0].n,3,'Trigger tek iş');
  esit((await user(id(1),()=>q('SELECT * FROM public.analysis_jobs'))).rows.length,2,'RLS kendi işler');
  esit((await command(id(2),id(10),'nfc')).error,'not_found','Yabancı ID');
  esit((await command(id(2),id(999),'nfc')).error,'not_found','Bilinmeyen ID');
  await red(()=>user(id(1),()=>q("UPDATE public.analysis_jobs SET status='completed'")),'42501');
  await red(()=>user(id(1),()=>q("INSERT INTO public.analysis_jobs(memory_id,user_id,status) VALUES($1,$2,'queued')",[id(10),id(1)])),'42501');
  await red(()=>user(id(1),()=>q('DELETE FROM public.analysis_jobs')),'42501');
  await red(()=>user(id(1),()=>q("SELECT ani_kureleri_private.analysis_command($1,'nfc')",[id(10)])),'42501');
  await db.exec('BEGIN; SET LOCAL ROLE anon');
  try{await assert.rejects(q('SELECT * FROM public.analysis_jobs'),e=>e.code==='42501');count++;}finally{await db.exec('ROLLBACK');}
  const start=await command(id(1),id(10),'development_simulation');
  esit((await memory(id(10))).analysis_status,'queued','awaiting → queued');
  const again=await command(id(1),id(10),'nfc'); esit(again.job_id,start.job_id,'İkinci tetik aynı iş'); esit(again.changed,false,'No-op');
  esit((await q('SELECT count(*)::int AS n FROM public.analysis_jobs WHERE memory_id=$1',[id(10)])).rows[0].n,1,'Tek aktif iş');
  await red(()=>q("INSERT INTO public.analysis_jobs(memory_id,user_id,status) VALUES($1,$2,'queued')",[id(10),id(1)]),'23505');
  esit((await command(id(1),id(11),'feedback','sadness',null,null,1)).error,'conflict','Tamamlanmadan feedback yok');
  esit((await command(id(1),id(10),'result','happiness',0.82,'test-v1')).error,'conflict','Processing öncesi sonuç yok');
  await command(id(1),id(10),'processing');
  esit((await memory(id(10))).analysis_status,'processing','queued → processing');
  esit((await command(id(1),id(10),'result','fake',0.82,'test-v1')).error,'invalid_result','Geçersiz duygu');
  esit((await command(id(1),id(10),'result','happiness',1.2,'test-v1')).error,'invalid_result','Geçersiz güven');
  await command(id(1),id(10),'result','happiness',0.82,'test-v1');
  let m=await memory(id(10)); const first=m.predicted_emotion_id;
  esit([m.analysis_status,m.final_emotion_source,m.final_emotion_id],['completed','model',first],'İlk model → final');
  esit((await command(id(1),id(10),'result','sadness',0.9,'v2')).error,'conflict','İlk tahmin overwrite yok');
  await red(()=>user(id(1),()=>q('UPDATE public.memories SET predicted_confidence=0.1 WHERE id=$1',[id(10)])),'42501');
  await red(()=>user(id(1),()=>q('UPDATE public.memories SET final_emotion_id=$1 WHERE id=$2',[first,id(10)])),'42501');
  const kure=(await q('SELECT s.id FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id WHERE ss.user_id=$1 LIMIT 1',[id(1)])).rows[0].id;
  await red(()=>user(id(1),()=>q('UPDATE public.memories SET sphere_id=$1 WHERE id=$2',[kure,id(10)])),'42501');
  esit((await command(id(1),id(10),'feedback','nostalgia',null,null,m.version)).error,'invalid_emotion','Pasif duygu yok');
  esit((await command(id(1),id(10),'feedback','sadness',null,null,m.version+1)).error,'conflict','Version korunur');
  const changed=await command(id(1),id(10),'feedback','sadness',null,null,m.version); esit(changed.changed,true,'Düzeltme');
  let rows=(await q('SELECT * FROM public.memory_feedback WHERE memory_id=$1 ORDER BY created_at,id',[id(10)])).rows;
  esit(rows.length,1,'Tek feedback'); esit([rows[0].predicted_emotion_id,rows[0].previous_final_emotion_id,rows[0].model_version,rows[0].predicted_confidence],[first,first,'test-v1',0.82],'Snapshot DB kaynağı');
  m=await memory(id(10)); esit([m.predicted_emotion_id,m.final_emotion_source],[first,'user'],'Predicted korunur');
  esit((await command(id(1),id(10),'feedback','sadness',null,null,m.version)).changed,false,'Aynı final no-op');
  esit((await q('SELECT count(*)::int AS n FROM public.memory_feedback')).rows[0].n,1,'Duplicate yok');
  const previous=m.final_emotion_id;
  await command(id(1),id(10),'feedback','calm',null,null,m.version);
  rows=(await q('SELECT * FROM public.memory_feedback WHERE memory_id=$1 ORDER BY created_at,id',[id(10)])).rows;
  esit(rows.length,2,'Geçmiş korunur'); esit(rows[1].previous_final_emotion_id,previous,'Önceki final');
  m=await memory(id(10)); esit(m.predicted_emotion_id,first,'İkinci düzeltmede de tahmin korunur');
  esit((await user(id(2),()=>q('SELECT * FROM public.memory_feedback'))).rows.length,0,'Yabancı feedback gizli');
  await red(()=>q('UPDATE public.memories SET predicted_confidence=0.2 WHERE id=$1',[id(10)]),'23514');
  // Feedback INSERT başarılı olsa bile final UPDATE hatası tüm komutu geri alır.
  await db.exec(`CREATE FUNCTION public.test_feedback_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Yerel rollback testi' USING ERRCODE='23514'; END $$;
    CREATE TRIGGER zz_test_feedback_fail BEFORE UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION public.test_feedback_fail();`);
  await red(()=>command(id(1),id(10),'feedback','fear',null,null,m.version),'23514');
  esit((await q('SELECT count(*)::int AS n FROM public.memory_feedback')).rows[0].n,2,'Feedback transaction rollback');
  esit((await memory(id(10))).final_emotion_id,m.final_emotion_id,'Final rollback');
  await db.exec('DROP TRIGGER zz_test_feedback_fail ON public.memories; DROP FUNCTION public.test_feedback_fail()');
  await red(()=>command(null,id(10),'nfc'),'42501');
  await red(()=>user(id(1),()=>q('DELETE FROM public.memory_feedback')),'42501');
  await command(id(1),id(11),'failed','model_unavailable'); esit((await memory(id(11))).analysis_status,'failed','Başarısız durum');
  await red(()=>db.exec(up),'P0001'); await red(async()=>db.exec(await oku('../sql/20261017_04_analysis_down.sql')),'P0001');
  console.log(`${count} Aşama 17 PostgreSQL/RLS kontrolü geçti. Canlı DB kullanılmadı.`);
}catch(e){console.error({message:e.message,code:e.code,query:e.query?.slice(0,180)});process.exitCode=1;}finally{await db.close();}

