// Gerçek Supabase'e bağlanmadan PostgreSQL üzerinde Aşama 4 doğrulaması.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
let sayi = 0;
const kontrol = (kosul) => { assert.ok(kosul); sayi++; };
const sorgu = (sql, params) => db.query(sql, params);
const kimlik = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oku = (ad) => readFile(new URL(`../supabase/${ad}`, import.meta.url), 'utf8');
async function reddet(sql, params, code) {
  await assert.rejects(sorgu(sql, params), (hata) => hata.code === code);
  sayi++;
}
async function kayit(n, onay, ad = 'Test Kullanıcısı') {
  await sorgu(`insert into auth.users(id,email_confirmed_at,raw_user_meta_data)
    values ($1,case when $2 then now() else null end,$3::jsonb)`,
  [kimlik(n), onay, JSON.stringify({ full_name: ad })]);
}
async function adet(n, beklenen) {
  const sonuc = (await sorgu(`select
    (select count(*)::int from public.profiles where id=$1) as profil,
    (select count(*)::int from public.sphere_sets where user_id=$1) as set,
    (select count(*)::int from public.spheres s join public.sphere_sets ss
      on ss.id=s.sphere_set_id where ss.user_id=$1) as kure`, [kimlik(n)])).rows[0];
  assert.deepEqual(sonuc, { profil: beklenen ? 1 : 0, set: beklenen ? 1 : 0, kure: beklenen ? 3 : 0 });
  sayi++;
}
async function durum() {
  return (await sorgu(`select jsonb_build_object(
    'profiles',(select jsonb_agg(p order by id) from public.profiles p),
    'sets',(select jsonb_agg(s order by id) from public.sphere_sets s),
    'spheres',(select jsonb_agg(s order by id) from public.spheres s)) as veri`)).rows[0].veri;
}
try {
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create role auth_test nologin nosuperuser nobypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, created_at timestamptz default now(),
      email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,auth_test;
    grant select,insert,update on auth.users to auth_test;
  `);
  await db.exec(await oku('migrations/202610010001_asama3_tablolar_ve_rls.sql'));
  const politikalar = (await sorgu('select * from pg_policies order by tablename,policyname')).rows;
  await kayit(1, true);
  await kayit(2, true);
  await kayit(3, false);
  await sorgu("insert into public.profiles values ($1,'Korunan Ad',now())", [kimlik(2)]);
  const set = (await sorgu("insert into public.sphere_sets(user_id,name) values ($1,'Korunan Set') returning id", [kimlik(2)])).rows[0].id;
  const kure = (await sorgu("insert into public.spheres(sphere_set_id,name,emotion_type,nfc_uid) values ($1,'Korunan Küre','mutluluk','test-nfc') returning id", [set])).rows[0].id;
  const migration = await oku('migrations/202610010002_asama4_otomatik_baslangic.sql');
  await db.exec(migration);
  await adet(1, true); await adet(2, true); await adet(3, false);
  kontrol((await sorgu('select full_name from public.profiles where id=$1', [kimlik(2)])).rows[0].full_name === 'Korunan Ad');
  kontrol((await sorgu('select name from public.sphere_sets where id=$1', [set])).rows[0].name === 'Korunan Set');
  kontrol((await sorgu('select nfc_uid from public.spheres where id=$1', [kure])).rows[0].nfc_uid === 'test-nfc');
  assert.deepEqual((await sorgu('select * from pg_policies order by tablename,policyname')).rows, politikalar); sayi++;
  const ilk = await durum();
  await db.exec(migration);
  assert.deepEqual(await durum(), ilk); sayi++;

  // Auth işlemini yapan rolün uygulama tablolarında INSERT yetkisi yoktur.
  await db.exec('set role auth_test');
  await kayit(4, false);
  await db.exec('reset role'); await adet(4, false);
  await db.exec('set role auth_test');
  await sorgu('update auth.users set email_confirmed_at=now() where id=$1', [kimlik(4)]);
  await kayit(5, true, '');
  await kayit(6, true, 'A'.repeat(150));
  await db.exec('reset role');
  for (const n of [4, 5, 6]) await adet(n, true);
  kontrol((await sorgu('select full_name from public.profiles where id=$1', [kimlik(5)])).rows[0].full_name === 'Anı Kullanıcısı');
  kontrol((await sorgu('select length(full_name) as uzunluk from public.profiles where id=$1', [kimlik(6)])).rows[0].uzunluk === 100);
  const sonraki = await durum();
  await sorgu('update auth.users set email_confirmed_at=null where id=$1', [kimlik(4)]);
  await sorgu('update auth.users set email_confirmed_at=now() where id=$1', [kimlik(4)]);
  await sorgu('select ani_kureleri_private.baslangic_verilerini_tamamla($1)', [kimlik(4)]);
  assert.deepEqual(await durum(), sonraki); sayi++;
  kontrol((await sorgu('select count(*)::int as adet from public.spheres where nfc_uid is null')).rows[0].adet === 14);

  for (const rol of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${rol}`);
    await reddet('select ani_kureleri_private.baslangic_verilerini_tamamla($1)', [kimlik(1)], '42501');
    await db.exec('reset role');
  }
  await sorgu("select set_config('request.jwt.claim.sub',$1,false)", [kimlik(1)]);
  await db.exec('set role authenticated');
  kontrol((await sorgu('select id from public.profiles')).rows.length === 1);
  kontrol((await sorgu('select id from public.sphere_sets')).rows.length === 1);
  kontrol((await sorgu('select id from public.spheres')).rows.length === 3);
  await reddet("insert into public.sphere_sets(name) values ('İkinci Set')", [], '23505');
  await reddet("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'İzinsiz','huzun')", [set], '42501');
  await db.exec('reset role');

  // Trigger hatasında doğrulama ve kısmi başlangıç verileri birlikte geri alınır.
  await kayit(7, false);
  await db.exec("alter table public.sphere_sets add constraint test_hata check (name <> 'Anı Kürelerim') not valid");
  await reddet('update auth.users set email_confirmed_at=now() where id=$1', [kimlik(7)], '23514');
  await adet(7, false);
  kontrol((await sorgu('select email_confirmed_at from auth.users where id=$1', [kimlik(7)])).rows[0].email_confirmed_at === null);
  await db.exec('alter table public.sphere_sets drop constraint test_hata');
  await sorgu('update auth.users set email_confirmed_at=now() where id=$1', [kimlik(7)]);
  await adet(7, true);
  await db.exec(await oku('asama4_kontrol.sql'));

  // Mevcut yinelenen setler varsa migration hiçbirini silmeden durmalıdır.
  await db.exec('drop index public.sphere_sets_user_id_unique_idx');
  await sorgu("insert into public.sphere_sets(user_id,name) values ($1,'Eski İkinci Set')", [kimlik(1)]);
  const once = await durum();
  await assert.rejects(db.exec(migration), /birden fazla küre seti/); sayi++;
  await db.exec('rollback');
  assert.deepEqual(await durum(), once); sayi++;
  console.log(`Aşama 4: ${sayi} PostgreSQL kontrolü geçti.`);
} finally {
  await db.close();
}
