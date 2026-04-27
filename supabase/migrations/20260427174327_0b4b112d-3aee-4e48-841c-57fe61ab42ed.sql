-- Helper : récupère l'id employé lié au compte auth (via employes.user_id).
CREATE OR REPLACE FUNCTION public.current_employe_id(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employes WHERE user_id = _user_id LIMIT 1;
$$;

-- ─── employes : self-access ────────────────────────────────────────────
DROP POLICY IF EXISTS employes_select ON public.employes;
CREATE POLICY employes_select ON public.employes
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR user_id = auth.uid()
);

-- ─── absences : self-access ────────────────────────────────────────────
DROP POLICY IF EXISTS absences_select ON public.absences;
CREATE POLICY absences_select ON public.absences
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR employe_id = current_employe_id(auth.uid())
);

-- Permettre à un employé de créer ses propres demandes d'absence
DROP POLICY IF EXISTS absences_insert ON public.absences;
CREATE POLICY absences_insert ON public.absences
FOR INSERT TO authenticated
WITH CHECK (
  (is_admin_general(auth.uid()) OR has_societe_access(auth.uid(), societe_id))
  AND (
    is_admin_general(auth.uid())
    OR is_admin(auth.uid())
    OR in_service_compta(auth.uid())
    OR in_service_grh(auth.uid())
    OR (employe_id = current_employe_id(auth.uid()) AND statut_validation = 'en_validation')
  )
);

-- ─── primes : self-access ──────────────────────────────────────────────
DROP POLICY IF EXISTS primes_select ON public.primes;
CREATE POLICY primes_select ON public.primes
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR employe_id = current_employe_id(auth.uid())
);

-- ─── sanctions : self-access ───────────────────────────────────────────
DROP POLICY IF EXISTS sanctions_select ON public.sanctions;
CREATE POLICY sanctions_select ON public.sanctions
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR employe_id = current_employe_id(auth.uid())
);

-- ─── heures_sup : self-access ──────────────────────────────────────────
DROP POLICY IF EXISTS heures_sup_select ON public.heures_sup;
CREATE POLICY heures_sup_select ON public.heures_sup
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR employe_id = current_employe_id(auth.uid())
);

-- ─── retenues : self-access ────────────────────────────────────────────
DROP POLICY IF EXISTS retenues_select ON public.retenues;
CREATE POLICY retenues_select ON public.retenues
FOR SELECT TO authenticated
USING (
  is_admin_general(auth.uid())
  OR is_admin(auth.uid())
  OR in_service_compta(auth.uid())
  OR in_service_grh(auth.uid())
  OR employe_id = current_employe_id(auth.uid())
);