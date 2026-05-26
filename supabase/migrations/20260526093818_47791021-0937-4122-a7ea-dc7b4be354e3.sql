
-- 1. Purge legacy global app_state rows containing PII / business data
DELETE FROM public.app_state
WHERE key NOT LIKE 's:%'
  AND key NOT LIKE 'global:%';

-- 2. Tighten SELECT policy: global (non s:) keys require admin_general
DROP POLICY IF EXISTS "View app_state by societe" ON public.app_state;
CREATE POLICY "View app_state by societe"
ON public.app_state
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN key LIKE 's:%' THEN has_societe_access(auth.uid(), app_state_societe_id(key))
    ELSE is_admin_general(auth.uid())
  END
);

-- Same restriction on INSERT/UPDATE/DELETE for non-societe keys
DROP POLICY IF EXISTS "Insert app_state by societe" ON public.app_state;
CREATE POLICY "Insert app_state by societe"
ON public.app_state
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN key LIKE 's:%' THEN
      has_societe_access(auth.uid(), app_state_societe_id(key))
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR is_admin_general(auth.uid())
        OR in_service_compta(auth.uid())
        OR in_service_grh(auth.uid())
        OR has_role(auth.uid(), 'comptable'::app_role)
        OR has_role(auth.uid(), 'rh'::app_role)
        OR has_role(auth.uid(), 'saisie'::app_role)
      )
    ELSE is_admin_general(auth.uid())
  END
);

DROP POLICY IF EXISTS "Update app_state by societe" ON public.app_state;
CREATE POLICY "Update app_state by societe"
ON public.app_state
FOR UPDATE
TO authenticated
USING (
  CASE
    WHEN key LIKE 's:%' THEN has_societe_access(auth.uid(), app_state_societe_id(key))
    ELSE is_admin_general(auth.uid())
  END
)
WITH CHECK (
  CASE
    WHEN key LIKE 's:%' THEN has_societe_access(auth.uid(), app_state_societe_id(key))
    ELSE is_admin_general(auth.uid())
  END
);

DROP POLICY IF EXISTS "Delete app_state by societe" ON public.app_state;
CREATE POLICY "Delete app_state by societe"
ON public.app_state
FOR DELETE
TO authenticated
USING (
  CASE
    WHEN key LIKE 's:%' THEN
      has_societe_access(auth.uid(), app_state_societe_id(key))
      AND (is_admin(auth.uid()) OR is_chef_compta(auth.uid()) OR is_chef_grh(auth.uid()))
    ELSE is_admin_general(auth.uid())
  END
);

-- 3. Convert employe block policy to RESTRICTIVE so it actually denies
DROP POLICY IF EXISTS employe_no_direct_app_state ON public.app_state;
CREATE POLICY employe_no_direct_app_state
ON public.app_state
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'employe'::app_role
  )
)
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'employe'::app_role
  )
);

-- 4. Fix mutable search_path on trigger helper functions
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_ecritures_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
