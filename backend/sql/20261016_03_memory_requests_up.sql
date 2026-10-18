-- Aşama 15: ilk POST özeti PATCH/analizden bağımsız korunur. Tek komut = atomik.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='memories' AND column_name='analysis_status') THEN
    RAISE EXCEPTION 'Önce Aşama 14 migration uygulanmalıdır.';
  END IF;
  IF to_regclass('public.memory_creation_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'Memory request tablosu zaten var; Alembic revision durumunu inceleyin.';
  END IF;
  CREATE TABLE public.memory_creation_requests (
    memory_id uuid PRIMARY KEY REFERENCES public.memories(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  COMMENT ON TABLE public.memory_creation_requests IS 'ani_kureleri_asama15_v1';
  ALTER TABLE public.memory_creation_requests ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.memory_creation_requests FROM public,anon,authenticated;
  GRANT SELECT ON public.memory_creation_requests TO authenticated;
  GRANT INSERT(memory_id,user_id,payload_hash) ON public.memory_creation_requests TO authenticated;
  CREATE POLICY memory_requests_select_own ON public.memory_creation_requests FOR SELECT TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.memories m
      WHERE m.id=memory_creation_requests.memory_id AND m.user_id=(SELECT auth.uid())));
  CREATE POLICY memory_requests_insert_own ON public.memory_creation_requests FOR INSERT TO authenticated WITH CHECK (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.memories m
      WHERE m.id=memory_creation_requests.memory_id AND m.user_id=(SELECT auth.uid())));
  CREATE FUNCTION ani_kureleri_private.memory_request_immutable() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
    BEGIN
      RAISE EXCEPTION 'İlk kayıt isteğinin özeti değiştirilemez.' USING ERRCODE='23514';
    END $fn$;
  CREATE TRIGGER memory_request_immutable BEFORE UPDATE ON public.memory_creation_requests
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.memory_request_immutable();
  REVOKE ALL ON FUNCTION ani_kureleri_private.memory_request_immutable() FROM public,anon,authenticated,service_role;
  NOTIFY pgrst,'reload schema';
END $migration$;
