// Gerçek PostgreSQL; Storage API yerine metadata tablosu yerelde taklit edilir.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
let sayi = 0;
const sorgu = (metin, params) => db.query(metin, params);
const kontrol = (kosul) => { assert.ok(kosul); sayi++; };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a = id(1), b = id(2), aniA = id(11), aniB = id(12);
async function rol(kimlik, ad = 'authenticated') {
  await db.exec('reset role');
  await sorgu("select set_config('request.jwt.claim.sub',$1,false)",[kimlik ?? '']);
  await db.exec(`set role ${ad}`);
}
async function reddet(sql, params, code) {
  await assert.rejects(sorgu(sql,params),(hata) => hata.code === code); sayi++;
}
const rpc = (ani,kure,yollar,baslik='Test Anısı') => sorgu(
  "select public.ani_olustur($1,$2,$3,'Açıklama','2020-01-02',$4::text[]) as id",[ani,kure,baslik,yollar]);
async function nesne(yol) {
  await sorgu("insert into storage.objects(bucket_id,name) values ('ani-fotograflari',$1)",[yol]);
}
try {
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
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
  const kureler = (await sorgu("select ss.user_id,s.id from public.spheres s join public.sphere_sets ss on ss.id=s.sphere_set_id where s.emotion_type='mutluluk'")).rows;
  const kureA = kureler.find((k) => k.user_id===a).id, kureB = kureler.find((k) => k.user_id===b).id;
  const yollarA = [`${a}/${aniA}/0.jpg`,`${a}/${aniA}/1.jpg`];
  const yollarB = [`${b}/${aniB}/0.jpg`];
  for (const [sahip,ani,kure,yollar] of [[a,aniA,kureA,yollarA],[b,aniB,kureB,yollarB]]) {
    await rol(sahip);
    await assert.rejects(rpc(ani,kure,yollar),(hata) => hata.code==='22023'); sayi++;
    for (const yol of yollar) await nesne(yol);
    kontrol((await rpc(ani,kure,yollar)).rows[0].id===ani);
    kontrol((await rpc(ani,kure,yollar)).rows[0].id===ani);
    kontrol((await sorgu('select count(*)::int as n from public.memories')).rows[0].n===1);
    kontrol((await sorgu('select image_url from public.memories')).rows[0].image_url===yollar[0]);
    kontrol((await sorgu('select count(*)::int as n from public.memory_images')).rows[0].n===yollar.length);
    kontrol((await sorgu("delete from storage.objects where bucket_id='ani-fotograflari' returning name")).rows.length===0);
    await assert.rejects(rpc(ani,kure,yollar,'Farklı Başlık'),(hata) => hata.code==='23505'); sayi++;
  }
  for (const [sahip,kure,yabanciAni,yabanciYol] of [[a,kureB,aniB,yollarB[0]],[b,kureA,aniA,yollarA[0]]]) {
    await rol(sahip);
    kontrol((await sorgu('select * from public.memory_images where memory_id=$1',[yabanciAni])).rows.length===0);
    kontrol((await sorgu('update public.memory_images set sort_order=4 where memory_id=$1 returning id',[yabanciAni])).rows.length===0);
    kontrol((await sorgu('delete from public.memory_images where memory_id=$1 returning id',[yabanciAni])).rows.length===0);
    await reddet('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,4)',[yabanciAni,`${sahip}/${yabanciAni}/4.jpg`],'42501');
    kontrol((await sorgu('select * from storage.objects where name=$1',[yabanciYol])).rows.length===0);
    kontrol((await sorgu('delete from storage.objects where name=$1 returning id',[yabanciYol])).rows.length===0);
    kontrol((await sorgu('update storage.objects set name=name where name=$1 returning id',[yabanciYol])).rows.length===0);
    await reddet("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[yabanciYol],'42501');
    await assert.rejects(rpc(id(22),kure,[`${sahip}/${id(22)}/0.jpg`]),(hata)=>hata.code==='42501'); sayi++;
  }
  await rol(a);
  await reddet('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,4)',[aniA,`${b}/${aniA}/4.jpg`],'42501');
  await reddet('update public.memory_images set memory_id=$1 where memory_id=$2',[aniB,aniA],'42501');
  const bosYol = `${a}/${id(99)}/0.jpg`;
  await nesne(bosYol);
  kontrol((await sorgu('delete from storage.objects where name=$1 returning id',[bosYol])).rows.length===1);
  await reddet("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[`${a}/${id(99)}/0.png`],'42501');
  await assert.rejects(rpc(id(99),kureA,[]),(hata)=>hata.code==='22023'); sayi++;
  await assert.rejects(rpc(id(99),kureA,[yollarA[0]]),(hata)=>hata.code==='22023'); sayi++;
  await rol(null,'anon');
  kontrol((await sorgu('select * from storage.objects')).rows.length===0);
  await reddet('select * from public.memory_images',[],'42501');
  await reddet("select public.ani_olustur($1,$2,'X',null,'2020-01-01',$3::text[])",[id(99),kureA,[]],'42501');

  // Fotoğraf satırı eklenirken hata olursa, önce eklenen memories satırı da geri alınır.
  await db.exec('reset role');
  await db.exec('alter table public.memory_images add constraint test_hata check(sort_order<>1) not valid');
  const yarim = id(33), yarimYollar = [`${a}/${yarim}/0.jpg`,`${a}/${yarim}/1.jpg`];
  await rol(a); for (const yol of yarimYollar) await nesne(yol);
  await assert.rejects(rpc(yarim,kureA,yarimYollar),(hata)=>hata.code==='23514'); sayi++;
  kontrol((await sorgu('select * from public.memories where id=$1',[yarim])).rows.length===0);
  kontrol((await sorgu('select * from public.memory_images where memory_id=$1',[yarim])).rows.length===0);
  kontrol((await sorgu('delete from storage.objects where name=any($1::text[]) returning id',[yarimYollar])).rows.length===2);
  await db.exec('reset role');
  await db.exec('alter table public.memory_images drop constraint test_hata');
  await db.exec(migration);
  kontrol((await sorgu('select count(*)::int as n from public.memory_images')).rows[0].n===3);
  kontrol((await sorgu("select count(*)::int as n from pg_policies where schemaname='public'")).rows[0].n===20);
  const bucket = (await sorgu("select * from storage.buckets where id='ani-fotograflari'")).rows[0];
  kontrol(bucket.public===false && Number(bucket.file_size_limit)===6291456 && bucket.allowed_mime_types[0]==='image/jpeg');
  // Aşama 8: aynı kullanıcıya ait küreler arasında taşıma, fotoğrafları korur.
  await rol(a);
  const hedef = (await sorgu("select id from public.spheres where emotion_type='nostalji'")).rows[0].id;
  const tasinan = (await sorgu("update public.memories set title='Yeni Başlık',description='Yeni açıklama',memory_date='2024-02-29',sphere_id=$1 where id=$2 and user_id=$3 returning *",[hedef,aniA,a])).rows;
  kontrol(tasinan.length===1 && tasinan[0].sphere_id===hedef && tasinan[0].title==='Yeni Başlık');
  kontrol(tasinan[0].image_url===yollarA[0]);
  kontrol((await sorgu('select count(*)::int as n from public.memories where sphere_id=$1',[kureA])).rows[0].n===0);
  kontrol((await sorgu('select count(*)::int as n from public.memories where sphere_id=$1',[hedef])).rows[0].n===1);
  assert.deepEqual((await sorgu('select storage_path from public.memory_images where memory_id=$1 order by sort_order',[aniA])).rows.map((f)=>f.storage_path),yollarA); sayi++;
  kontrol((await sorgu('select count(*)::int as n from storage.objects')).rows[0].n===2);
  await reddet('update public.memories set sphere_id=$1 where id=$2',[kureB,aniA],'42501');
  kontrol((await sorgu('select sphere_id from public.memories where id=$1',[aniA])).rows[0].sphere_id===hedef);
  await rol(b);
  kontrol((await sorgu('select * from public.memories where id=$1',[aniA])).rows.length===0);
  kontrol((await sorgu("update public.memories set title='Yabancı değişiklik',sphere_id=$1 where id=$2 returning id",[kureB,aniA])).rows.length===0);
  await db.exec('reset role');
  kontrol((await sorgu('select title,sphere_id from public.memories where id=$1',[aniA])).rows[0].title==='Yeni Başlık');
  await db.exec('create policy test_unsafe on storage.objects for select to authenticated using(true)');
  await assert.rejects(db.exec(migration),/başka istemci politikaları/); sayi++;
  await db.exec('rollback');
  console.log(`Fotoğraf/Storage: ${sayi} PostgreSQL kontrolü geçti.`);
} finally { await db.close(); }
