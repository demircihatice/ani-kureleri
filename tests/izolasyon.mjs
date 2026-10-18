// Üç migration birlikte: iki kullanıcı, beş tablo ve Storage. Canlı veriye dokunmaz.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const sql = (metin, parametreler) => db.query(metin, parametreler);
let sayi = 0;
const kontrol = (kosul, mesaj) => { assert.ok(kosul, mesaj); sayi++; };
async function reddet(metin, params) {
  await assert.rejects(sql(metin,params),(h)=>h.code==='42501'); sayi++;
}
async function rol(id, ad='authenticated') {
  await db.exec('reset role');
  await sql("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']);
  await db.exec(`set role ${ad}`);
}
const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hesaplar=[{user:id(1),memory:id(11)},{user:id(2),memory:id(12)}];
const tablolar=['profiles','sphere_sets','spheres','memories','memory_images'];
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
  for(const ad of ['202610010001_asama3_tablolar_ve_rls.sql','202610010002_asama4_otomatik_baslangic.sql','202610010003_asama6_fotograflar_ve_storage.sql'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${ad}`,import.meta.url),'utf8'));
  for(const h of hesaplar) {
    // Testte Auth doğrulama olayını taklit eder; gerçek Auth hesabı oluşturmaz.
    await sql("insert into auth.users values($1,now(),'{\"full_name\":\"İzolasyon test hesabı\"}')",[h.user]);
    h.set=(await sql('select id from public.sphere_sets where user_id=$1',[h.user])).rows[0].id;
    h.sphere=(await sql("select id from public.spheres where sphere_set_id=$1 and emotion_type='mutluluk'",[h.set])).rows[0].id;
    h.path=`${h.user}/${h.memory}/0.jpg`;
  }
  for(const h of hesaplar) {
    await rol(h.user);
    await sql("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[h.path]);
    await sql("select public.ani_olustur($1,$2,'İzolasyon',null,'2024-01-01',$3::text[])",[h.memory,h.sphere,[h.path]]);
    h.image=(await sql('select id from public.memory_images where memory_id=$1',[h.memory])).rows[0].id;
  }
  for(const [h,diger] of [[hesaplar[0],hesaplar[1]],[hesaplar[1],hesaplar[0]]]) {
    await rol(h.user);
    const kimlik={profiles:h.user,sphere_sets:h.set,spheres:h.sphere,memories:h.memory,memory_images:h.image};
    const yabanci={profiles:diger.user,sphere_sets:diger.set,spheres:diger.sphere,memories:diger.memory,memory_images:diger.image};
    for(const tablo of tablolar) {
      const gorunen=(await sql(`select id from public.${tablo}`)).rows;
      kontrol(gorunen.length===(tablo==='spheres' ? 3 : 1),`${tablo}: filtresiz sorgu yalnızca sahibini göstermeli`);
      kontrol(gorunen.some((r)=>r.id===kimlik[tablo]),`${tablo}: kendi kayıt görünmeli`);
      kontrol((await sql(`select id from public.${tablo} where id=$1`,[yabanci[tablo]])).rows.length===0,`${tablo}: doğrudan yabancı UUID görünmemeli`);
      const alan=tablo==='profiles' ? 'full_name' : tablo==='memories' ? 'title' : tablo==='memory_images' ? 'sort_order' : 'name';
      kontrol((await sql(`update public.${tablo} set ${alan}=${alan} where id=$1 returning id`,[yabanci[tablo]])).rows.length===0,`${tablo}: yabancı UPDATE sıfır satır`);
      kontrol((await sql(`delete from public.${tablo} where id=$1 returning id`,[yabanci[tablo]])).rows.length===0,`${tablo}: yabancı DELETE sıfır satır`);
      kontrol((await sql(`update public.${tablo} set ${alan}=${alan} where id=$1 returning id`,[kimlik[tablo]])).rows.length===1,`${tablo}: sahip UPDATE çalışmalı`);
    }
    await reddet("insert into public.profiles(id,full_name) values($1,'İzinsiz')",[diger.user]);
    await reddet("insert into public.sphere_sets(user_id,name) values($1,'İzinsiz')",[diger.user]);
    await reddet("insert into public.spheres(sphere_set_id,name,emotion_type) values($1,'İzinsiz','huzun')",[diger.set]);
    await reddet("insert into public.memories(user_id,sphere_id,title,image_url,memory_date) values($1,$2,'İzinsiz','x','2020-01-01')",[h.user,diger.sphere]);
    await reddet("insert into public.memories(user_id,sphere_id,title,image_url,memory_date) values($1,$2,'İzinsiz','x','2020-01-01')",[diger.user,h.sphere]);
    await reddet('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,4)',[diger.memory,`${h.user}/${diger.memory}/4.jpg`]);
    await reddet('insert into public.memory_images(memory_id,storage_path,sort_order) values($1,$2,4)',[h.memory,`${diger.user}/${h.memory}/4.jpg`]);
    await reddet('update public.spheres set sphere_set_id=$1 where id=$2',[diger.set,h.sphere]);
    await reddet('update public.memories set sphere_id=$1 where id=$2',[diger.sphere,h.memory]);
    await reddet('update public.memory_images set memory_id=$1 where id=$2',[diger.memory,h.image]);
    await reddet("select public.ani_olustur($1,$2,'İzinsiz',null,'2020-01-01',$3::text[])",[id(99),diger.sphere,[h.path]]);
    kontrol((await sql('select name from storage.objects')).rows.every((r)=>r.name.startsWith(h.user+'/')),'Storage filtresiz SELECT yalnızca sahip');
    kontrol((await sql('select name from storage.objects where name=$1',[diger.path])).rows.length===0,'Storage yabancı path okunamaz');
    await reddet("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[`${diger.user}/${id(98)}/0.jpg`]);
    kontrol((await sql('update storage.objects set name=name where name=$1 returning id',[diger.path])).rows.length===0,'Yabancı Storage UPDATE');
    kontrol((await sql('delete from storage.objects where name=$1 returning id',[diger.path])).rows.length===0,'Yabancı Storage DELETE');
    // Bağsız dosyada da sahiplik şartı geçerli: yalnızca kayıt bağlantısı korumasına güvenmiyoruz.
    const bos=`${h.user}/${id(90)}/0.jpg`;
    await sql("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[bos]);
    await rol(diger.user);
    kontrol((await sql('delete from storage.objects where name=$1 returning id',[bos])).rows.length===0,'Yabancı bağsız dosyayı da silemez');
    await rol(h.user);
    kontrol((await sql('delete from storage.objects where name=$1 returning id',[bos])).rows.length===1,'Sahip bağsız dosyayı temizleyebilir');
  }
  await rol(null,'anon');
  for(const tablo of tablolar) {
    await reddet(`select * from public.${tablo}`);
    await reddet(`insert into public.${tablo} default values`);
    const alan=tablo==='profiles' ? 'full_name' : tablo==='memories' ? 'title' : tablo==='memory_images' ? 'sort_order' : 'name';
    await reddet(`update public.${tablo} set ${alan}=${alan}`);
    await reddet(`delete from public.${tablo}`);
  }
  kontrol((await sql('select * from storage.objects')).rows.length===0,'anon Storage okuyamaz');
  await reddet("insert into storage.objects(bucket_id,name) values('ani-fotograflari',$1)",[`${hesaplar[0].user}/${id(97)}/0.jpg`]);
  kontrol((await sql('update storage.objects set name=name returning id')).rows.length===0,'anon Storage UPDATE yapamaz');
  kontrol((await sql('delete from storage.objects returning id')).rows.length===0,'anon Storage DELETE yapamaz');
  await rol(null);
  for(const tablo of tablolar)kontrol((await sql(`select * from public.${tablo}`)).rows.length===0,'authenticated ama uid yok: '+tablo);
  kontrol((await sql('select * from storage.objects')).rows.length===0,'uid yok: Storage');
  await db.exec('reset role');
  for(const tablo of tablolar)kontrol((await sql(`select count(*)::int as n from public.${tablo}`)).rows[0].n===(tablo==='spheres' ? 6 : 2),'Saldırılar verileri değiştirmedi: '+tablo);
  kontrol((await sql('select count(*)::int as n from storage.objects')).rows[0].n===2,'Asıl dosyalar korundu');
  // Panel kontrol dosyasındaki sorgular da mevcut migration şemasında geçerli olmalı.
  await db.exec(await readFile(new URL('../backend/sql/rls_audit.sql',import.meta.url),'utf8'));
  console.log(`Aşama 9: ${sayi} bütünleşik izolasyon kontrolü geçti; iki yerel test kullanıcısı. Canlı Supabase testi değildir.`);
} finally { await db.close(); }
