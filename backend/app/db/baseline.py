"""Baseline hazırlık kontrolü; canlı şema audit'i yerine geçtiği iddia edilmez."""

from sqlalchemy import text

from app.db.context import DbGuvenlikHatasi, uid_tanimini_dogrula

TARIHSEL_TABLOLAR = {'profiles', 'sphere_sets', 'spheres', 'memories', 'memory_images'}
UYGULAMA_TABLOLARI = TARIHSEL_TABLOLAR | {'emotion_categories', 'memory_feedback', 'memory_creation_requests', 'analysis_jobs'}


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        return name in (None, 'public')
    if type_ == 'table':
        return name in UYGULAMA_TABLOLARI and parent_names.get('schema_name') in (None, 'public')
    return True


def autogenerate_engelle(context, revision, directives):
    if getattr(context.config.cmd_opts, 'autogenerate', False):
        raise DbGuvenlikHatasi('ORM metadata kısmidir; autogenerate bu aşamada kapalıdır.')


def baseline_denetle(connection):
    satirlar = connection.execute(text("""
        SELECT c.relname, c.relrowsecurity, obj_description(c.oid, 'pg_class') AS marker,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r'
          AND c.relname IN ('profiles','sphere_sets','spheres','memories','memory_images')
    """)).mappings().all()
    if ({r['relname'] for r in satirlar} != TARIHSEL_TABLOLAR
            or any(not r['relrowsecurity'] or r['policies'] != 4 for r in satirlar)
            or any(r['marker'] != ('ani_kureleri_asama6_v1' if r['relname'] == 'memory_images'
                                  else 'ani_kureleri_asama3_v1') for r in satirlar)):
        raise DbGuvenlikHatasi('Tarihsel tablolar/RLS işaretleri baseline ile eşleşmiyor.')
    uid = connection.execute(text("""
        SELECT p.prosrc, p.prosecdef, l.lanname FROM pg_proc p
        JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='auth.uid()'::regprocedure
    """)).mappings().one_or_none()
    uid_tanimini_dogrula(uid)
    katalog = connection.execute(text("""
        SELECT to_regclass('public.emotion_categories') IS NOT NULL AS katalog,
               to_regclass('public.memory_feedback') IS NOT NULL AS feedback
    """)).mappings().one()
    if katalog['katalog'] != katalog['feedback']:
        raise DbGuvenlikHatasi('Kısmi duygu migration durumu bulundu.')
    yeni_sema = katalog['katalog']
    if yeni_sema:
        yeni = connection.execute(text("""
            SELECT count(*)=2 AND bool_and(c.relrowsecurity)
              AND bool_and(obj_description(c.oid,'pg_class')='ani_kureleri_asama14_v1')
            FROM pg_class c WHERE c.oid IN
              ('public.emotion_categories'::regclass,'public.memory_feedback'::regclass)
        """)).scalar_one()
        if not yeni:
            raise DbGuvenlikHatasi('Yeni duygu tabloları beklenen işaret/RLS ile eşleşmiyor.')
    hazir = connection.execute(text("""
        SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
          AND indexname='sphere_sets_user_id_unique_idx')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ani_kureleri_dogrulanmis_kayit')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ani_kureleri_eposta_dogrulandi')
        AND EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(
          'public.ani_olustur(uuid,uuid,text,text,date,text[])') AND NOT prosecdef)
        AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.memories'::regclass
          AND attname='sphere_id' AND attnotnull=:sphere_zorunlu AND NOT attisdropped)
        AS hazir
    """), {'sphere_zorunlu': not yeni_sema}).scalar_one()
    if not hazir:
        raise DbGuvenlikHatasi('Tarihsel index/trigger/RPC baseline ile eşleşmiyor.')
