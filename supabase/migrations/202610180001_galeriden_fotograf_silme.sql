begin;

-- Kapak ve fotoğraf satırları aynı işlemde güncellenir. Mevcut RLS/Storage
-- politikaları değiştirilmez; Storage dosyaları yalnız bağlantı kalkınca silinir.
create or replace function public.galeri_fotograflarini_sil(p_fotograflar jsonb)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  sahip uuid := auth.uid();
  secim record;
  ani public.memories%rowtype;
  yollar text[];
  kalan text;
begin
  if sahip is null then raise exception 'Giriş gerekli.' using errcode='42501'; end if;
  if jsonb_typeof(p_fotograflar) is distinct from 'array' then
    raise exception 'Fotoğraf seçimi geçersiz.' using errcode='22023';
  end if;
  if jsonb_array_length(p_fotograflar) not between 1 and 1000 then
    raise exception '1–1000 fotoğraf seç.' using errcode='22023';
  end if;
  for secim in select * from jsonb_to_recordset(p_fotograflar) as x(memory_id uuid, storage_path text) loop
    if secim.memory_id is null or secim.storage_path is null or
      secim.storage_path !~ ('^'||sahip::text||'/'||secim.memory_id::text||'/[0-4][.]jpg$') then
      raise exception 'Fotoğraf sana ait değil veya yolu geçersiz.' using errcode='42501';
    end if;
  end loop;

  for secim in select distinct x.memory_id from jsonb_to_recordset(p_fotograflar) as x(memory_id uuid, storage_path text)
    order by x.memory_id loop
    select * into ani from public.memories where id=secim.memory_id for update;
    if not found then continue; end if; -- Yanıt kaybından sonra güvenli tekrar.
    if ani.user_id <> sahip then raise exception 'Anı sana ait değil.' using errcode='42501'; end if;
    if coalesce(to_jsonb(ani)->>'analysis_status','') in ('queued','processing') then
      raise exception 'Analiz sürerken fotoğraf silinemez.' using errcode='55000';
    end if;
    select array_agg(distinct x.storage_path) into yollar
      from jsonb_to_recordset(p_fotograflar) as x(memory_id uuid, storage_path text) where x.memory_id=ani.id;
    delete from public.memory_images where memory_id=ani.id and storage_path=any(yollar);
    select storage_path into kalan from public.memory_images where memory_id=ani.id order by sort_order,id limit 1;
    if kalan is null then
      if ani.image_url=any(yollar) then
        delete from public.memories where id=ani.id and user_id=sahip;
      end if;
    else
      -- Aralıklı sort_order değerleri korunur; dosya yolları yeniden adlandırılmaz.
      update public.memories set image_url=kalan where id=ani.id and user_id=sahip;
    end if;
  end loop;
  select array_agg(distinct x.storage_path) into yollar
    from jsonb_to_recordset(p_fotograflar) as x(memory_id uuid, storage_path text);
  if exists(select 1 from public.memory_images where storage_path=any(yollar)) or
    exists(select 1 from public.memories where image_url=any(yollar)) then
    raise exception 'Fotoğraf hâlâ bir anıya bağlı.' using errcode='42501';
  end if;
  return yollar;
end $$;
revoke all on function public.galeri_fotograflarini_sil(jsonb) from public, anon;
grant execute on function public.galeri_fotograflarini_sil(jsonb) to authenticated;
comment on function public.galeri_fotograflarini_sil(jsonb) is 'Kullanıcıya ait seçili fotoğrafları atomik kaldırır; son fotoğrafta anıyı da siler.';
notify pgrst, 'reload schema';
commit;
