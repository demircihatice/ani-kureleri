-- Anı Küreleri / Aşama 4
-- Önce Aşama 3 migration'ı uygulanmış olmalı.
-- SQL Editor'da tamamını çalıştırın. Doğrulanmış mevcut kullanıcılar da tamamlanır.
begin;

do $$
declare tablo text;
begin
  foreach tablo in array array['profiles', 'sphere_sets', 'spheres', 'memories'] loop
    if to_regclass('public.' || tablo) is null then
      raise exception 'public.% bulunamadı. Önce Aşama 3 migration dosyasını çalıştırın.', tablo;
    end if;
    if obj_description(to_regclass('public.' || tablo), 'pg_class') is distinct from 'ani_kureleri_asama3_v1' then
      raise exception 'public.% beklenen Anı Küreleri tablosu değil. İşlem durduruldu.', tablo;
    end if;
  end loop;
  if exists (select 1 from public.sphere_sets group by user_id having count(*) > 1) then
    raise exception 'Bir kullanıcıya ait birden fazla küre seti var. Veriler silinmedi; setleri inceleyip sonucu paylaşın.';
  end if;
  if to_regnamespace('ani_kureleri_private') is not null
     and obj_description(to_regnamespace('ani_kureleri_private'), 'pg_namespace')
         is distinct from 'ani_kureleri_asama4_v1' then
    raise exception 'ani_kureleri_private şeması zaten var ve bu migration tarafından oluşturulmamış.';
  end if;
end $$;

-- MVP: kullanıcı başına bir set. Aynı kullanıcıya eşzamanlı ikinci set de açılamaz.
create unique index if not exists sphere_sets_user_id_unique_idx on public.sphere_sets(user_id);

-- Bu şema Data API'ye açılmaz. İstemciler başlangıç fonksiyonunu çağırmaz.
create schema if not exists ani_kureleri_private;
comment on schema ani_kureleri_private is 'ani_kureleri_asama4_v1';
revoke all on schema ani_kureleri_private from public, anon, authenticated, service_role;

create or replace function ani_kureleri_private.baslangic_verilerini_tamamla(kullanici_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ad_soyad text;
  dogrulama_tarihi timestamptz;
  set_id uuid;
begin
  -- Aynı kullanıcının eşzamanlı hazırlıkları bu satır kilidiyle sıralanır.
  -- Sahiplik metadata'dan değil, auth.users birincil anahtarından alınır.
  select u.email_confirmed_at, u.raw_user_meta_data ->> 'full_name'
    into dogrulama_tarihi, ad_soyad
  from auth.users u where u.id = kullanici_id for update;

  if not found or dogrulama_tarihi is null then
    return;
  end if;

  -- Eski/eksik metadata yüzünden e-posta doğrulaması engellenmesin.
  ad_soyad := left(btrim(coalesce(ad_soyad, '')), 100);
  if char_length(ad_soyad) < 2 then
    ad_soyad := 'Anı Kullanıcısı';
  end if;

  insert into public.profiles(id, full_name)
  values (kullanici_id, ad_soyad)
  on conflict (id) do nothing;

  insert into public.sphere_sets(user_id, name)
  values (kullanici_id, 'Anı Kürelerim')
  on conflict (user_id) do nothing;

  select ss.id into strict set_id
  from public.sphere_sets ss where ss.user_id = kullanici_id;

  insert into public.spheres(sphere_set_id, name, emotion_type, nfc_uid)
  values
    (set_id, 'Mutluluk', 'mutluluk', null),
    (set_id, 'Hüzün', 'huzun', null),
    (set_id, 'Nostalji', 'nostalji', null)
  on conflict (sphere_set_id, emotion_type) do nothing;
end;
$$;

create or replace function ani_kureleri_private.dogrulanan_kullaniciyi_hazirla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ani_kureleri_private.baslangic_verilerini_tamamla(new.id);
  return new;
end;
$$;

-- Yetki yükselten fonksiyonların sahibi belirli ve güvenilir sunucu rolüdür.
alter function ani_kureleri_private.baslangic_verilerini_tamamla(uuid) owner to postgres;
alter function ani_kureleri_private.dogrulanan_kullaniciyi_hazirla() owner to postgres;
revoke all on function ani_kureleri_private.baslangic_verilerini_tamamla(uuid)
  from public, anon, authenticated, service_role;
revoke all on function ani_kureleri_private.dogrulanan_kullaniciyi_hazirla()
  from public, anon, authenticated, service_role;

-- E-posta onayı kapalı bir ortamda kullanıcı doğrudan doğrulanmış eklenebilir.
drop trigger if exists ani_kureleri_dogrulanmis_kayit on auth.users;
create trigger ani_kureleri_dogrulanmis_kayit
  after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function ani_kureleri_private.dogrulanan_kullaniciyi_hazirla();

-- Standart akış: kayıt olurken null olan doğrulama tarihi e-posta onayında dolar.
drop trigger if exists ani_kureleri_eposta_dogrulandi on auth.users;
create trigger ani_kureleri_eposta_dogrulandi
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function ani_kureleri_private.dogrulanan_kullaniciyi_hazirla();

-- Önceden doğrulanmış hesapların eksik başlangıç verilerini aynı fonksiyon tamamlar.
do $$
declare kullanici record;
begin
  for kullanici in
    select id from auth.users where email_confirmed_at is not null order by id
  loop
    perform ani_kureleri_private.baslangic_verilerini_tamamla(kullanici.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
