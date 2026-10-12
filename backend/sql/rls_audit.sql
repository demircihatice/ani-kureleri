-- SALT OKUNUR. SQL Editor'da yönetici hesabıyla inceleyin; parolalar sorgulanmaz.
begin read only;
select pg_get_functiondef('auth.uid()'::regprocedure) as auth_uid_tanimi;
select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication,
       rolinherit, rolcanlogin
from pg_roles where rolname in ('app_runtime', 'authenticated');
select parent.rolname as verilen_rol, child.rolname as uye, m.admin_option
from pg_auth_members m join pg_roles parent on parent.oid=m.roleid
join pg_roles child on child.oid=m.member where child.rolname='app_runtime';
select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
       (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('profiles','sphere_sets','spheres','memories','memory_images') order by c.relname;
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename in
  ('profiles','sphere_sets','spheres','memories','memory_images') order by tablename, policyname;
select p.oid::regprocedure::text as function_name, p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='ani_kureleri_private' or (n.nspname='public' and p.proname='ani_olustur');
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgname in ('ani_kureleri_dogrulanmis_kayit','ani_kureleri_eposta_dogrulandi');
select grantee, table_name, privilege_type from information_schema.table_privileges
where table_schema='public' and grantee in ('app_runtime','authenticated')
  and table_name in ('profiles','sphere_sets','spheres','memories','memory_images')
order by grantee,table_name,privilege_type;
select id, public from storage.buckets where id='ani-fotograflari';
select policyname, cmd, roles from pg_policies where schemaname='storage' and tablename='objects';
rollback;
