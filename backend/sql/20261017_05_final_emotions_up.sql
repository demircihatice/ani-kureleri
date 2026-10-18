-- Aşama 17.1 / yalnızca yerel hazırlık. Tarihsel SQL ve kullanıcı satırları değişmez.
DO $migration$
BEGIN
  IF to_regclass('public.analysis_jobs') IS NULL THEN
    RAISE EXCEPTION 'Önce Aşama 17 migration uygulanmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='emotion_categories' AND column_name='category_kind') THEN
    RAISE EXCEPTION '17.1 zaten uygulanmış; Alembic revision durumunu kontrol edin.';
  END IF;
  LOCK TABLE public.emotion_categories, public.memories IN SHARE ROW EXCLUSIVE MODE;
  ALTER TABLE public.emotion_categories ADD COLUMN category_kind text NOT NULL DEFAULT 'model'
    CHECK (category_kind IN ('model','fallback','legacy'));
  -- Eski UUID, kod ve eşleme korunur; kullanılmayan sınıflar silinmez.
  UPDATE public.emotion_categories SET sort_order=sort_order+100, is_active=false, category_kind='legacy';
  UPDATE public.emotion_categories SET display_name_tr=v.ad,color_hex=v.renk,sort_order=v.sira,
    is_active=true,category_kind='model'
    FROM (VALUES ('anger','Öfke','#E53935',1),('sadness','Üzüntü','#1E88E5',5),
      ('surprise','Şaşkınlık','#1A237E',6),('fear','Korku','#8E24AA',7)) AS v(kod,ad,renk,sira)
    WHERE emotion_categories.code=v.kod;
  INSERT INTO public.emotion_categories(id,code,display_name_tr,color_hex,sort_order,is_active,category_kind) VALUES
    ('17100000-0000-4000-8000-000000000002','shame','Utanç','#FB8C00',2,true,'model'),
    ('17100000-0000-4000-8000-000000000003','joy','Neşe','#FDD835',3,true,'model'),
    ('17100000-0000-4000-8000-000000000004','disgust','Tiksinti','#43A047',4,true,'model'),
    ('17100000-0000-4000-8000-000000000008','alexithymia','Aleksitimi','#111111',8,true,'fallback');
  ALTER TABLE public.emotion_categories ADD CONSTRAINT emotion_category_kind_code_check CHECK (
    (category_kind='model' AND code IN ('anger','shame','joy','disgust','sadness','surprise','fear'))
    OR (category_kind='fallback' AND code='alexithymia')
    OR (category_kind='legacy' AND NOT is_active));
  COMMENT ON COLUMN public.emotion_categories.category_kind IS
    '7 model sınıfı; Aleksitimi yalnız fallback. Legacy kimlikler geçmişi korumak için pasiftir.';

  ALTER TABLE public.memories DROP CONSTRAINT memories_final_pair_check;
  ALTER TABLE public.memories ADD CONSTRAINT memories_final_pair_check CHECK (
    (final_emotion_id IS NULL AND final_emotion_source IS NULL) OR
    (final_emotion_id IS NOT NULL AND final_emotion_source IS NOT NULL
      AND final_emotion_source IN ('legacy_manual','model','fallback','user')));

  -- Eski başarılı tahminler değişmeden okunabilir. Yeni tahmin yalnız 7 sınıftan olur.
  CREATE FUNCTION ani_kureleri_private.final_category_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
  BEGIN
    IF NEW.predicted_emotion_id IS NOT NULL AND
      (TG_OP='INSERT' OR NEW.predicted_emotion_id IS DISTINCT FROM OLD.predicted_emotion_id) AND NOT EXISTS (
        SELECT 1 FROM public.emotion_categories WHERE id=NEW.predicted_emotion_id
          AND is_active AND category_kind='model') THEN
      RAISE EXCEPTION 'Tahmin yalnızca yedi model sınıfından olabilir.' USING ERRCODE='23514';
    END IF;
    IF NEW.final_emotion_source='fallback' AND (NEW.predicted_emotion_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.emotion_categories WHERE id=NEW.final_emotion_id
          AND code='alexithymia' AND category_kind='fallback' AND is_active)) THEN
      RAISE EXCEPTION 'Fallback sonucu yalnız Aleksitimi olabilir.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER z_final_category_guard BEFORE INSERT OR UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.final_category_guard();
  REVOKE ALL ON FUNCTION ani_kureleri_private.final_category_guard() FROM public,anon,authenticated,service_role;

  -- Eski callable kaldırılır; aynı sahiplik/rol/snapshot denetimleri korunur.
  DROP FUNCTION ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint);
  CREATE FUNCTION ani_kureleri_private.analysis_command(p_memory uuid,p_action text,p_code text DEFAULT NULL,
    p_confidence double precision DEFAULT NULL,p_model text DEFAULT NULL,p_expected bigint DEFAULT NULL,p_fallback boolean DEFAULT false)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
  DECLARE m public.memories%rowtype; j public.analysis_jobs%rowtype; e uuid; f uuid; final_id uuid;
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
      SELECT id INTO e FROM public.emotion_categories WHERE code=p_code AND is_active AND category_kind='model';
      IF e IS NULL OR p_confidence IS NULL OR NOT(p_confidence BETWEEN 0 AND 1)
        OR p_confidence='NaN'::float8 OR p_model IS NULL OR char_length(btrim(p_model)) NOT BETWEEN 1 AND 200 THEN
        RETURN jsonb_build_object('error','invalid_result');
      END IF;
      IF p_fallback IS NULL THEN RETURN jsonb_build_object('error','invalid_result'); END IF;
      SELECT id INTO final_id FROM public.emotion_categories WHERE code='alexithymia' AND is_active AND category_kind='fallback';
      IF p_fallback AND final_id IS NULL THEN RETURN jsonb_build_object('error','invalid_result'); END IF;
      UPDATE public.memories SET predicted_emotion_id=e,predicted_confidence=p_confidence,
        model_version=btrim(p_model),analyzed_at=now(),final_emotion_id=CASE WHEN p_fallback THEN final_id ELSE e END,
        final_emotion_source=CASE WHEN p_fallback THEN 'fallback' ELSE 'model' END,
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
  REVOKE ALL ON FUNCTION ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint,boolean)
    FROM public,anon,authenticated,service_role;
  GRANT EXECUTE ON FUNCTION ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint,boolean) TO app_runtime;
  NOTIFY pgrst,'reload schema';
END $migration$;
