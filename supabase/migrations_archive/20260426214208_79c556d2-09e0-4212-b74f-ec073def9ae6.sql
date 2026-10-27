CREATE OR REPLACE FUNCTION public.is_employe(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'employe'::public.app_role)
$$;