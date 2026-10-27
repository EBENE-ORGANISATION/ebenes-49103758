-- Confidentialité : un simple employé ne lit que ses propres données.
--
-- Plusieurs règles n'exigeaient que d'être rattaché à la société
-- (has_societe_access / user_societes) : un compte « employé » (portail)
-- pouvait lire toutes les fiches, tous les bulletins, les messages des autres
-- employés et toute la comptabilité, et même créer ou modifier des fiches
-- employés (y compris son salaire) et des écritures comptables.
--
-- Décisions (2026-10-08) :
--  - données RH (fiches, bulletins, messages du portail) : admin, service GRH,
--    et compta pour fiches/bulletins (écritures de paie) ; l'employé : les siennes ;
--  - le rôle « rh » donne les droits d'un membre GRH ;
--  - comptabilité, commercial, stock : le personnel (tout rôle autre que
--    « employe ») garde ses accès ; les simples employés n'y ont plus accès.

-- 1. Le rôle « rh » compte dans le service GRH
CREATE OR REPLACE FUNCTION public.in_service_grh(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'chef_grh'::app_role, 'membre_grh'::app_role, 'rh'::app_role)
  ) OR public.has_active_grant(_user_id, 'grh')
$function$;

-- 2. Personnel de gestion de la société : rattaché et titulaire d'un rôle
--    autre que « employe » (ou d'une délégation de service en cours).
CREATE OR REPLACE FUNCTION public.est_personnel(_user_id uuid, _societe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_general(_user_id)
    OR (
      public.has_societe_access(_user_id, _societe_id)
      AND (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role <> 'employe'::app_role
        )
        OR EXISTS (
          SELECT 1 FROM public.cross_service_grants
          WHERE user_id = _user_id AND expires_at > now()
        )
      )
    )
$function$;

-- 3. Fiches employés : les règles « tout membre » sont retirées ; restent
--    employes_select / employes_insert / employes_update (admin, compta,
--    GRH) et employe_read_own.
DROP POLICY IF EXISTS admin_read_employes ON public.employes;
DROP POLICY IF EXISTS admin_insert_employes ON public.employes;
DROP POLICY IF EXISTS admin_update_employes ON public.employes;

-- 4. Bulletins : admin, GRH, compta ; l'employé garde bulletins_employe_select
DROP POLICY IF EXISTS bulletins_admin_select ON public.bulletins_paie;
CREATE POLICY bulletins_admin_select ON public.bulletins_paie FOR SELECT
  USING (
    is_admin_general((SELECT auth.uid()))
    OR (
      has_societe_access((SELECT auth.uid()), societe_id)
      AND (is_admin((SELECT auth.uid())) OR in_service_grh((SELECT auth.uid())) OR in_service_compta((SELECT auth.uid())))
    )
  );

-- 5. Messages du portail côté administration : admin et GRH ;
--    l'employé garde ses règles portail_employe_*
DROP POLICY IF EXISTS portail_admin_select ON public.portail_messages;
DROP POLICY IF EXISTS portail_admin_insert ON public.portail_messages;
DROP POLICY IF EXISTS portail_admin_update ON public.portail_messages;
CREATE POLICY portail_admin_select ON public.portail_messages FOR SELECT
  USING (
    is_admin_general((SELECT auth.uid()))
    OR (has_societe_access((SELECT auth.uid()), societe_id)
        AND (is_admin((SELECT auth.uid())) OR in_service_grh((SELECT auth.uid()))))
  );
CREATE POLICY portail_admin_insert ON public.portail_messages FOR INSERT
  WITH CHECK (
    auteur = 'admin'
    AND (
      is_admin_general((SELECT auth.uid()))
      OR (has_societe_access((SELECT auth.uid()), societe_id)
          AND (is_admin((SELECT auth.uid())) OR in_service_grh((SELECT auth.uid()))))
    )
  );
CREATE POLICY portail_admin_update ON public.portail_messages FOR UPDATE
  USING (
    is_admin_general((SELECT auth.uid()))
    OR (has_societe_access((SELECT auth.uid()), societe_id)
        AND (is_admin((SELECT auth.uid())) OR in_service_grh((SELECT auth.uid()))))
  );

-- 6. Écritures comptables : la règle « tout permis » ne vaut plus que pour
--    le personnel (le GRH y écrit la paie à la validation des bulletins).
DROP POLICY IF EXISTS ecritures_societe_access ON public.ecritures_comptables;
CREATE POLICY ecritures_societe_access ON public.ecritures_comptables FOR ALL
  USING (est_personnel((SELECT auth.uid()), societe_id))
  WITH CHECK (est_personnel((SELECT auth.uid()), societe_id));

-- 7. Lecture de la comptabilité, du commercial et du stock : personnel seulement
DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS factures_select ON public.factures;
CREATE POLICY factures_select ON public.factures FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS devis_select ON public.devis;
CREATE POLICY devis_select ON public.devis FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS immobilisations_select ON public.immobilisations;
CREATE POLICY immobilisations_select ON public.immobilisations FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS articles_select ON public.articles;
CREATE POLICY articles_select ON public.articles FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS mouvements_stock_select ON public.mouvements_stock;
CREATE POLICY mouvements_stock_select ON public.mouvements_stock FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS fournisseurs_select ON public.fournisseurs;
CREATE POLICY fournisseurs_select ON public.fournisseurs FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS categories_stock_select ON public.categories_stock;
CREATE POLICY categories_stock_select ON public.categories_stock FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
DROP POLICY IF EXISTS params_annuels_select ON public.params_annuels;
CREATE POLICY params_annuels_select ON public.params_annuels FOR SELECT
  USING (est_personnel((SELECT auth.uid()), societe_id));
