
-- 1) ecritures_comptables: restrict INSERT/UPDATE to admins or compta service
DROP POLICY IF EXISTS ecritures_insert ON public.ecritures_comptables;
DROP POLICY IF EXISTS ecritures_update ON public.ecritures_comptables;

CREATE POLICY ecritures_insert ON public.ecritures_comptables
FOR INSERT TO authenticated
WITH CHECK (
  (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
  AND (is_admin_general(auth.uid()) OR is_admin(auth.uid()) OR in_service_compta(auth.uid()))
);

CREATE POLICY ecritures_update ON public.ecritures_comptables
FOR UPDATE TO authenticated
USING (
  (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
  AND (is_admin_general(auth.uid()) OR is_admin(auth.uid()) OR in_service_compta(auth.uid()))
)
WITH CHECK (
  (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
  AND (is_admin_general(auth.uid()) OR is_admin(auth.uid()) OR in_service_compta(auth.uid()))
);

-- 2) app_state: restrict UPDATE to admins / chefs (same scope as DELETE)
DROP POLICY IF EXISTS "Update app_state by societe" ON public.app_state;

CREATE POLICY "Update app_state by societe" ON public.app_state
FOR UPDATE TO authenticated
USING (
  CASE
    WHEN (key ~~ 's:%'::text) THEN (
      has_societe_access(auth.uid(), app_state_societe_id(key))
      AND (is_admin(auth.uid()) OR is_chef_compta(auth.uid()) OR is_chef_grh(auth.uid()))
    )
    ELSE is_admin_general(auth.uid())
  END
)
WITH CHECK (
  CASE
    WHEN (key ~~ 's:%'::text) THEN (
      has_societe_access(auth.uid(), app_state_societe_id(key))
      AND (is_admin(auth.uid()) OR is_chef_compta(auth.uid()) OR is_chef_grh(auth.uid()))
    )
    ELSE is_admin_general(auth.uid())
  END
);
