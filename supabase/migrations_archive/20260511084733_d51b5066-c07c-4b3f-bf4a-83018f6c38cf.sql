ALTER TABLE public.bulletins_paie
  ALTER COLUMN employe_id TYPE bigint USING employe_id::bigint;