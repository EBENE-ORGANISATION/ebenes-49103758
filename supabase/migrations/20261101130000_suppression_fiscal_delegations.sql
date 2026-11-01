-- Sources : baseline 20261027000000 ; archives 20260524000001,
-- 20260524070732 et 20261006110000. Aucune fonction ni aucun trigger
-- ne dépend de cette table dans ces sources. Les fonctions fiscales
-- generate_set_impots et trg_recalc_set_impots concernent societes : conservées.
-- Le verrou empêche une insertion entre la vérification et la suppression.
DO $$
BEGIN
  LOCK TABLE public.fiscal_delegations IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.fiscal_delegations) THEN
    RAISE EXCEPTION 'Suppression refusée : fiscal_delegations contient encore des lignes.';
  END IF;
DROP POLICY fiscal_delegations_admin_manage ON public.fiscal_delegations;
DROP POLICY fiscal_delegations_admin_read ON public.fiscal_delegations;
DROP POLICY fiscal_delegations_delegue_read ON public.fiscal_delegations;
DROP POLICY fiscal_delegations_super_admin_all ON public.fiscal_delegations;
DROP INDEX public.fiscal_delegations_delegue_idx;
DROP INDEX public.fiscal_delegations_granted_by_idx;
DROP INDEX public.fiscal_delegations_societe_idx;
ALTER TABLE public.fiscal_delegations
  DROP CONSTRAINT fiscal_delegations_delegue_user_id_fkey,
  DROP CONSTRAINT fiscal_delegations_granted_by_fkey,
  DROP CONSTRAINT fiscal_delegations_societe_id_fkey,
  DROP CONSTRAINT fiscal_delegations_societe_id_delegue_user_id_key,
  DROP CONSTRAINT fiscal_delegations_pkey;
-- RESTRICT implicite : une dépendance inattendue fait échouer la migration.
DROP TABLE public.fiscal_delegations;
END $$;
