
-- 1. AUDIT LOG: consolidate insert policies, force user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert audit log" ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. ECRITURES: restrict DELETE to admins / compta service
DROP POLICY IF EXISTS ecritures_delete ON public.ecritures_comptables;
CREATE POLICY ecritures_delete ON public.ecritures_comptables
  FOR DELETE
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid())))
  );

-- 3. EMPLOYES: scope select by societe_id for non-super-admins
DROP POLICY IF EXISTS employes_select ON public.employes;
CREATE POLICY employes_select ON public.employes
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (user_id = auth.uid())
  );

-- 4. HR tables: add societe scope on SELECT
DROP POLICY IF EXISTS absences_select ON public.absences;
CREATE POLICY absences_select ON public.absences
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (employe_id = current_employe_id(auth.uid()))
  );

DROP POLICY IF EXISTS heures_sup_select ON public.heures_sup;
CREATE POLICY heures_sup_select ON public.heures_sup
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (employe_id = current_employe_id(auth.uid()))
  );

DROP POLICY IF EXISTS sanctions_select ON public.sanctions;
CREATE POLICY sanctions_select ON public.sanctions
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (employe_id = current_employe_id(auth.uid()))
  );

DROP POLICY IF EXISTS primes_select ON public.primes;
CREATE POLICY primes_select ON public.primes
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (employe_id = current_employe_id(auth.uid()))
  );

DROP POLICY IF EXISTS retenues_select ON public.retenues;
CREATE POLICY retenues_select ON public.retenues
  FOR SELECT
  USING (
    is_admin_general(auth.uid())
    OR (has_societe_access(auth.uid(), societe_id)
        AND (is_admin(auth.uid()) OR in_service_compta(auth.uid()) OR in_service_grh(auth.uid())))
    OR (employe_id = current_employe_id(auth.uid()))
  );

-- 5. REALTIME: restrict tenant-scoped channels
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_tenant_scoped_read ON realtime.messages;
CREATE POLICY realtime_tenant_scoped_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 's:%' THEN
        public.has_societe_access(
          auth.uid(),
          NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
        )
      ELSE public.is_admin_general(auth.uid())
    END
  );
