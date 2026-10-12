-- Anı Küreleri / Aşama 3
-- Supabase SQL Editor'da dosyanın tamamını tek seferde çalıştırın.
-- Kullanıcı, profil, küre seti veya küre kaydı OLUŞTURMAZ.
begin;

-- Bilinmeyen tabloları/politikaları değiştirerek mevcut veriye zarar vermeyiz.
-- Aynı migration'ın tekrar çalıştırılması desteklenir.
do $$
declare
  tablo text;
  nesne regclass;
begin
  foreach tablo in array array['profiles', 'sphere_sets', 'spheres', 'memories'] loop
    nesne := to_regclass('public.' || tablo);
    if nesne is not null then
      if obj_description(nesne, 'pg_class') is distinct from 'ani_kureleri_asama3_v1' then
        raise exception 'public.% zaten var ve bu migration tarafından oluşturulmamış. Mevcut tabloyu silmeden şemayı inceleyin.', tablo;
      end if;
      if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = tablo
          and policyname not in (
            tablo || '_select_own', tablo || '_insert_own',
            tablo || '_update_own', tablo || '_delete_own'
          )
      ) then
        raise exception 'public.% üzerinde bu migration dışında bir RLS politikası var. İşlem durduruldu.', tablo;
      end if;
    end if;
  end loop;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.sphere_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.spheres (
  id uuid primary key default gen_random_uuid(),
  sphere_set_id uuid not null references public.sphere_sets(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  emotion_type text not null check (emotion_type in ('mutluluk', 'huzun', 'nostalji')),
  nfc_uid text null check (nfc_uid is null or char_length(btrim(nfc_uid)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint spheres_set_emotion_unique unique (sphere_set_id, emotion_type)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sphere_id uuid not null references public.spheres(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text null check (description is null or char_length(description) <= 5000),
  -- İleride özel Storage nesnesinin kalıcı yolu saklanabilir; süreli signed URL saklanmaz.
  image_url text not null check (char_length(btrim(image_url)) between 1 and 2048),
  memory_date date not null,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'ani_kureleri_asama3_v1';
comment on table public.sphere_sets is 'ani_kureleri_asama3_v1';
comment on table public.spheres is 'ani_kureleri_asama3_v1';
comment on table public.memories is 'ani_kureleri_asama3_v1';

-- PK ve UNIQUE kısıtları zaten indeks oluşturur.
-- (sphere_set_id, emotion_type) UNIQUE indeksi spheres FK sorgularını da destekler.
create index if not exists sphere_sets_user_id_idx on public.sphere_sets(user_id);
create unique index if not exists spheres_nfc_uid_unique_idx
  on public.spheres(nfc_uid) where nfc_uid is not null;
create index if not exists memories_user_id_idx on public.memories(user_id);
create index if not exists memories_sphere_date_idx
  on public.memories(sphere_id, memory_date desc, created_at desc);

alter table public.profiles enable row level security;
alter table public.sphere_sets enable row level security;
alter table public.spheres enable row level security;
alter table public.memories enable row level security;

-- Grants ve RLS birlikte gerekir. TRUNCATE/REFERENCES/TRIGGER verilmez.
revoke all on table public.profiles, public.sphere_sets, public.spheres, public.memories
  from public, anon, authenticated;
-- Tekrar çalıştırmada mevcut sütun izinleri de temizlenir.
revoke all (id, full_name, created_at) on public.profiles from public, anon, authenticated;
revoke all (id, user_id, name, created_at) on public.sphere_sets from public, anon, authenticated;
revoke all (id, sphere_set_id, name, emotion_type, nfc_uid, created_at)
  on public.spheres from public, anon, authenticated;
revoke all (id, user_id, sphere_id, title, description, image_url, memory_date, created_at)
  on public.memories from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, delete on table public.profiles, public.sphere_sets, public.spheres, public.memories
  to authenticated;
-- Kimlik, sahip ve oluşturulma zamanı sonradan değiştirilemez.
grant update (full_name) on public.profiles to authenticated;
grant update (name) on public.sphere_sets to authenticated;
grant update (sphere_set_id, name, emotion_type, nfc_uid) on public.spheres to authenticated;
grant update (sphere_id, title, description, image_url, memory_date) on public.memories to authenticated;

-- Her tablo için dört ayrı politika. Eski sürüm yalnızca bu dosyanın politikalarıdır.
-- USING eski/mevcut satırı, WITH CHECK eklenecek veya güncellenecek satırı denetler.
-- İfadeler tek yerde tanımlanarak SELECT/INSERT/UPDATE/DELETE arasında sapma önlenir.
do $$
declare
  tablo text;
  sahiplik text;
begin
  foreach tablo in array array['profiles', 'sphere_sets', 'spheres', 'memories'] loop
    sahiplik := case tablo
      when 'profiles' then 'id = (select auth.uid())'
      when 'sphere_sets' then 'user_id = (select auth.uid())'
      when 'spheres' then
        'exists (select 1 from public.sphere_sets ss
          where ss.id = spheres.sphere_set_id and ss.user_id = (select auth.uid()))'
      when 'memories' then
        'user_id = (select auth.uid()) and exists (
          select 1 from public.spheres s
          join public.sphere_sets ss on ss.id = s.sphere_set_id
          where s.id = memories.sphere_id and ss.user_id = (select auth.uid()))'
    end;

    execute format('drop policy if exists %I on public.%I', tablo || '_select_own', tablo);
    execute format('drop policy if exists %I on public.%I', tablo || '_insert_own', tablo);
    execute format('drop policy if exists %I on public.%I', tablo || '_update_own', tablo);
    execute format('drop policy if exists %I on public.%I', tablo || '_delete_own', tablo);

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      tablo || '_select_own', tablo, sahiplik);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
      tablo || '_insert_own', tablo, sahiplik);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      tablo || '_update_own', tablo, sahiplik, sahiplik);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
      tablo || '_delete_own', tablo, sahiplik);
  end loop;
end $$;

-- PostgREST şema önbelleğini yenilemesi için bildirim; commit sonrası teslim edilir.
notify pgrst, 'reload schema';
commit;
