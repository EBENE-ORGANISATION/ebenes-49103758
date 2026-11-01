-- Déploiement des migrations 20261101130000 (suppression de fiscal_delegations) et 20261101131000
-- (noms du cabinet dans l'audit), avec inscription dans l'historique, en une seule transaction. À lancer une fois.
-- Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261101120000') THEN
    RAISE EXCEPTION 'La migration cabinet_equipe n est pas inscrite : arrêt.';
  END IF;
END $g$;
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
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261101130000', 'suppression_fiscal_delegations', ARRAY[$migration_sql$
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
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
-- Noms actuels associés à la signature historique ; aucun recalcul à partir
-- des membres ou des dossiers actuels. Pas d’e-mail ni d’annuaire exposé.
CREATE OR REPLACE FUNCTION public.audit_noms_cabinet(_societe uuid)
RETURNS TABLE (cabinet_id uuid, cabinet_nom text, user_id uuid, auteur_nom text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fonction$
  SELECT DISTINCT a.cabinet_id, c.nom::text, a.user_id,
         nullif(btrim(p.nom), '')::text
  FROM public.audit_log a
  JOIN public.cabinets c ON c.id = a.cabinet_id
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND a.societe_id = _societe
    -- Même périmètre que les politiques SELECT de l’audit : un simple
    -- rattachement sans rôle administrateur ne donne pas accès aux noms.
    AND (public.is_admin_general(auth.uid())
         OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), a.societe_id)))
$fonction$;
REVOKE ALL ON FUNCTION public.audit_noms_cabinet(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_noms_cabinet(uuid) TO authenticated, service_role;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261101131000', 'audit_noms_cabinet', ARRAY[$migration_sql$
-- Noms actuels associés à la signature historique ; aucun recalcul à partir
-- des membres ou des dossiers actuels. Pas d’e-mail ni d’annuaire exposé.
CREATE OR REPLACE FUNCTION public.audit_noms_cabinet(_societe uuid)
RETURNS TABLE (cabinet_id uuid, cabinet_nom text, user_id uuid, auteur_nom text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fonction$
  SELECT DISTINCT a.cabinet_id, c.nom::text, a.user_id,
         nullif(btrim(p.nom), '')::text
  FROM public.audit_log a
  JOIN public.cabinets c ON c.id = a.cabinet_id
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND a.societe_id = _societe
    -- Même périmètre que les politiques SELECT de l’audit : un simple
    -- rattachement sans rôle administrateur ne donne pas accès aux noms.
    AND (public.is_admin_general(auth.uid())
         OR (public.is_admin(auth.uid()) AND public.has_societe_access(auth.uid(), a.societe_id)))
$fonction$;
REVOKE ALL ON FUNCTION public.audit_noms_cabinet(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_noms_cabinet(uuid) TO authenticated, service_role;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
