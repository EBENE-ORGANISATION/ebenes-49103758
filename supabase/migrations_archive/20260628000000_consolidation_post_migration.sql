-- ============================================================================
-- Consolidation post-migration (Lovable → projet propre yblucgmxofyelziwlvxu)
-- Capture les objets créés/recréés manuellement pendant la migration pour que
-- `supabase db push` sur une base vierge reproduise l'état fonctionnel complet.
--   - Surcharges des fonctions helper RLS (versions sans argument / 1 argument)
--   - Fonction app_state_societe_id
--   - Policies des tables de base Lovable (societes, user_societes, custom_*)
-- Idempotent : peut être rejoué sans risque.
-- ============================================================================

-- ─── Surcharges fonctions helper RLS ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_general()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN RETURN public.is_admin_general(auth.uid()); END; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN RETURN public.is_admin(auth.uid()); END; $$;

CREATE OR REPLACE FUNCTION public.has_societe_access(_societe_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN RETURN public.has_societe_access(auth.uid(), _societe_id); END; $$;

CREATE OR REPLACE FUNCTION public.app_state_societe_id(_key text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(_key, ':', 2), '')::uuid
$$;

-- ─── Policies : societes ────────────────────────────────────────────────────
DROP POLICY IF EXISTS societes_select ON public.societes;
CREATE POLICY societes_select ON public.societes FOR SELECT TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), id));
DROP POLICY IF EXISTS societes_insert ON public.societes;
CREATE POLICY societes_insert ON public.societes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_general(auth.uid()));
DROP POLICY IF EXISTS societes_update ON public.societes;
CREATE POLICY societes_update ON public.societes FOR UPDATE TO authenticated
  USING (public.is_admin_general(auth.uid()) OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), id)));
DROP POLICY IF EXISTS societes_delete ON public.societes;
CREATE POLICY societes_delete ON public.societes FOR DELETE TO authenticated
  USING (public.is_admin_general(auth.uid()));

-- ─── Policies : user_societes ───────────────────────────────────────────────
DROP POLICY IF EXISTS user_societes_select ON public.user_societes;
CREATE POLICY user_societes_select ON public.user_societes FOR SELECT TO authenticated
  USING (public.is_admin_general(auth.uid()) OR user_id = auth.uid() OR public.has_societe_access(auth.uid(), societe_id));
DROP POLICY IF EXISTS user_societes_insert ON public.user_societes;
CREATE POLICY user_societes_insert ON public.user_societes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_general(auth.uid()) OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS user_societes_update ON public.user_societes;
CREATE POLICY user_societes_update ON public.user_societes FOR UPDATE TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS user_societes_delete ON public.user_societes;
CREATE POLICY user_societes_delete ON public.user_societes FOR DELETE TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.is_admin(auth.uid()));

-- ─── Policies : custom_services / custom_postes / user_custom_postes ─────────
DROP POLICY IF EXISTS custom_services_all ON public.custom_services;
CREATE POLICY custom_services_all ON public.custom_services FOR ALL TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), societe_id))
  WITH CHECK (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), societe_id));
DROP POLICY IF EXISTS user_custom_postes_all ON public.user_custom_postes;
CREATE POLICY user_custom_postes_all ON public.user_custom_postes FOR ALL TO authenticated
  USING (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), societe_id))
  WITH CHECK (public.is_admin_general(auth.uid()) OR public.has_societe_access(auth.uid(), societe_id));
DROP POLICY IF EXISTS custom_postes_all ON public.custom_postes;
CREATE POLICY custom_postes_all ON public.custom_postes FOR ALL TO authenticated
  USING (public.is_admin_general(auth.uid()) OR EXISTS (SELECT 1 FROM public.custom_services cs WHERE cs.id = custom_postes.service_id AND public.has_societe_access(auth.uid(), cs.societe_id)))
  WITH CHECK (public.is_admin_general(auth.uid()) OR EXISTS (SELECT 1 FROM public.custom_services cs WHERE cs.id = custom_postes.service_id AND public.has_societe_access(auth.uid(), cs.societe_id)));
