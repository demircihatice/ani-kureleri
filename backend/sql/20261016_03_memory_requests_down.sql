DO $rollback$
BEGIN
  LOCK TABLE public.memory_creation_requests IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.memory_creation_requests) THEN
    RAISE EXCEPTION 'İlk istek kayıtları var; idempotency geçmişi silinmez. Forward fix kullanın.';
  END IF;
  DROP TRIGGER memory_request_immutable ON public.memory_creation_requests;
  DROP FUNCTION ani_kureleri_private.memory_request_immutable();
  DROP TABLE public.memory_creation_requests;
  NOTIFY pgrst,'reload schema';
END $rollback$;
