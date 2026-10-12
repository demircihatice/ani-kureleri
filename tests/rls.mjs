// Yalnızca bellekte çalışan PostgreSQL testi; gerçek Supabase'e bağlanmaz.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../.expo/rls-runtime/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
let kontrol = 0;
const dogrula = (kosul, mesaj) => { assert.ok(kosul, mesaj); kontrol++; };
const sql = (metin, parametreler) => db.query(metin, parametreler);
async function reddedilmeli(metin, parametreler, kod = '42501') {
  await assert.rejects(sql(metin, parametreler), (hata) => hata.code === kod);
  kontrol++;
}
async function kullanici(id, rol = 'authenticated') {
  await db.exec('reset role');
  await sql("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  await db.exec(`set role ${rol}`);
}

try {
  // Supabase'in Auth şeması ve API rolleri yerelde asgari biçimde taklit edilir.
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  const migration = await readFile(new URL('../supabase/migrations/202610010001_asama3_tablolar_ve_rls.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const politikalar = await sql("select count(*)::int as sayi from pg_policies where schemaname = 'public'");
  dogrula(politikalar.rows[0].sayi === 16, 'Tekrar çalıştırmada 16 politika korunmalı');
  const rls = await sql("select count(*)::int as sayi from pg_class where relname in ('profiles','sphere_sets','spheres','memories') and relrowsecurity");
  dogrula(rls.rows[0].sayi === 4, 'Dört tabloda RLS açık olmalı');

  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  await sql('insert into auth.users(id) values ($1), ($2)', [a, b]);
  const veri = {};
  for (const [ad, id] of [['a', a], ['b', b]]) {
    await kullanici(id);
    await sql('insert into public.profiles(id,full_name) values ($1,$2)', [id, `Test ${ad}`]);
    const set = (await sql("insert into public.sphere_sets(name) values ('Test seti') returning id")).rows[0].id;
    const kure = (await sql("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'Mutluluk','mutluluk') returning id", [set])).rows[0].id;
    const ani = (await sql("insert into public.memories(sphere_id,title,image_url,memory_date) values ($1,'Test anısı','test/foto.jpg','2020-01-01') returning id", [kure])).rows[0].id;
    veri[ad] = { profiles: id, sphere_sets: set, spheres: kure, memories: ani };
    kontrol += 4; // RLS altında dört sahipli INSERT başarılı.
  }

  for (const [ad, id, diger] of [['a', a, 'b'], ['b', b, 'a']]) {
    await kullanici(id);
    for (const tablo of ['profiles', 'sphere_sets', 'spheres', 'memories']) {
      const gorunen = await sql(`select id from public.${tablo}`);
      dogrula(gorunen.rows.length === 1 && gorunen.rows[0].id === veri[ad][tablo], `${ad}: yalnızca kendi ${tablo} satırı görünmeli`);
      const yabanci = await sql(`select id from public.${tablo} where id = $1`, [veri[diger][tablo]]);
      dogrula(yabanci.rows.length === 0, `${ad}: yabancı ${tablo} okunmamalı`);
      const alan = tablo === 'profiles' ? 'full_name' : tablo === 'memories' ? 'title' : 'name';
      const guncelle = await sql(`update public.${tablo} set ${alan} = 'İzinsiz' where id = $1 returning id`, [veri[diger][tablo]]);
      dogrula(guncelle.rows.length === 0, `${ad}: yabancı ${tablo} güncellenmemeli`);
      const sil = await sql(`delete from public.${tablo} where id = $1 returning id`, [veri[diger][tablo]]);
      dogrula(sil.rows.length === 0, `${ad}: yabancı ${tablo} silinmemeli`);
      const kendi = await sql(`update public.${tablo} set ${alan} = 'Kendi kaydı' where id = $1 returning id`, [veri[ad][tablo]]);
      dogrula(kendi.rows.length === 1, `${ad}: kendi ${tablo} güncellenebilmeli`);
    }
    await reddedilmeli('insert into public.profiles(id,full_name) values ($1,\'İzinsiz\')', [veri[diger].profiles]);
    await reddedilmeli('insert into public.sphere_sets(user_id,name) values ($1,\'İzinsiz\')', [veri[diger].profiles]);
    await reddedilmeli("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'İzinsiz','huzun')", [veri[diger].sphere_sets]);
    await reddedilmeli("insert into public.memories(sphere_id,title,image_url,memory_date) values ($1,'İzinsiz','x','2020-01-01')", [veri[diger].spheres]);
    await reddedilmeli("insert into public.memories(user_id,sphere_id,title,image_url,memory_date) values ($1,$2,'İzinsiz','x','2020-01-01')", [veri[diger].profiles, veri[ad].spheres]);
    await reddedilmeli('update public.spheres set sphere_set_id = $1 where id = $2', [veri[diger].sphere_sets, veri[ad].spheres]);
    await reddedilmeli('update public.memories set sphere_id = $1 where id = $2', [veri[diger].spheres, veri[ad].memories]);
    await reddedilmeli('update public.sphere_sets set user_id = $1 where id = $2', [veri[diger].profiles, veri[ad].sphere_sets]);
    await reddedilmeli('update public.memories set user_id = $1 where id = $2', [veri[diger].profiles, veri[ad].memories]);
    await reddedilmeli('update public.profiles set id = $1 where id = $2', [veri[diger].profiles, veri[ad].profiles]);
  }

  await kullanici(a);
  const ikinciKure = (await sql("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'Nostalji','nostalji') returning id", [veri.a.sphere_sets])).rows[0].id;
  dogrula((await sql('update public.memories set sphere_id = $1 where id = $2 returning id', [ikinciKure, veri.a.memories])).rows.length === 1, 'Anı kendi başka küresine taşınabilmeli');
  await reddedilmeli("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'Yinelenen','nostalji')", [veri.a.sphere_sets], '23505');
  await reddedilmeli("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'Bilinmeyen','ofke')", [veri.a.sphere_sets], '23514');
  await reddedilmeli("insert into public.spheres(sphere_set_id,name,emotion_type) values ('99999999-9999-4999-8999-999999999999','Eksik','huzun')", [], '42501');

  await db.exec('reset role');
  await db.exec(migration);
  dogrula((await sql('select count(*)::int as sayi from public.memories')).rows[0].sayi === 2, 'Tekrar çalışma verileri korumalı');

  await kullanici(null, 'anon');
  for (const tablo of ['profiles', 'sphere_sets', 'spheres', 'memories']) {
    await reddedilmeli(`select * from public.${tablo}`);
    await reddedilmeli(`insert into public.${tablo} default values`);
    const alan = tablo === 'profiles' ? 'full_name' : tablo === 'memories' ? 'title' : 'name';
    await reddedilmeli(`update public.${tablo} set ${alan} = 'İzinsiz'`);
    await reddedilmeli(`delete from public.${tablo}`);
    await reddedilmeli(`truncate public.${tablo}`);
  }
  await kullanici(null);
  dogrula((await sql('select * from public.memories')).rows.length === 0, 'JWT kullanıcı kimliği olmadan kayıt görünmemeli');

  // Sahipli silme ve FK cascade davranışı; diğer kullanıcı korunur.
  for (const [ad, id] of [['a', a], ['b', b]]) {
    await kullanici(id);
    const geciciKure = (await sql("insert into public.spheres(sphere_set_id,name,emotion_type) values ($1,'Hüzün','huzun') returning id", [veri[ad].sphere_sets])).rows[0].id;
    const geciciAni = (await sql("insert into public.memories(sphere_id,title,image_url,memory_date) values ($1,'Geçici','x','2020-01-01') returning id", [geciciKure])).rows[0].id;
    dogrula((await sql('delete from public.memories where id = $1 returning id', [geciciAni])).rows.length === 1, 'Kendi anısı doğrudan silinebilmeli');
    dogrula((await sql('delete from public.spheres where id = $1 returning id', [geciciKure])).rows.length === 1, 'Kendi küresi doğrudan silinebilmeli');
    dogrula((await sql('delete from public.sphere_sets where id = $1 returning id', [veri[ad].sphere_sets])).rows.length === 1, 'Kendi seti silinebilmeli');
    dogrula((await sql('select * from public.spheres')).rows.length === 0, 'Kendi küreleri cascade ile silinmeli');
    dogrula((await sql('select * from public.memories')).rows.length === 0, 'Kendi anıları cascade ile silinmeli');
    dogrula((await sql('delete from public.profiles where id = $1 returning id', [id])).rows.length === 1, 'Kendi profili silinebilmeli');
  }

  await db.exec('reset role');
  await db.exec('create policy yabanci_politika on public.memories for select to authenticated using (true)');
  await assert.rejects(db.exec(migration), /bu migration dışında/);
  await db.exec('rollback');
  kontrol++;
  console.log(`${kontrol} PostgreSQL/RLS kontrolü geçti. Gerçek Supabase projesine dokunulmadı.`);
} finally {
  await db.close();
}
