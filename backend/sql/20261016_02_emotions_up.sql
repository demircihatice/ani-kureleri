-- Aşama 14 / tek kaynak SQL. Alembic revision da bu dosyayı kullanır.
-- Tek DO komutu tek transaction'dır; hata halinde tüm değişiklikler geri alınır.
-- Canlıda yalnızca yedek + ön denetimden sonra, bakım aralığında manuel uygulanır.
DO $migration$
DECLARE
  once_ani bigint;
  once_fotograf bigint;
  fk record;
BEGIN
  IF to_regclass('public.emotion_categories') IS NOT NULL
     OR to_regclass('public.memory_feedback') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
         AND table_name='memories' AND column_name IN ('analysis_status','final_emotion_id','version')) THEN
    RAISE EXCEPTION 'Aşama 14 nesneleri zaten var veya şema farklı; tekrar uygulamayın, revision durumunu inceleyin.';
  END IF;
  IF obj_description('public.memories'::regclass, 'pg_class') IS DISTINCT FROM 'ani_kureleri_asama3_v1'
     OR obj_description('public.memory_images'::regclass, 'pg_class') IS DISTINCT FROM 'ani_kureleri_asama6_v1'
     OR obj_description('ani_kureleri_private'::regnamespace, 'pg_namespace') IS DISTINCT FROM 'ani_kureleri_asama4_v1'
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='memories'
       AND policyname NOT IN ('memories_select_own','memories_insert_own','memories_update_own','memories_delete_own')) THEN
    RAISE EXCEPTION 'Beklenen tarihsel şema/RLS bulunamadı.';
  END IF;
  -- Kopyalama ve doğrulama sırasında bu dört tabloya eşzamanlı yazma yapılmaz.
  LOCK TABLE public.sphere_sets, public.spheres, public.memories, public.memory_images
    IN SHARE ROW EXCLUSIVE MODE;
  CREATE TEMP TABLE asama14_once_anilar ON COMMIT DROP AS
    SELECT id, to_jsonb(m) AS eski_satir FROM public.memories m;
  CREATE TEMP TABLE asama14_once_fotograflar ON COMMIT DROP AS
    SELECT id, to_jsonb(mi) AS eski_satir FROM public.memory_images mi;
  SELECT count(*) INTO once_ani FROM asama14_once_anilar;
  SELECT count(*) INTO once_fotograf FROM asama14_once_fotograflar;
  IF EXISTS (
    SELECT 1 FROM public.memories m LEFT JOIN public.spheres s ON s.id=m.sphere_id
    LEFT JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
    WHERE s.id IS NULL OR ss.user_id IS DISTINCT FROM m.user_id
      OR s.emotion_type NOT IN ('mutluluk','huzun','nostalji')
  ) THEN
    RAISE EXCEPTION 'Eşleşmeyen legacy duygu veya sahiplik var; hiçbir anı dönüştürülmedi.';
  END IF;

  CREATE TABLE public.emotion_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    display_name_tr text NOT NULL CHECK (char_length(btrim(display_name_tr)) BETWEEN 1 AND 100),
    color_hex text NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order integer NOT NULL UNIQUE CHECK (sort_order >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Geçiş eşleştirmesi de aynı katalogda; servislerde ikinci bir liste tutulmaz.
    legacy_emotion_type text UNIQUE
  );
  COMMENT ON TABLE public.emotion_categories IS 'ani_kureleri_asama14_v1';
  INSERT INTO public.emotion_categories
    (id,code,display_name_tr,color_hex,sort_order,is_active,legacy_emotion_type) VALUES
    ('14000000-0000-4000-8000-000000000001','happiness','Mutluluk','#F2CF7A',1,true,'mutluluk'),
    ('14000000-0000-4000-8000-000000000002','sadness','Hüzün','#9DBCD4',2,true,'huzun'),
    ('14000000-0000-4000-8000-000000000003','anger','Öfke','#DDA09A',3,true,null),
    ('14000000-0000-4000-8000-000000000004','fear','Korku','#B3A3CB',4,true,null),
    ('14000000-0000-4000-8000-000000000005','calm','Sakinlik','#A8C5AF',5,true,null),
    ('14000000-0000-4000-8000-000000000006','surprise','Şaşkınlık','#E5B68B',6,true,null),
    ('14000000-0000-4000-8000-000000000007','love','Sevgi','#DDAEC2',7,true,null),
    ('14000000-0000-4000-8000-000000000008','nostalgia','Nostalji','#C7B49B',8,false,'nostalji');

  ALTER TABLE public.memories
    ADD COLUMN analysis_status text NOT NULL DEFAULT 'not_required',
    ADD COLUMN predicted_emotion_id uuid REFERENCES public.emotion_categories(id) ON DELETE RESTRICT,
    ADD COLUMN predicted_confidence double precision,
    ADD COLUMN final_emotion_id uuid REFERENCES public.emotion_categories(id) ON DELETE RESTRICT,
    ADD COLUMN final_emotion_source text,
    ADD COLUMN analyzed_at timestamptz,
    ADD COLUMN model_version text,
    ADD COLUMN version bigint NOT NULL DEFAULT 1;

  UPDATE public.memories m SET final_emotion_id=e.id, final_emotion_source='legacy_manual'
    FROM public.spheres s JOIN public.emotion_categories e ON e.legacy_emotion_type=s.emotion_type
    WHERE m.sphere_id=s.id;
  IF EXISTS (SELECT 1 FROM public.memories WHERE final_emotion_id IS NULL) THEN
    RAISE EXCEPTION 'Bazı legacy anılar eşleşmedi; migration durduruldu.';
  END IF;

  ALTER TABLE public.memories
    ADD CONSTRAINT memories_analysis_status_check CHECK (analysis_status IN
      ('not_required','awaiting_nfc','queued','processing','completed','failed')),
    ADD CONSTRAINT memories_confidence_check CHECK (predicted_confidence BETWEEN 0 AND 1),
    ADD CONSTRAINT memories_version_check CHECK (version >= 1),
    ADD CONSTRAINT memories_model_version_check CHECK (model_version IS NULL OR char_length(btrim(model_version)) BETWEEN 1 AND 200),
    ADD CONSTRAINT memories_prediction_bundle_check CHECK (
      (predicted_emotion_id IS NULL AND predicted_confidence IS NULL AND analyzed_at IS NULL AND model_version IS NULL)
      OR (predicted_emotion_id IS NOT NULL AND predicted_confidence IS NOT NULL AND analyzed_at IS NOT NULL AND model_version IS NOT NULL)),
    ADD CONSTRAINT memories_prediction_status_check CHECK (
      (analysis_status='completed') = (predicted_emotion_id IS NOT NULL)),
    ADD CONSTRAINT memories_final_pair_check CHECK (
      (final_emotion_id IS NULL AND final_emotion_source IS NULL)
      OR (final_emotion_id IS NOT NULL AND final_emotion_source IS NOT NULL
          AND final_emotion_source IN ('legacy_manual','model','user'))),
    ADD CONSTRAINT memories_final_required_check CHECK (
      analysis_status NOT IN ('not_required','completed') OR final_emotion_id IS NOT NULL),
    ADD CONSTRAINT memories_model_source_check CHECK (
      final_emotion_source IS DISTINCT FROM 'model'
      OR (predicted_emotion_id IS NOT NULL AND final_emotion_id=predicted_emotion_id));

  -- Tarihsel constraint adı varsayılmaz; gerçek FK bulunup güvenli davranışla yenilenir.
  FOR fk IN SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid='public.memories'::regclass AND c.contype='f'
      AND c.confrelid='public.spheres'::regclass
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid='public.memories'::regclass AND attname='sphere_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.memories DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  ALTER TABLE public.memories ALTER COLUMN sphere_id DROP NOT NULL;
  ALTER TABLE public.memories ADD CONSTRAINT memories_sphere_id_fkey
    FOREIGN KEY(sphere_id) REFERENCES public.spheres(id) ON DELETE SET NULL;

  DROP POLICY memories_select_own ON public.memories;
  DROP POLICY memories_insert_own ON public.memories;
  DROP POLICY memories_update_own ON public.memories;
  DROP POLICY memories_delete_own ON public.memories;
  CREATE POLICY memories_select_own ON public.memories FOR SELECT TO authenticated USING (
    user_id=(SELECT auth.uid()) AND (sphere_id IS NULL OR EXISTS (
      SELECT 1 FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid()))));
  CREATE POLICY memories_insert_own ON public.memories FOR INSERT TO authenticated WITH CHECK (
    user_id=(SELECT auth.uid()) AND (sphere_id IS NULL OR EXISTS (
      SELECT 1 FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid()))));
  CREATE POLICY memories_update_own ON public.memories FOR UPDATE TO authenticated USING (
    user_id=(SELECT auth.uid()) AND (sphere_id IS NULL OR EXISTS (
      SELECT 1 FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid())))) WITH CHECK (
    user_id=(SELECT auth.uid()) AND (sphere_id IS NULL OR EXISTS (
      SELECT 1 FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid()))));
  CREATE POLICY memories_delete_own ON public.memories FOR DELETE TO authenticated USING (
    user_id=(SELECT auth.uid()) AND (sphere_id IS NULL OR EXISTS (
      SELECT 1 FROM public.spheres s JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid()))));

  CREATE TABLE public.memory_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    predicted_emotion_id uuid NOT NULL REFERENCES public.emotion_categories(id) ON DELETE RESTRICT,
    previous_final_emotion_id uuid NOT NULL REFERENCES public.emotion_categories(id) ON DELETE RESTRICT,
    corrected_emotion_id uuid NOT NULL REFERENCES public.emotion_categories(id) ON DELETE RESTRICT,
    predicted_confidence double precision NOT NULL CHECK (predicted_confidence BETWEEN 0 AND 1),
    model_version text NOT NULL CHECK (char_length(btrim(model_version)) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL DEFAULT now(),
    request_key uuid NOT NULL,
    UNIQUE(user_id,request_key),
    CHECK (previous_final_emotion_id <> corrected_emotion_id)
  );
  COMMENT ON TABLE public.memory_feedback IS 'ani_kureleri_asama14_v1';
  ALTER TABLE public.emotion_categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.memory_feedback ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.emotion_categories, public.memory_feedback FROM public,anon,authenticated;
  GRANT SELECT ON public.emotion_categories, public.memory_feedback TO authenticated;
  -- Sistem kataloğu kişisel veri değildir. Pasif legacy adları da okunabilir; API yalnız aktifleri döndürür.
  CREATE POLICY emotions_read_catalog ON public.emotion_categories FOR SELECT TO authenticated USING (true);
  CREATE POLICY feedback_select_own ON public.memory_feedback FOR SELECT TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.memories m
      WHERE m.id=memory_feedback.memory_id AND m.user_id=(SELECT auth.uid())));
  -- Feedback yazma grant/policy yok; ileride ayrı, denetlenmiş backend akışı açacaktır.

  CREATE FUNCTION ani_kureleri_private.emotion_identity_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code
         OR NEW.legacy_emotion_type IS DISTINCT FROM OLD.legacy_emotion_type THEN
        RAISE EXCEPTION 'Kategori kimliği ve kodu değiştirilemez.' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $fn$;
  CREATE TRIGGER emotion_identity_guard BEFORE UPDATE ON public.emotion_categories
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.emotion_identity_guard();

  CREATE FUNCTION ani_kureleri_private.memory_emotion_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
    DECLARE eslesen uuid;
    BEGIN
      IF TG_OP='UPDATE' THEN
        IF OLD.predicted_emotion_id IS NOT NULL AND
          ROW(NEW.predicted_emotion_id,NEW.predicted_confidence,NEW.analyzed_at,NEW.model_version)
          IS DISTINCT FROM ROW(OLD.predicted_emotion_id,OLD.predicted_confidence,OLD.analyzed_at,OLD.model_version) THEN
          RAISE EXCEPTION 'İlk başarılı model tahmini değiştirilemez.' USING ERRCODE='23514';
        END IF;
        IF NEW.version IS DISTINCT FROM OLD.version THEN
          RAISE EXCEPTION 'Version veritabanı tarafından yönetilir.' USING ERRCODE='23514';
        END IF;
        NEW.version := OLD.version+1;
      END IF;
      IF NEW.sphere_id IS NOT NULL THEN
        SELECT e.id INTO eslesen FROM public.spheres s
          JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
          JOIN public.emotion_categories e ON e.legacy_emotion_type=s.emotion_type
          WHERE s.id=NEW.sphere_id AND ss.user_id=NEW.user_id;
        IF eslesen IS NULL THEN
          RAISE EXCEPTION 'Eski küre kullanıcıya ait değil veya eşleşmiyor.' USING ERRCODE='42501';
        END IF;
      END IF;
      IF TG_OP='INSERT' AND NEW.final_emotion_id IS NULL AND eslesen IS NOT NULL AND NEW.analysis_status='not_required' THEN
        NEW.final_emotion_id := eslesen;
        NEW.final_emotion_source := 'legacy_manual';
      ELSIF TG_OP='UPDATE' AND NEW.sphere_id IS DISTINCT FROM OLD.sphere_id AND NEW.sphere_id IS NOT NULL THEN
        IF NEW.final_emotion_id IS DISTINCT FROM OLD.final_emotion_id AND NEW.final_emotion_id IS DISTINCT FROM eslesen THEN
          RAISE EXCEPTION 'Küre ve son duygu çelişiyor.' USING ERRCODE='23514';
        END IF;
        NEW.final_emotion_id := eslesen;
        NEW.final_emotion_source := CASE WHEN NEW.predicted_emotion_id IS NULL THEN 'legacy_manual' ELSE 'user' END;
      ELSIF (TG_OP='INSERT' AND NEW.final_emotion_id IS NOT NULL)
         OR (TG_OP='UPDATE' AND NEW.final_emotion_id IS DISTINCT FROM OLD.final_emotion_id) THEN
        IF NEW.final_emotion_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.emotion_categories WHERE id=NEW.final_emotion_id AND is_active) THEN
          RAISE EXCEPTION 'Yeni seçim aktif bir kategori olmalıdır.' USING ERRCODE='23514';
        END IF;
        IF current_user='authenticated' OR NEW.final_emotion_source IS NULL THEN
          NEW.final_emotion_source := CASE WHEN NEW.final_emotion_id IS NULL THEN NULL ELSE 'user' END;
        END IF;
        IF eslesen IS NOT NULL AND eslesen IS DISTINCT FROM NEW.final_emotion_id THEN NEW.sphere_id := NULL; END IF;
      END IF;
      IF TG_OP='INSERT' AND current_user='authenticated' AND NEW.analysis_status NOT IN ('not_required','awaiting_nfc') THEN
        RAISE EXCEPTION 'Analiz durumu sunucu tarafından yönetilir.' USING ERRCODE='42501';
      END IF;
      RETURN NEW;
    END $fn$;
  CREATE TRIGGER memory_emotion_guard BEFORE INSERT OR UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.memory_emotion_guard();

  CREATE FUNCTION ani_kureleri_private.feedback_snapshot_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
    DECLARE ani public.memories%rowtype;
    BEGIN
      IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Feedback kaydı değiştirilemez.' USING ERRCODE='23514';
      END IF;
      SELECT * INTO ani FROM public.memories WHERE id=NEW.memory_id AND user_id=NEW.user_id FOR UPDATE;
      IF NOT FOUND OR ani.predicted_emotion_id IS NULL THEN
        RAISE EXCEPTION 'Feedback için kullanıcıya ait analiz edilmiş anı gerekir.' USING ERRCODE='23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.emotion_categories WHERE id=NEW.corrected_emotion_id AND is_active) THEN
        RAISE EXCEPTION 'Düzeltme aktif kategori olmalıdır.' USING ERRCODE='23514';
      END IF;
      NEW.predicted_emotion_id := ani.predicted_emotion_id;
      NEW.predicted_confidence := ani.predicted_confidence;
      NEW.model_version := ani.model_version;
      NEW.previous_final_emotion_id := ani.final_emotion_id;
      RETURN NEW;
    END $fn$;
  CREATE TRIGGER feedback_snapshot_guard BEFORE INSERT OR UPDATE ON public.memory_feedback
    FOR EACH ROW EXECUTE FUNCTION ani_kureleri_private.feedback_snapshot_guard();
  REVOKE ALL ON FUNCTION ani_kureleri_private.emotion_identity_guard(),
    ani_kureleri_private.memory_emotion_guard(),ani_kureleri_private.feedback_snapshot_guard()
    FROM public,anon,authenticated,service_role;

  -- Tablo INSERT grant'i yeni model kolonlarını da açardı; sütun izinlerine daraltılır.
  REVOKE INSERT,UPDATE ON public.memories FROM public,anon,authenticated;
  REVOKE INSERT(id,user_id,sphere_id,title,description,image_url,memory_date,created_at,
    analysis_status,predicted_emotion_id,predicted_confidence,final_emotion_id,final_emotion_source,analyzed_at,model_version,version)
    ON public.memories FROM public,anon,authenticated;
  REVOKE UPDATE(id,user_id,sphere_id,title,description,image_url,memory_date,created_at,
    analysis_status,predicted_emotion_id,predicted_confidence,final_emotion_id,final_emotion_source,analyzed_at,model_version,version)
    ON public.memories FROM public,anon,authenticated;
  GRANT INSERT(id,user_id,sphere_id,title,description,image_url,memory_date,created_at,analysis_status,final_emotion_id)
    ON public.memories TO authenticated;
  GRANT UPDATE(sphere_id,title,description,image_url,memory_date,final_emotion_id)
    ON public.memories TO authenticated;

  CREATE INDEX memories_user_date_idx ON public.memories(user_id,memory_date DESC,created_at DESC,id DESC);
  CREATE INDEX memories_user_emotion_date_idx ON public.memories(user_id,final_emotion_id,memory_date DESC,created_at DESC,id DESC);
  CREATE INDEX feedback_memory_idx ON public.memory_feedback(memory_id,created_at DESC);
  -- Yeni user/date indeksi eski salt user_id indeksinin sol önekini kapsar.
  DROP INDEX public.memories_user_id_idx;

  IF (SELECT count(*) FROM public.memories) <> once_ani
     OR (SELECT count(*) FROM public.memory_images) <> once_fotograf
     OR EXISTS (SELECT 1 FROM asama14_once_anilar o FULL JOIN public.memories m USING(id)
       WHERE o.id IS NULL OR m.id IS NULL OR o.eski_satir IS DISTINCT FROM
       (to_jsonb(m)-ARRAY['analysis_status','predicted_emotion_id','predicted_confidence',
         'final_emotion_id','final_emotion_source','analyzed_at','model_version','version']))
     OR EXISTS (SELECT 1 FROM asama14_once_fotograflar o FULL JOIN public.memory_images mi USING(id)
       WHERE o.id IS NULL OR mi.id IS NULL OR o.eski_satir IS DISTINCT FROM to_jsonb(mi))
     OR EXISTS (SELECT 1 FROM public.memories m JOIN public.spheres s ON s.id=m.sphere_id
       JOIN public.emotion_categories e ON e.legacy_emotion_type=s.emotion_type
       WHERE m.final_emotion_id IS DISTINCT FROM e.id OR m.final_emotion_source<>'legacy_manual'
         OR m.analysis_status<>'not_required' OR m.predicted_emotion_id IS NOT NULL
         OR m.predicted_confidence IS NOT NULL OR m.model_version IS NOT NULL OR m.analyzed_at IS NOT NULL)
     OR (SELECT count(*) FROM public.emotion_categories WHERE is_active)<>7 THEN
    RAISE EXCEPTION 'Veri koruma doğrulaması başarısız; migration tamamen geri alındı.';
  END IF;
  RAISE NOTICE 'Anı önce/sonra: %/%, fotoğraf önce/sonra: %/%. UUID, eski alanlar ve fotoğraf yolları korundu.',
    once_ani,(SELECT count(*) FROM public.memories),once_fotograf,(SELECT count(*) FROM public.memory_images);
  NOTIFY pgrst,'reload schema';
END
$migration$;
