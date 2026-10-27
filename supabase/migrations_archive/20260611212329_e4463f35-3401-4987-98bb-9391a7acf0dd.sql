-- 1) Tighten app_state INSERT to match UPDATE/DELETE (admins / chefs only on société keys)
DROP POLICY IF EXISTS "Insert app_state by societe" ON public.app_state;

CREATE POLICY "Insert app_state by societe"
ON public.app_state
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN key LIKE 's:%' THEN (
      public.has_societe_access(auth.uid(), public.app_state_societe_id(key))
      AND (
        public.is_admin(auth.uid())
        OR public.is_chef_compta(auth.uid())
        OR public.is_chef_grh(auth.uid())
      )
    )
    ELSE public.is_admin_general(auth.uid())
  END
);

-- 2) MFA recovery codes: explicitly deny client INSERT/DELETE.
--    All writes must go through service_role edge functions
--    (mfa-recovery-generate, mfa-recovery-use). service_role bypasses RLS.
CREATE POLICY "Deny client insert on mfa_recovery_codes"
ON public.mfa_recovery_codes
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Deny client delete on mfa_recovery_codes"
ON public.mfa_recovery_codes
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "Deny client update on mfa_recovery_codes"
ON public.mfa_recovery_codes
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);