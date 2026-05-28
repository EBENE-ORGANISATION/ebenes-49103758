
-- 1) Realtime: restrict INSERT (broadcast) to societe members
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='realtime_tenant_scoped_write') THEN
    DROP POLICY "realtime_tenant_scoped_write" ON realtime.messages;
  END IF;
END $$;

CREATE POLICY "realtime_tenant_scoped_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_general(auth.uid())
  OR (
    realtime.topic() ~ '^s:[0-9a-f-]{36}'
    AND public.has_societe_access(
      auth.uid(),
      (substring(realtime.topic() from '^s:([0-9a-f-]{36})'))::uuid
    )
  )
);

-- 2) Drop overly broad tenant_isolation ALL policies
DROP POLICY IF EXISTS "tenant_isolation" ON public.transactions;
DROP POLICY IF EXISTS "tenant_isolation" ON public.retenues;
DROP POLICY IF EXISTS "tenant_isolation" ON public.sanctions;

-- 3) Restrict ecritures_comptables SELECT to admin + compta service
DROP POLICY IF EXISTS "ecritures_select" ON public.ecritures_comptables;

CREATE POLICY "ecritures_select"
ON public.ecritures_comptables
FOR SELECT
USING (
  public.is_admin_general(auth.uid())
  OR (
    public.has_societe_access(auth.uid(), societe_id)
    AND (public.is_admin(auth.uid()) OR public.in_service_compta(auth.uid()))
  )
);
