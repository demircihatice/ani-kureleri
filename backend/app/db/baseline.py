"""Baseline hazırlık kontrolü; canlı şema audit'i yerine geçtiği iddia edilmez."""

from sqlalchemy import text

from app.db.context import DbGuvenlikHatasi, uid_tanimini_dogrula

UYGULAMA_TABLOLARI = {'profiles', 'sphere_sets', 'spheres', 'memories', 'memory_images'}


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        return name in (None, 'public')
    if type_ == 'table':
        return name in UYGULAMA_TABLOLARI and parent_names.get('schema_name') in (None, 'public')
    return True


def autogenerate_engelle(context, revision, directives):
    if getattr(context.config.cmd_opts, 'autogenerate', False):
        raise DbGuvenlikHatasi('ORM metadata henüz yok; autogenerate bu aşamada kapalıdır.')


def baseline_denetle(connection):
    satirlar = connection.execute(text("""
        SELECT c.relname, c.relrowsecurity, obj_description(c.oid, 'pg_class') AS marker,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r'
          AND c.relname IN ('profiles','sphere_sets','spheres','memories','memory_images')
    """)).mappings().all()
    if ({r['relname'] for r in satirlar} != UYGULAMA_TABLOLARI
            or any(not r['relrowsecurity'] or r['policies'] != 4 for r in satirlar)
            or any(r['marker'] != ('ani_kureleri_asama6_v1' if r['relname'] == 'memory_images'
                                  else 'ani_kureleri_asama3_v1') for r in satirlar)):
        raise DbGuvenlikHatasi('Tarihsel tablolar/RLS işaretleri baseline ile eşleşmiyor.')
    uid = connection.execute(text("""
        SELECT p.prosrc, p.prosecdef, l.lanname FROM pg_proc p
        JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='auth.uid()'::regprocedure
    """)).mappings().one_or_none()
    uid_tanimini_dogrula(uid)
    hazir = connection.execute(text("""
        SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
          AND indexname='sphere_sets_user_id_unique_idx')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ani_kureleri_dogrulanmis_kayit')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ani_kureleri_eposta_dogrulandi')
        AND EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(
          'public.ani_olustur(uuid,uuid,text,text,date,text[])') AND NOT prosecdef)
        AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.memories'::regclass
          AND attname='sphere_id' AND attnotnull AND NOT attisdropped)
        AS hazir
    """)).scalar_one()
    if not hazir:
        raise DbGuvenlikHatasi('Tarihsel index/trigger/RPC baseline ile eşleşmiyor.')
