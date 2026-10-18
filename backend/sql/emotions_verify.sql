-- Salt okunur. Migration sonrasında, yazmaları yeniden açmadan çalıştırın.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT count(*) AS memory_count,
  md5(coalesce(string_agg(id::text,',' ORDER BY id),'')) AS memory_uuid_fingerprint,
  md5(coalesce(string_agg((to_jsonb(m)-ARRAY['analysis_status','predicted_emotion_id',
    'predicted_confidence','final_emotion_id','final_emotion_source','analyzed_at','model_version','version'])::text,
    ',' ORDER BY id),'')) AS memory_data_fingerprint
FROM public.memories m;
SELECT count(*) AS image_count,
  md5(coalesce(string_agg(to_jsonb(mi)::text,',' ORDER BY id),'')) AS image_data_fingerprint
FROM public.memory_images mi;
SELECT code,display_name_tr,color_hex,sort_order,is_active FROM public.emotion_categories ORDER BY sort_order;
SELECT count(*) FILTER (WHERE is_active) AS active_count,
  count(*) FILTER (WHERE code='nostalgia' AND NOT is_active) AS inactive_nostalgia_count
FROM public.emotion_categories;
SELECT count(*) AS unmatched_or_wrong_owner FROM public.memories m
LEFT JOIN public.spheres s ON s.id=m.sphere_id
LEFT JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
WHERE m.sphere_id IS NOT NULL AND (s.id IS NULL OR ss.user_id IS DISTINCT FROM m.user_id);
SELECT count(*) AS legacy_conversion_errors FROM public.memories m
LEFT JOIN public.spheres s ON s.id=m.sphere_id
LEFT JOIN public.emotion_categories e ON e.legacy_emotion_type=s.emotion_type
WHERE m.final_emotion_source='legacy_manual' AND
 (m.final_emotion_id IS DISTINCT FROM e.id OR m.analysis_status<>'not_required'
  OR m.predicted_emotion_id IS NOT NULL OR m.predicted_confidence IS NOT NULL
  OR m.analyzed_at IS NOT NULL OR m.model_version IS NOT NULL);
SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid='public.memories'::regclass AND confrelid='public.spheres'::regclass;
SELECT c.relname,c.relrowsecurity,(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count
FROM pg_class c WHERE c.oid IN ('public.memories'::regclass,'public.emotion_categories'::regclass,'public.memory_feedback'::regclass);
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('memories','memory_feedback');
ROLLBACK;
