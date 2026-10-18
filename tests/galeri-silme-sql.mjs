// Yalnız sentetik verilerle yerel PostgreSQL; canlı kullanıcı veya Storage yok.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=id(1),b=id(2);
for(const yeniSema of [false,true]){
 const db=new PGlite();const sorgu=(s,p)=>db.query(s,p);
 async function rol(uid,role='authenticated'){await db.exec('reset role');await sorgu("select set_config('request.jwt.claim.sub',$1,false)",[uid??'']);await db.exec(`set role ${role}`);}
 try{
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create role app_runtime nologin noinherit nobypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
  `);
  const dosya = (ad) => readFile(new URL(`../supabase/migrations/${ad}`,import.meta.url),'utf8');
  await db.exec(await dosya('202610010001_asama3_tablolar_ve_rls.sql'));
  await db.exec(await dosya('202610010002_asama4_otomatik_baslangic.sql'));
  const migration = await dosya('202610010003_asama6_fotograflar_ve_storage.sql');
  await db.exec(migration); await db.exec(migration);
  await sorgu("insert into auth.users values ($1,now(),'{\"full_name\":\"Test A\"}'),($2,now(),'{\"full_name\":\"Test B\"}')",[a,b]);

  if(yeniSema){
    await db.exec(await readFile(new URL('../backend/sql/20261016_02_emotions_up.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../backend/sql/20261016_03_memory_requests_up.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../backend/sql/20261017_04_analysis_up.sql',import.meta.url),'utf8'));
  }
  const silSql=await dosya('202610180001_galeriden_fotograf_silme.sql');
  await db.exec(silSql);await db.exec(silSql);
  const k=(await sorgu("select ss.user_id,s.id from public.spheres s join public.sphere_sets ss on ss.id=s.sphere_set_id where s.emotion_type='mutluluk'")).rows;
  async function ani(uid,mid,n=3,eski=false){
    const paths=Array.from({length:n},(_,i)=>`${uid}/${mid}/${i}.jpg`);
    await rol(uid);
    for(const path of paths)await sorgu("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[path]);
    await sorgu("select public.ani_olustur($1,$2,'Test',null,'2020-01-01',$3::text[])",[mid,k.find(r=>r.user_id===uid).id,paths]);
    if(eski){await db.exec('reset role');await sorgu('delete from public.memory_images where memory_id=$1',[mid]);}
    return paths;
  }
  const m=id(10),other=id(11),legacy=id(12);
  const paths=await ani(a,m),foreign=await ani(b,other,1),old=await ani(a,legacy,1,true);
  const input=(mid,paths)=>paths.map(storage_path=>({memory_id:mid,storage_path}));
  const sil=photos=>sorgu('select public.galeri_fotograflarini_sil($1::jsonb) as paths',[JSON.stringify(photos)]);
  await rol(a);
  for(const invalid of [[...input(m,[paths[0]]),...input(other,foreign)],input(other,[`${a}/${other}/0.jpg`]),input(m,[`${a}/${m}/../0.jpg`])])await assert.rejects(sil(invalid),e=>e.code==='42501');
  assert.equal((await sorgu('select count(*)::int as n from public.memory_images where memory_id=$1',[m])).rows[0].n,3,'Reddedilen toplu işlem hiçbir fotoğrafı silmemeli');
  await rol(null,'anon');await assert.rejects(sil(input(m,[paths[0]])),e=>e.code==='42501');
  await rol(a);
  const before=(await sorgu('select to_jsonb(m) as m from public.memories m where id=$1',[m])).rows[0].m;
  await sil(input(m,[paths[0]]));
  let after=(await sorgu('select to_jsonb(m) as m from public.memories m where id=$1',[m])).rows[0].m;
  assert.equal(after.image_url,paths[1]);assert.equal((await sorgu('select count(*)::int as n from public.memory_images where memory_id=$1',[m])).rows[0].n,2);
  if(yeniSema)assert.equal(after.version,before.version+1);
  assert.equal((await sorgu('delete from storage.objects where name=$1 returning name',[paths[1]])).rows.length,0,'Bağlı dosya hâlâ korunmalı');
  assert.equal((await sorgu('delete from storage.objects where name=$1 returning name',[paths[0]])).rows.length,1);
  assert.deepEqual((await sil(input(m,[paths[0]]))).rows[0].paths,[paths[0]],'Tekrar deneme güvenli');
  if(yeniSema){
    await db.exec('reset role');await sorgu("update public.memories set analysis_status='queued' where id=$1",[m]);await rol(a);
    await assert.rejects(sil(input(m,[paths[1]])),e=>e.code==='55000');
    await db.exec('reset role');await sorgu("update public.memories set analysis_status='awaiting_nfc' where id=$1",[m]);await rol(a);
  }
  await sil([...input(m,paths.slice(1)),...input(legacy,old)]);
  assert.equal((await sorgu('select * from public.memories where id=any($1::uuid[])',[[m,legacy]])).rows.length,0);
  assert.equal((await sorgu('select * from public.memory_images where memory_id=$1',[m])).rows.length,0);
  await sil(input(m,paths));
  await rol(b);assert.equal((await sorgu('select * from public.memories where id=$1',[other])).rows.length,1);
  assert.equal((await sorgu('select * from public.memory_images where memory_id=$1',[other])).rows.length,1);
  console.log(`Galeri silme SQL: ${yeniSema?'yeni':'canlı eski'} şema, sahiplik, anon, atomiklik, kapak, son fotoğraf ve tekrar deneme geçti.`);
 } finally{await db.close();}
}
