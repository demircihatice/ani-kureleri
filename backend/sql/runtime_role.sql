-- MANUEL: Supabase SQL Editor'da yönetici rolüyle çalıştırılmak üzere hazırlanmıştır.
-- Bu dosya uygulama tarafından otomatik çalıştırılmaz. Parola içermez.
-- Uygulama tabloları, RLS, auth.uid(), trigger veya RPC değiştirilmez.
begin;
do $$
declare runtime_oid oid;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated'
      and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb) then
    raise exception 'authenticated rolünü inceleyin; güvenlik koşulları sağlanmıyor.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_runtime') then
    select oid into runtime_oid from pg_roles where rolname = 'app_runtime';
    if shobj_description(runtime_oid, 'pg_authid') is distinct from 'ani_kureleri_runtime_v1' then
      raise exception 'app_runtime rolü zaten var ve bu script tarafından oluşturulmamış.';
    end if;
    if exists (select 1 from pg_roles where oid = runtime_oid and
        (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))
       or exists (select 1 from pg_class where relowner = runtime_oid)
       or exists (select 1 from pg_namespace where nspowner = runtime_oid)
       or exists (select 1 from pg_proc where proowner = runtime_oid)
       or exists (select 1 from pg_database where datdba = runtime_oid) then
      raise exception 'Runtime rolünde beklenmeyen yetki/sahiplik var; değiştirilmedi.';
    end if;
    if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
        where m.member = runtime_oid and (r.rolname <> 'authenticated' or m.admin_option)) then
      raise exception 'Runtime rolünde beklenmeyen rol üyeliği var.';
    end if;
  else
    create role app_runtime login noinherit nosuperuser nobypassrls
      nocreatedb nocreaterole noreplication;
    comment on role app_runtime is 'ani_kureleri_runtime_v1';
  end if;
  alter role app_runtime noinherit;
  if current_setting('server_version_num')::integer >= 160000 then
    execute 'grant authenticated to app_runtime with admin false';
    execute 'grant authenticated to app_runtime with inherit false';
    execute 'grant authenticated to app_runtime with set true';
  else
    grant authenticated to app_runtime;
  end if;
  execute format('grant connect on database %I to app_runtime', current_database());
end $$;

-- NOINHERIT sayesinde günlük tablo izinleri ancak SET LOCAL ROLE sonrasında kullanılabilir.
grant usage on schema public, auth to app_runtime;
grant execute on function auth.uid() to app_runtime;

-- Başka şemalara erişim veya app tablolarına doğrudan yetki eklenmez.
do $$
begin
  if has_schema_privilege('app_runtime', 'public', 'CREATE') then
    raise exception 'public şemasında CREATE yetkisi var (PUBLIC dahil). Önce mevcut grant yapısını inceleyin.';
  end if;
end $$;
commit;

-- PAROLA: psql ile yönetici bağlantısı kurup \password app_runtime kullanın.
-- Script rolün parolasını üretmez, değiştirmez veya ekrana yazmaz.
-- Yeni rol parolası belirlenmeden backend bağlantısı kurulamaz.
