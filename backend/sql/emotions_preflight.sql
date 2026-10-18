-- Salt okunur. Yazmaları durdurduktan sonra sonuçları yerel not olarak saklayın.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT count(*) AS memory_count,
  md5(coalesce(string_agg(id::text,',' ORDER BY id),'')) AS memory_uuid_fingerprint,
  md5(coalesce(string_agg(to_jsonb(m)::text,',' ORDER BY id),'')) AS memory_data_fingerprint
FROM public.memories m;
SELECT count(*) AS image_count,
  md5(coalesce(string_agg(to_jsonb(mi)::text,',' ORDER BY id),'')) AS image_data_fingerprint
FROM public.memory_images mi;
SELECT count(*) AS unmatched_or_wrong_owner FROM public.memories m
LEFT JOIN public.spheres s ON s.id=m.sphere_id
LEFT JOIN public.sphere_sets ss ON ss.id=s.sphere_set_id
WHERE s.id IS NULL OR ss.user_id IS DISTINCT FROM m.user_id
  OR s.emotion_type NOT IN ('mutluluk','huzun','nostalji');
SELECT s.emotion_type,count(*) FROM public.memories m
JOIN public.spheres s ON s.id=m.sphere_id GROUP BY s.emotion_type ORDER BY s.emotion_type;
ROLLBACK;
