DO $migration$
BEGIN
  IF EXISTS(SELECT 1 FROM public.analysis_jobs WHERE status<>'awaiting_nfc')
     OR EXISTS(SELECT 1 FROM public.memory_feedback) THEN
    RAISE EXCEPTION 'Analiz/feedback geçmişi var; veri kaybettiren downgrade engellendi.';
  END IF;
  DROP TRIGGER analysis_job_created ON public.memories;
  DROP TRIGGER a_analysis_memory_guard ON public.memories;
  DROP FUNCTION ani_kureleri_private.analysis_job_created();
  DROP FUNCTION ani_kureleri_private.analysis_memory_guard();
  DROP FUNCTION ani_kureleri_private.analysis_command(uuid,text,text,double precision,text,bigint);
  DROP TABLE public.analysis_jobs;
  ALTER TABLE public.memories DROP CONSTRAINT memories_analysis_status_check;
  ALTER TABLE public.memories ADD CONSTRAINT memories_analysis_status_check CHECK
    (analysis_status IN ('not_required','awaiting_nfc','queued','processing','completed','failed'));
  GRANT INSERT(final_emotion_id),UPDATE(final_emotion_id) ON public.memories TO authenticated;
  NOTIFY pgrst,'reload schema';
END $migration$;
