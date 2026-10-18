-- Aşama 17. Tek DO komutu atomiktir; canlıya otomatik uygulanmaz.
DO $migration$
BEGIN
  IF to_regclass('public.memory_creation_requests') IS NULL THEN
    RAISE EXCEPTION 'Önce Aşama 14 ve 15 migration uygulanmalıdır.';
  END IF;
  IF to_regclass('public.analysis_jobs') IS NOT NULL THEN
    RAISE EXCEPTION 'Analiz migration zaten var; revision durumunu kontrol edin.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit)
     OR current_user IN ('anon','authenticated','app_runtime','service_role') THEN
    RAISE EXCEPTION 'Migration sahibi ve kısıtlı app_runtime rolü hazırlanmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memories WHERE analysis_status IN ('queued','processing')) THEN
    RAISE EXCEPTION 'Job olmadan başlamış analizler var; önce veriyi inceleyin.';
  END IF;
  ALTER TABLE public.memories DROP CONSTRAINT memories_analysis_status_check;
  ALTER TABLE public.memories ADD CONSTRAINT memories_analysis_status_check CHECK
    (analysis_status IN ('not_required','awaiting_nfc','queued','processing','completed','failed','cancelled'));
  CREATE TABLE public.analysis_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('awaiting_nfc','queued','processing','completed','failed','cancelled')),
    trigger_source text CHECK (trigger_source IN ('nfc','development_simulation')),
    started_at timestamptz, completed_at timestamptz, failed_at timestamptz,
    error_code text CHECK (error_code ~ '^[a-z0-9_]{1,80}$'),
    model_version text CHECK (char_length(btrim(model_version)) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status='completed') = (completed_at IS NOT NULL)),
    CHECK ((status='failed') = (failed_at IS NOT NULL)),
    CHECK (status<>'completed' OR (model_version IS NOT NULL AND started_at IS NOT NULL))
  );
  COMMENT ON TABLE public.analysis_jobs IS 'ani_kureleri_asama17_v1';
  CREATE UNIQUE INDEX analysis_jobs_one_active ON public.analysis_jobs(memory_id)
    WHERE status IN ('awaiting_nfc','queued','processing');
  CREATE INDEX analysis_jobs_user_memory ON public.analysis_jobs(user_id,memory_id,created_at DESC);
  ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.analysis_jobs FROM public,anon,authenticated,service_role;
  GRANT SELECT ON public.analysis_jobs TO authenticated;
  CREATE POLICY analysis_jobs_select_own ON public.analysis_jobs FOR SELECT TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.memories m
      WHERE m.id=analysis_jobs.memory_id AND m.user_id=(SELECT auth.uid())));

  -- Kullanıcı eski sütun izinleriyle model/feedback akışını atlayamaz.
  REVOKE INSERT(final_emotion_id),UPDATE(final_emotion_id) ON public.memories FROM authenticated;
  CREATE FUNCTION ani_kureleri_private.analysis_memory_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
  BEGIN
    IF current_user='authenticated' AND TG_OP='UPDATE' AND OLD.analysis_status<>'not_required'
      AND ROW(NEW.sphere_id,NEW.final_emotion_id,NEW.final_emotion_source,NEW.analysis_status)
      IS DISTINCT FROM ROW(OLD.sphere_id,OLD.final_emotion_id,OLD.final_emotion_source,OLD.analysis_status) THEN
      RAISE EXCEPTION 'Analiz ve duygu değişiklikleri backend tarafından yönetilir.' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER a_analysis_memory_guard BEFORE UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.analysis_memory_guard();
  CREATE FUNCTION ani_kureleri_private.analysis_job_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
  BEGIN
    IF NEW.analysis_status='awaiting_nfc' THEN
      INSERT INTO public.analysis_jobs(memory_id,user_id,status) VALUES(NEW.id,NEW.user_id,'awaiting_nfc');
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER analysis_job_created AFTER INSERT ON public.memories
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.analysis_job_created();
  INSERT INTO public.analysis_jobs(memory_id,user_id,status)
    SELECT id,user_id,'awaiting_nfc' FROM public.memories WHERE analysis_status='awaiting_nfc';

  -- Yalnızca backend login rolü çağırabilir; PostgREST authenticated/service_role çağıramaz.
  -- SECURITY DEFINER içindeki her satır auth.uid sahipliğiyle açıkça kilitlenir.
  CREATE FUNCTION ani_kureleri_private.analysis_command(p_memory uuid,p_action text,p_code text DEFAULT NULL,
    p_confidence double precision DEFAULT NULL,p_model text DEFAULT NULL,p_expected bigint DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
  DECLARE m public.memories%rowtype; j public.analysis_jobs%rowtype; e uuid; f uuid;
  BEGIN
    IF session_user<>'app_runtime' OR auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Yalnızca doğrulanmış backend bağlamı.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO m FROM public.memories WHERE id=p_memory AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
    SELECT * INTO j FROM public.analysis_jobs WHERE memory_id=m.id AND user_id=m.user_id
      ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
    IF p_action IN ('nfc','development_simulation') THEN
      IF m.analysis_status IN ('queued','processing') AND j.status=m.analysis_status THEN
        RETURN jsonb_build_object('job_id',j.id,'changed',false);
      END IF;
      IF m.analysis_status<>'awaiting_nfc' OR j.status IS DISTINCT FROM 'awaiting_nfc' THEN
        RETURN jsonb_build_object('error','conflict');
      END IF;
      UPDATE public.analysis_jobs SET status='queued',trigger_source=p_action WHERE id=j.id;
      UPDATE public.memories SET analysis_status='queued' WHERE id=m.id;
    ELSIF p_action='feedback' THEN
      IF m.analysis_status<>'completed' OR m.predicted_emotion_id IS NULL THEN
        RETURN jsonb_build_object('error','conflict');
      END IF;
      IF p_expected IS NULL OR p_expected<>m.version THEN RETURN jsonb_build_object('error','conflict'); END IF;
      SELECT id INTO e FROM public.emotion_categories WHERE code=p_code AND is_active;
      IF e IS NULL THEN RETURN jsonb_build_object('error','invalid_emotion'); END IF;
      IF e=m.final_emotion_id THEN RETURN jsonb_build_object('changed',false); END IF;
      INSERT INTO public.memory_feedback(memory_id,user_id,corrected_emotion_id,request_key)
        VALUES(m.id,m.user_id,e,gen_random_uuid()) RETURNING id INTO f;
      -- Snapshot trigger UPDATE öncesi DB değerlerini alır; predicted alanları burada yazılmaz.
      UPDATE public.memories SET final_emotion_id=e,final_emotion_source='user',sphere_id=NULL WHERE id=m.id;
      RETURN jsonb_build_object('changed',true,'feedback_id',f);
    ELSIF p_action='result' THEN
      IF m.analysis_status<>'processing' OR j.status IS DISTINCT FROM 'processing'
        OR m.predicted_emotion_id IS NOT NULL THEN RETURN jsonb_build_object('error','conflict'); END IF;
      SELECT id INTO e FROM public.emotion_categories WHERE code=p_code AND is_active;
      IF e IS NULL OR p_confidence IS NULL OR NOT(p_confidence BETWEEN 0 AND 1)
        OR p_confidence='NaN'::float8 OR p_model IS NULL OR char_length(btrim(p_model)) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object('error','invalid_result');
      END IF;
      UPDATE public.memories SET predicted_emotion_id=e,predicted_confidence=p_confidence,
        model_version=btrim(p_model),analyzed_at=now(),final_emotion_id=e,final_emotion_source='model',
        sphere_id=NULL,analysis_status='completed' WHERE id=m.id;
      UPDATE public.analysis_jobs SET status='completed',completed_at=now(),model_version=btrim(p_model) WHERE id=j.id;
    ELSIF p_action IN ('processing','failed','cancelled') THEN
      IF (p_action='processing' AND m.analysis_status<>'queued') OR
         (p_action<>'processing' AND m.analysis_status NOT IN ('awaiting_nfc','queued','processing')) OR
         j.status IS DISTINCT FROM m.analysis_status THEN RETURN jsonb_build_object('error','conflict'); END IF;
      IF p_action='failed' AND (p_code IS NULL OR p_code !~ '^[a-z0-9_]{1,80}$') THEN
        RETURN jsonb_build_object('error','invalid_result'); END IF;
      UPDATE public.memories SET analysis_status=p_action WHERE id=m.id;
      UPDATE public.analysis_jobs SET status=p_action,
        started_at=CASE WHEN p_action='processing' THEN now() ELSE started_at END,
        failed_at=CASE WHEN p_action='failed' THEN now() ELSE NULL END,
        error_code=CASE WHEN p_action='failed' THEN p_code ELSE NULL END WHERE id=j.id;
    ELSE RETURN jsonb_build_object('error','invalid_action');
    END IF;
    RETURN jsonb_build_object('changed',true,'job_id',j.id);
  END $f$;
  REVOKE ALL ON FUNCTION ani_kureleri_private.analysis_memory_guard(),
    ani_kureleri_private.analysis_job_created(),
    ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint)
    FROM public,anon,authenticated,service_role;
  GRANT USAGE ON SCHEMA ani_kureleri_private TO app_runtime;
  GRANT EXECUTE ON FUNCTION ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint) TO app_runtime;
  NOTIFY pgrst,'reload schema';
END $migration$;
