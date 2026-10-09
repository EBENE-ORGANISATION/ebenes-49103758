-- Décision du 2026-10-09 : droits par activité, appliqués par la base.
-- Un utilisateur peut être limité à une ou plusieurs activités d'une société
-- (ex. le gérant de l'hôtel) : il ne voit et ne modifie que les données de
-- ces activités. Sans ligne dans user_activites : aucun changement (accès à
-- toutes les activités). Les administrateurs ne sont jamais limités.
-- Les règles ci-dessous sont RESTRICTIVES : elles s'ajoutent aux règles
-- existantes (qui doivent toujours être satisfaites) sans les élargir.

CREATE TABLE IF NOT EXISTS public.user_activites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  activite_id uuid NOT NULL REFERENCES public.activites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activite_id)
);
CREATE INDEX IF NOT EXISTS user_activites_user_societe_idx ON public.user_activites (user_id, societe_id);
ALTER TABLE public.user_activites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_activites_select ON public.user_activites FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_admin_general((SELECT auth.uid()))
    OR (has_societe_access((SELECT auth.uid()), societe_id) AND is_admin((SELECT auth.uid())))
  );
CREATE POLICY user_activites_gestion ON public.user_activites FOR ALL TO authenticated
  USING (is_admin_general((SELECT auth.uid())) OR (has_societe_access((SELECT auth.uid()), societe_id) AND is_admin((SELECT auth.uid()))))
  WITH CHECK (is_admin_general((SELECT auth.uid())) OR (has_societe_access((SELECT auth.uid()), societe_id) AND is_admin((SELECT auth.uid()))));

-- Activité accessible à l'utilisateur
CREATE OR REPLACE FUNCTION public.activite_autorisee(_user_id uuid, _societe_id uuid, _activite_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NULL
    OR public.is_admin_general(_user_id)
    OR public.is_admin(_user_id)
    OR NOT EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id)
    OR EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id AND activite_id = _activite_id)
$function$;

-- Employé accessible : son activité, ou l'une des activités entre lesquelles il est partagé
CREATE OR REPLACE FUNCTION public.employe_autorise(_user_id uuid, _societe_id uuid, _activite_id uuid, _repartition jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.activite_autorisee(_user_id, _societe_id, _activite_id)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(_repartition, '[]'::jsonb)) r
      WHERE (r->>'part')::numeric > 0
        AND public.activite_autorisee(_user_id, _societe_id, (r->>'activiteId')::uuid)
        AND EXISTS (SELECT 1 FROM public.user_activites WHERE user_id = _user_id AND societe_id = _societe_id)
    )
$function$;

-- Données RH rattachées à un employé (bulletins, absences, primes…)
CREATE OR REPLACE FUNCTION public.employe_id_autorise(_user_id uuid, _employe_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT COALESCE(e.user_id = _user_id, false)
         OR public.employe_autorise(_user_id, e.societe_id, e.activite_id, e.repartition)
       FROM public.employes e WHERE e.id = _employe_id),
    -- Employé introuvable : la règle d'origine de la table s'applique seule
    true)
$function$;

REVOKE EXECUTE ON FUNCTION public.activite_autorisee(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employe_autorise(uuid, uuid, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employe_id_autorise(uuid, bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.activite_autorisee(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employe_autorise(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employe_id_autorise(uuid, bigint) TO authenticated;

-- Tables rattachées à une activité
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions', 'factures', 'devis', 'articles', 'mouvements_stock',
    'immobilisations', 'ecritures_comptables'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS activite_restriction ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY activite_restriction ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.activite_autorisee((SELECT auth.uid()), societe_id, activite_id))
         WITH CHECK (public.activite_autorisee((SELECT auth.uid()), societe_id, activite_id))', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['bulletins_paie', 'absences', 'primes', 'heures_sup', 'sanctions', 'retenues'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS activite_restriction ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY activite_restriction ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.employe_id_autorise((SELECT auth.uid()), employe_id))
         WITH CHECK (public.employe_id_autorise((SELECT auth.uid()), employe_id))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS activite_restriction ON public.employes;
CREATE POLICY activite_restriction ON public.employes AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.employe_autorise((SELECT auth.uid()), societe_id, activite_id, repartition))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.employe_autorise((SELECT auth.uid()), societe_id, activite_id, repartition));

DROP POLICY IF EXISTS activite_restriction ON public.activites;
CREATE POLICY activite_restriction ON public.activites AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.activite_autorisee((SELECT auth.uid()), societe_id, id));
