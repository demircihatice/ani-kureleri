"""JWT'den gelen tek kimlik kaynağı, yalnızca açık transaction kapsamında aktarılır."""

import json
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import DogrulanmisKullanici


class DbGuvenlikHatasi(Exception):
    """Yanıta DB istisnasının ayrıntıları yerine genel mesaj aktarılır."""


# Gerçek pg_proc.prosrc bu izin listesinden geçer; desteklenmeyen fonksiyon tahmin edilmez.
UID_JSON = "select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid"
UID_COALESCE = """select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid"""


def uid_tanimini_dogrula(kayit) -> None:
    norm = lambda deger: re.sub(r'\s+', '', deger).lower().rstrip(';')
    if (kayit is None or kayit['lanname'] != 'sql' or kayit['prosecdef']
            or norm(kayit['prosrc']) not in {norm(UID_JSON), norm(UID_COALESCE)}):
        raise DbGuvenlikHatasi('auth.uid() tanımı desteklenmiyor; canlı tanımı inceleyin.')


ROL_DENETIMI = text("""
SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
       r.rolreplication, r.rolinherit, r.rolcanlogin,
       current_user = session_user AS temiz_rol,
       pg_has_role(session_user, 'authenticated', 'MEMBER') AS uye,
       pg_has_role(session_user, 'authenticated', 'USAGE') AS miras,
       EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid AND m.admin_option) AS admin_uyelik,
       EXISTS (
         SELECT 1 FROM pg_roles x
         WHERE x.rolname <> session_user AND x.rolname <> 'authenticated'
           AND pg_has_role(session_user, x.oid, 'MEMBER')
       ) AS fazla_uyelik,
       EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid)
       OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
       OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.proowner = r.oid)
       OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datdba = r.oid) AS sahip,
       has_schema_privilege(session_user, 'public', 'CREATE') AS sema_olusturma
FROM pg_roles r WHERE r.rolname = session_user
""")


def runtime_rolunu_dogrula(kayit) -> None:
    if (kayit is None or kayit['rolname'] != 'app_runtime'
            or not kayit['rolcanlogin'] or not kayit['temiz_rol'] or not kayit['uye']
            or any(kayit[k] for k in ('rolsuper', 'rolbypassrls', 'rolcreaterole',
                                      'rolcreatedb', 'rolreplication', 'rolinherit',
                                      'fazla_uyelik', 'sahip', 'sema_olusturma', 'admin_uyelik', 'miras'))):
        raise DbGuvenlikHatasi('Runtime DB rolü güvenlik koşullarını sağlamıyor.')


async def kullanici_baglamini_kur(session: AsyncSession, kullanici: DogrulanmisKullanici) -> None:
    if not session.in_transaction():
        raise DbGuvenlikHatasi('Açık transaction gerekli.')
    rol = (await session.execute(ROL_DENETIMI)).mappings().one_or_none()
    runtime_rolunu_dogrula(rol)
    auth_rolu = (await session.execute(text("""
        SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication,
               EXISTS (SELECT 1 FROM pg_class WHERE relowner = r.oid)
               OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = r.oid)
               OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner = r.oid)
               OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = r.oid) AS sahip,
               EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS uye
        FROM pg_roles r WHERE rolname = 'authenticated'
    """))).mappings().one_or_none()
    if auth_rolu is None or any(auth_rolu.values()):
        raise DbGuvenlikHatasi('authenticated rolü güvenli değil.')
    uid = (await session.execute(text("""
        SELECT p.prosrc, p.prosecdef, l.lanname FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
        WHERE p.oid = 'auth.uid()'::regprocedure
    """))).mappings().one_or_none()
    uid_tanimini_dogrula(uid)
    temiz = (await session.execute(text("""
        SELECT auth.uid() IS NULL
          AND coalesce(current_setting('request.jwt.claim.sub', true), '') = ''
          AND coalesce(current_setting('request.jwt.claims', true), '') IN ('', '{}')
          AS temiz
    """))).scalar_one()
    if not temiz:
        raise DbGuvenlikHatasi('Bağlantıda eski kullanıcı bağlamı bulundu.')
    # Aynı UUID legacy alana kopyalanmaz. Legacy kaynak yalnızca yerel olarak boşaltılır.
    claims = json.dumps({'sub': str(kullanici.user_id), 'role': 'authenticated'})
    await session.execute(text("""
        SELECT set_config('request.jwt.claim.sub', '', true),
               set_config('request.jwt.claims', :claims, true)
    """), {'claims': claims})
    await session.execute(text('SET LOCAL ROLE authenticated'))
    await session.execute(text('SET LOCAL row_security = on'))
    dogru = (await session.execute(text("""
        SELECT auth.uid() = CAST(:user_id AS uuid)
               AND current_user = 'authenticated' AS dogru
    """), {'user_id': str(kullanici.user_id)})).scalar_one()
    if not dogru:
        raise DbGuvenlikHatasi('DB kullanıcı bağlamı eşleşmedi.')
