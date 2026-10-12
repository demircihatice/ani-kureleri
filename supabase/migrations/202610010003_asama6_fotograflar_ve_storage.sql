-- Aşama 6: SQL Editor'da postgres rolüyle dosyanın tamamını çalıştırın.
-- Önce Aşama 3 ve 4 uygulanmış olmalı. Mevcut anılar değiştirilmez.
begin;
do $$
begin
  if to_regclass('public.memories') is null or to_regclass('public.spheres') is null then
    raise exception 'Önce Aşama 3 ve 4 SQL dosyalarını çalıştırın.';
  end if;
  if to_regclass('public.memory_images') is not null and
    obj_description(to_regclass('public.memory_images'),'pg_class') is distinct from 'ani_kureleri_asama6_v1' then
    raise exception 'memory_images zaten var ve bu migration tarafından oluşturulmamış.';
  end if;
  -- Permissive Storage politikaları OR ile birleşir. Bilinmeyen politikaları silmeyiz.
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and permissive='PERMISSIVE' and roles && array['public','anon','authenticated']::name[]
    and policyname not in ('ani_photos_select_own','ani_photos_insert_own','ani_photos_delete_unlinked')) then
    raise exception 'Storage üzerinde başka istemci politikaları var. Güvenliği incelemeden devam edilmedi; mevcut politikalar silinmedi.';
  end if;
  if exists (select 1 from storage.buckets where id='ani-fotograflari' and public) then
    raise exception 'ani-fotograflari bucket zaten public. Önce mevcut kullanımını inceleyin; bu uygulama private bucket gerektirir.';
  end if;
  if to_regprocedure('public.ani_olustur(uuid,uuid,text,text,date,text[])') is not null and
    obj_description(to_regprocedure('public.ani_olustur(uuid,uuid,text,text,date,text[])'),'pg_proc')
      is distinct from 'ani_kureleri_asama6_v1' then
    raise exception 'ani_olustur fonksiyonu zaten var ve bu migration tarafından oluşturulmamış.';
  end if;
end $$;

create table if not exists public.memory_images (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 2048),
  sort_order integer not null check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique(memory_id,sort_order)
);
comment on table public.memory_images is 'ani_kureleri_asama6_v1';
-- UNIQUE(memory_id,sort_order) indeksi FK ve sıralı fotoğraf sorgularını destekler.
alter table public.memory_images enable row level security;
revoke all on public.memory_images from public,anon,authenticated;
revoke all (id,memory_id,storage_path,sort_order,created_at) on public.memory_images from public,anon,authenticated;
grant select,insert,delete on public.memory_images to authenticated;
grant update(sort_order) on public.memory_images to authenticated;

do $$
declare sahiplik text := 'exists (select 1 from public.memories m
  where m.id=memory_images.memory_id and m.user_id=(select auth.uid()))';
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='memory_images'
    and policyname not in ('memory_images_select_own','memory_images_insert_own','memory_images_update_own','memory_images_delete_own')) then
    raise exception 'memory_images üzerinde bilinmeyen politika var.';
  end if;
  drop policy if exists memory_images_select_own on public.memory_images;
  drop policy if exists memory_images_insert_own on public.memory_images;
  drop policy if exists memory_images_update_own on public.memory_images;
  drop policy if exists memory_images_delete_own on public.memory_images;
  execute 'create policy memory_images_select_own on public.memory_images for select to authenticated using ('||sahiplik||')';
  execute 'create policy memory_images_insert_own on public.memory_images for insert to authenticated with check ('||sahiplik||
    ' and storage_path ~ (''^''||(select auth.uid())::text||''/''||memory_id::text||''/[0-4][.]jpg$''))';
  execute 'create policy memory_images_update_own on public.memory_images for update to authenticated using ('||sahiplik||') with check ('||sahiplik||')';
  execute 'create policy memory_images_delete_own on public.memory_images for delete to authenticated using ('||sahiplik||')';
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ani-fotograflari','ani-fotograflari',false,6291456,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists ani_photos_select_own on storage.objects;
drop policy if exists ani_photos_insert_own on storage.objects;
drop policy if exists ani_photos_delete_unlinked on storage.objects;
create policy ani_photos_select_own on storage.objects for select to authenticated using (
  bucket_id='ani-fotograflari' and split_part(name,'/',1)=(select auth.uid())::text
);
create policy ani_photos_insert_own on storage.objects for insert to authenticated with check (
  bucket_id='ani-fotograflari' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-4][.]jpg$')
);
-- Kaydedilmiş anının dosyaları yanlışlıkla hata temizliğinde silinmez.
create policy ani_photos_delete_unlinked on storage.objects for delete to authenticated using (
  bucket_id='ani-fotograflari' and split_part(name,'/',1)=(select auth.uid())::text
  and not exists(select 1 from public.memory_images mi where mi.storage_path=objects.name)
  and not exists(select 1 from public.memories m where m.image_url=objects.name)
);
-- UPDATE politikası yok: upsert/üzerine yazma yapılmaz.

create or replace function public.ani_olustur(
  p_id uuid, p_sphere_id uuid, p_title text, p_description text, p_memory_date date, p_paths text[]
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare
  sahip uuid := auth.uid();
  mevcut public.memories%rowtype;
  onceki_yollar text[];
  yol text;
  sira integer := 0;
begin
  if sahip is null then raise exception 'Giriş gerekli.' using errcode='42501'; end if;
  if p_id is null or p_sphere_id is null or p_memory_date is null or p_title is null
    or char_length(btrim(p_title)) not between 1 and 200
    or char_length(coalesce(p_description,''))>5000
    or coalesce(cardinality(p_paths),0) not between 1 and 5 then
    raise exception 'Başlık, tarih, küre ve 1–5 fotoğraf gerekli.' using errcode='22023';
  end if;
  if (select count(distinct x) from unnest(p_paths) x)<>cardinality(p_paths) then
    raise exception 'Fotoğraf yolları benzersiz ve dolu olmalı.' using errcode='22023';
  end if;
  -- Aynı anı kimliğiyle yinelenen/eşzamanlı kayıt istekleri sıralanır.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  select * into mevcut from public.memories where id=p_id;
  if found then
    select array_agg(storage_path order by sort_order) into onceki_yollar
      from public.memory_images where memory_id=p_id;
    if mevcut.user_id=sahip and mevcut.sphere_id=p_sphere_id and mevcut.title=btrim(p_title)
      and mevcut.description is not distinct from nullif(btrim(p_description),'')
      and mevcut.memory_date=p_memory_date and onceki_yollar=p_paths then return p_id; end if;
    raise exception 'Bu anı kimliği farklı bir kayıt için kullanılmış.' using errcode='23505';
  end if;
  -- RLS altında görünmeyen küreye anı eklenemez.
  if not exists(select 1 from public.spheres where id=p_sphere_id) then
    raise exception 'Küre bulunamadı veya sana ait değil.' using errcode='42501';
  end if;
  foreach yol in array p_paths loop
    if yol is distinct from sahip::text||'/'||p_id::text||'/'||sira::text||'.jpg' then
      raise exception 'Fotoğraf yolu kullanıcı/anı/sıra ile eşleşmiyor.' using errcode='22023';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='ani-fotograflari' and name=yol) then
      raise exception 'Önce tüm fotoğraflar yüklenmeli.' using errcode='22023';
    end if;
    sira := sira+1;
  end loop;
  insert into public.memories(id,user_id,sphere_id,title,description,image_url,memory_date)
    values(p_id,sahip,p_sphere_id,btrim(p_title),nullif(btrim(p_description),''),p_paths[1],p_memory_date);
  insert into public.memory_images(memory_id,storage_path,sort_order)
    select p_id,x.yol,(x.sira-1)::integer from unnest(p_paths) with ordinality x(yol,sira);
  return p_id;
end $$;
comment on function public.ani_olustur(uuid,uuid,text,text,date,text[]) is 'ani_kureleri_asama6_v1';
revoke all on function public.ani_olustur(uuid,uuid,text,text,date,text[]) from public,anon;
grant execute on function public.ani_olustur(uuid,uuid,text,text,date,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
