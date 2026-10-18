-- Yalnızca manuel, yedekli geri dönüş. Yeni modele ait veri varsa işlem DURUR.
DO $rollback$
BEGIN
  LOCK TABLE public.memories,public.memory_images,public.memory_feedback,public.emotion_categories
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.memory_feedback)
    OR EXISTS (SELECT 1 FROM public.memories m
      LEFT JOIN public.spheres s ON s.id=m.sphere_id
      LEFT JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      LEFT JOIN public.emotion_categories e ON e.legacy_emotion_type=s.emotion_type
      WHERE m.sphere_id IS NULL OR ss.user_id IS DISTINCT FROM m.user_id OR e.id IS DISTINCT FROM m.final_emotion_id
        OR m.analysis_status<>'not_required' OR m.final_emotion_source<>'legacy_manual'
        OR m.predicted_emotion_id IS NOT NULL OR m.predicted_confidence IS NOT NULL
        OR m.model_version IS NOT NULL OR m.analyzed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Yeni modele ait veri var. Kayıpsız downgrade mümkün değil; forward fix veya yedekten ayrı ortama kurtarma kullanın.';
  END IF;
  DROP TRIGGER memory_emotion_guard ON public.memories;
  DROP TRIGGER feedback_snapshot_guard ON public.memory_feedback;
  DROP TRIGGER emotion_identity_guard ON public.emotion_categories;
  DROP FUNCTION ani_kureleri_private.memory_emotion_guard();
  DROP FUNCTION ani_kureleri_private.feedback_snapshot_guard();
  DROP FUNCTION ani_kureleri_private.emotion_identity_guard();
  DROP TABLE public.memory_feedback;
  ALTER TABLE public.memories DROP CONSTRAINT memories_sphere_id_fkey;
  ALTER TABLE public.memories ALTER COLUMN sphere_id SET NOT NULL;
  ALTER TABLE public.memories ADD CONSTRAINT memories_sphere_id_fkey
    FOREIGN KEY(sphere_id) REFERENCES public.spheres(id) ON DELETE CASCADE;

  DROP POLICY memories_select_own ON public.memories;
  DROP POLICY memories_insert_own ON public.memories;
  DROP POLICY memories_update_own ON public.memories;
  DROP POLICY memories_delete_own ON public.memories;
  CREATE POLICY memories_select_own ON public.memories FOR SELECT TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.spheres s
      JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid())));
  CREATE POLICY memories_insert_own ON public.memories FOR INSERT TO authenticated WITH CHECK (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.spheres s
      JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid())));
  CREATE POLICY memories_update_own ON public.memories FOR UPDATE TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.spheres s
      JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid()))) WITH CHECK (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.spheres s
      JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid())));
  CREATE POLICY memories_delete_own ON public.memories FOR DELETE TO authenticated USING (
    user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.spheres s
      JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
      WHERE s.id=memories.sphere_id AND ss.user_id=(SELECT auth.uid())));
  DROP INDEX public.memories_user_date_idx;
  DROP INDEX public.memories_user_emotion_date_idx;
  CREATE INDEX memories_user_id_idx ON public.memories(user_id);
  ALTER TABLE public.memories
    DROP COLUMN analysis_status, DROP COLUMN predicted_emotion_id,
    DROP COLUMN predicted_confidence, DROP COLUMN final_emotion_id,
    DROP COLUMN final_emotion_source, DROP COLUMN analyzed_at,
    DROP COLUMN model_version, DROP COLUMN version;
  DROP TABLE public.emotion_categories;
  -- Tarihsel sütun izinlerini birebir geri yükle (yeni alanlar artık yok).
  REVOKE INSERT,UPDATE ON public.memories FROM public,anon,authenticated;
  REVOKE INSERT(id,user_id,sphere_id,title,description,image_url,memory_date,created_at)
    ON public.memories FROM public,anon,authenticated;
  REVOKE UPDATE(id,user_id,sphere_id,title,description,image_url,memory_date,created_at)
    ON public.memories FROM public,anon,authenticated;
  GRANT INSERT ON public.memories TO authenticated;
  GRANT UPDATE(sphere_id,title,description,image_url,memory_date) ON public.memories TO authenticated;
  NOTIFY pgrst,'reload schema';
END
$rollback$;
