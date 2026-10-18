// Yeni idempotency migration'ının yerel PostgreSQL/RLS testi; canlı hesap/DB yok.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
const q=(sql,params)=>db.query(sql,params);
const oku=ad=>readFile(new URL(ad,import.meta.url),'utf8');
const id=n=>`15000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let count=0;
const kontrol=(value,msg)=>{assert.ok(value,msg);count++;};
async function red(fn,code){await assert.rejects(fn,e=>e.code===code);count++;}
async function user(uid,fn,role='authenticated'){
  await db.exec('begin');
  try{
    await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,role})]);
    await db.exec(`set local role ${role}`);
    const result=await fn();await db.exec('commit');return result;
  }catch(e){await db.exec('rollback');throw e;}
}
const insertMemory=mid=>q("insert into public.memories(id,title,image_url,memory_date,analysis_status) values($1,'Yeni','path','2026-01-01','awaiting_nfc')",[mid]);
try{
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
  `);
  for(const name of ['202610010001_asama3_tablolar_ve_rls.sql','202610010002_asama4_otomatik_baslangic.sql','202610010003_asama6_fotograflar_ve_storage.sql'])
    await db.exec(await oku('../../supabase/migrations/'+name));
  await db.exec(await oku('../sql/20261016_02_emotions_up.sql'));
  const up=await oku('../sql/20261016_03_memory_requests_up.sql');
  const down=await oku('../sql/20261016_03_memory_requests_down.sql');
  await db.exec(up);
  kontrol((await q("select relrowsecurity from pg_class where oid='public.memory_creation_requests'::regclass")).rows[0].relrowsecurity,'RLS açık');
  kontrol((await q("select count(*)::int as n from pg_policies where tablename='memory_creation_requests'")).rows[0].n===2,'SELECT/INSERT sahiplik politikaları');
  for(const n of [1,2])await q("insert into auth.users values($1,now(),'{\"full_name\":\"Yerel API testi\"}')",[id(n)]);
  await user(id(1),()=>insertMemory(id(10)));
  await user(id(2),()=>insertMemory(id(20)));
  await user(id(1),async()=>kontrol((await q("insert into public.memories(id,title,image_url,memory_date,analysis_status) values($1,'Çakışma','path','2026-01-01','awaiting_nfc') on conflict(id) do nothing returning id",[id(20)])).rows.length===0,'Gizli yabancı UUID çakışması veri döndürmez'));
  await user(id(1),()=>q('insert into public.memory_creation_requests(memory_id,user_id,payload_hash) values($1,$2,$3)',[id(10),id(1),'a'.repeat(64)]));
  await user(id(1),async()=>kontrol((await q('select * from public.memory_creation_requests')).rows.length===1,'Kendi özeti okunur'));
  await user(id(2),async()=>kontrol((await q('select * from public.memory_creation_requests')).rows.length===0,'Yabancı özet gizli'));
  await red(()=>user(id(2),()=>q('insert into public.memory_creation_requests(memory_id,user_id,payload_hash) values($1,$2,$3)',[id(10),id(2),'b'.repeat(64)])),'42501');
  await red(()=>user(id(1),()=>q('insert into public.memory_creation_requests(memory_id,user_id,payload_hash) values($1,$2,$3)',[id(20),id(1),'b'.repeat(64)])),'42501');
  await red(()=>user(id(1),()=>q('update public.memory_creation_requests set payload_hash=$1',['b'.repeat(64)])),'42501');
  await red(()=>user(id(1),()=>q('delete from public.memory_creation_requests')),'42501');
  await red(()=>q('update public.memory_creation_requests set payload_hash=$1',['b'.repeat(64)]),'23514');
  await red(()=>user(id(1),()=>q('insert into public.memory_creation_requests(memory_id,user_id,payload_hash) values($1,$2,$3)',[id(10),id(1),'a'.repeat(64)])),'23505');
  await red(()=>db.exec(up),'P0001');
  await red(()=>db.exec(down),'P0001');
  await red(()=>user(id(1),async()=>{
    await insertMemory(id(11));
    await q('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,0)',[id(11),`${id(1)}/${id(11)}/0.jpg`]);
    await q("insert into public.memory_creation_requests(memory_id,user_id,payload_hash) values($1,$2,'invalid')",[id(11),id(1)]);
  }),'23514');
  kontrol((await q('select id from public.memories where id=$1',[id(11)])).rows.length===0,'Hata: memory rollback');
  kontrol((await q('select id from public.memory_images where memory_id=$1',[id(11)])).rows.length===0,'Hata: image rollback');
  await user(id(1),()=>q("update public.memories set title='Düzenlendi' where id=$1",[id(10)]));
  await user(id(1),async()=>kontrol((await q("update public.memories set title='Eski version' where id=$1 and user_id=auth.uid() and version=1 returning id",[id(10)])).rows.length===0,'Stale version tek UPDATE ile engellenir'));
  kontrol((await q('select payload_hash from public.memory_creation_requests where memory_id=$1',[id(10)])).rows[0].payload_hash==='a'.repeat(64),'PATCH ilk özeti değiştirmedi');
  await red(()=>user(null,()=>q('select * from public.memory_creation_requests'),'anon'),'42501');
  await user(id(1),()=>q('delete from public.memories where id=$1',[id(10)]));
  kontrol((await q('select memory_id from public.memory_creation_requests')).rows.length===0,'Parent silinirse kişisel özet de silinir');
  await db.exec(down);
  kontrol((await q("select to_regclass('public.memory_creation_requests') as r")).rows[0].r===null,'Boşken güvenli downgrade');
  console.log(`${count} Aşama 15 yerel idempotency/RLS kontrolü geçti.`);
}catch(e){console.error('Yerel Aşama 15 testi başarısız:',e.message);process.exitCode=1;}
finally{await db.close();}
