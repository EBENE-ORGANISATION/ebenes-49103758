-- Espace cabinet, étape 1 : calcul des droits d'un membre de cabinet
-- (spec 2026-10-27, § 5 et § 6.1 ; plan, tâche 2).
--
-- Fonctions exposées (EXECUTE : authenticated, service_role) :
--   * niveau_mission(mission, module)       : la matrice du § 5 ;
--   * agit_comme_cabinet(uid, societe)      : l'utilisateur accède à la société
--                                             au titre d'un cabinet ;
--   * cabinet_niveau(uid, societe, module)  : son niveau effectif dans le module ;
--   * cabinet_societes(module, min)         : sociétés où l'appelant agit comme
--                                             cabinet avec un niveau >= min ;
--   * cabinet_societes_agit()               : sociétés où l'appelant agit comme cabinet.
-- Fonctions internes (aucun EXECUTE hors propriétaire) :
--   * cabinet_liens_internes(uid, societe)  : la seule requête qui décide de
--                                             l'accès cabinet ; les quatre
--                                             fonctions ci-dessus en dépendent ;
--   * cabinet_niveau_effectif(...)          : le calcul du niveau sur une ligne.
--
-- Niveaux : 0 aucun, 1 lecture, 2 saisie, 3 validation.
--
-- Règles communes (cabinet_liens_internes) : lien actif ou depart_demande,
-- cabinet actif, membre actif, responsable ou attribué sur le dossier, aucune
-- ligne user_societes pour ce couple (l'accès direct prime), et l'utilisateur
-- n'est pas super-admin (rôle admin_general, quel que soit son niveau aal).
--
-- Appelant : agit_comme_cabinet et cabinet_niveau ne répondent que pour
-- l'appelant (_uid = auth.uid()), ou pour un appel hors session utilisateur
-- (auth.uid() nul et rôle autre qu'authenticated ou anon : service,
-- propriétaire). Sinon faux / 0 : elles ne servent pas à sonder les droits
-- d'autrui. cabinet_societes et cabinet_societes_agit ne portent que sur
-- auth.uid() ; sans utilisateur, elles rendent '{}'.
--
-- est_personnel n'est PAS modifiée : les règles cabinet des tables métier
-- viennent à la tâche 3.
-- Migration rejouable.

-- ─── Garde de déploiement ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE etat <> 'termine') THEN
    RAISE EXCEPTION 'Espace cabinet : appliquer les migrations des tâches 2, 3 et 4 ensemble, avant tout lien cabinet.';
  END IF;
END $$;

-- ─── Matrice des missions (§ 5) ─────────────────────────────────────────────
-- Exception à la contrainte générale : fonction pure, sans lecture de table,
-- donc SECURITY INVOKER, IMMUTABLE et PARALLEL SAFE.
-- Le tableau de bord vaut 1 pour toute mission. Les paramètres sociaux suivent
-- la paie (grh). Module inconnu ou NULL, mission NULL : 0. « Utilisateurs du
-- client » n'est pas un module : un cabinet n'y a jamais accès.
CREATE OR REPLACE FUNCTION public.niveau_mission(_mission public.mission_cabinet, _module text)
RETURNS int
LANGUAGE sql
IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT coalesce(
    (CASE _mission
       --                          compta fisc grh fact stock immo param dash
       WHEN 'tenue_complete'   THEN ARRAY[3,    3,   3,  3,   3,    3,   1,    1]
       WHEN 'compta_fiscalite' THEN ARRAY[3,    3,   1,  1,   1,    3,   1,    1]
       WHEN 'paie_social'      THEN ARRAY[1,    1,   3,  0,   0,    0,   1,    1]
       WHEN 'declarations'     THEN ARRAY[1,    3,   1,  1,   1,    1,   1,    1]
       WHEN 'lecture'          THEN ARRAY[1,    1,   1,  1,   1,    1,   1,    1]
     END)[array_position(
       ARRAY['compta', 'fiscalite', 'grh', 'factures', 'stock',
             'immobilisations', 'parametres', 'dashboard'],
       CASE _module WHEN 'parametres_sociaux' THEN 'grh' ELSE _module END)],
    0)
$function$;

-- ─── Interne : niveau effectif sur un lien ─────────────────────────────────
-- Module par module : minimum (mission du dossier, mission de l'attribution) ;
-- pour le responsable, la mission du dossier seule (une éventuelle attribution
-- est ignorée) ; plafond 2 pour un stagiaire ; plafond 1 en depart_demande.
CREATE OR REPLACE FUNCTION public.cabinet_niveau_effectif(
  _mission_dossier     public.mission_cabinet,
  _mission_attribution public.mission_cabinet,
  _role                public.role_cabinet,
  _etat                public.etat_dossier_cabinet,
  _module              text)
RETURNS int
LANGUAGE sql
IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT least(
    public.niveau_mission(_mission_dossier, _module),
    CASE WHEN _role = 'responsable' THEN 3
         ELSE public.niveau_mission(_mission_attribution, _module) END,
    CASE WHEN _role = 'stagiaire' THEN 2 ELSE 3 END,
    CASE WHEN _etat = 'depart_demande' THEN 1 ELSE 3 END
  )
$function$;

-- ─── Interne : liens par lesquels un utilisateur agit comme cabinet ────────
-- Aucun contrôle de l'appelant ici : appelée seulement par les fonctions
-- exposées (SECURITY DEFINER, exécutées en propriétaire), qui le font.
-- Au plus une ligne par société (un seul lien non terminé par société).
-- _societe NULL : toutes les sociétés de l'utilisateur.
CREATE OR REPLACE FUNCTION public.cabinet_liens_internes(_uid uuid, _societe uuid DEFAULT NULL)
RETURNS TABLE (
  societe_id          uuid,
  mission_dossier     public.mission_cabinet,
  mission_attribution public.mission_cabinet,
  role                public.role_cabinet,
  etat                public.etat_dossier_cabinet)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT d.societe_id, d.mission, a.mission, m.role, d.etat
  FROM public.cabinet_membres m
  JOIN public.cabinets c         ON c.id = m.cabinet_id AND c.actif
  JOIN public.cabinet_dossiers d ON d.cabinet_id = m.cabinet_id
                                AND d.etat IN ('actif', 'depart_demande')
  LEFT JOIN public.cabinet_attributions a ON a.dossier_id = d.id AND a.user_id = m.user_id
  WHERE m.user_id = _uid
    AND m.actif
    AND (_societe IS NULL OR d.societe_id = _societe)
    AND (m.role = 'responsable' OR a.user_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = _uid AND us.societe_id = d.societe_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = _uid AND r.role::text = 'admin_general'
    )
$function$;

-- ─── Accès au titre d'un cabinet ────────────────────────────────────────────
-- Les désactivations et retraits prennent effet à la requête suivante.
CREATE OR REPLACE FUNCTION public.agit_comme_cabinet(_uid uuid, _societe uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT (
      coalesce(_uid = auth.uid(), false)
      OR (auth.uid() IS NULL
          AND coalesce(current_setting('role', true), '') NOT IN ('authenticated', 'anon'))
    )
    AND EXISTS (SELECT 1 FROM public.cabinet_liens_internes(_uid, _societe))
$function$;

-- ─── Niveau effectif dans un module ─────────────────────────────────────────
-- Une seule requête sur cabinet_liens_internes : 0 si l'utilisateur n'agit pas
-- comme cabinet sur la société.
CREATE OR REPLACE FUNCTION public.cabinet_niveau(_uid uuid, _societe uuid, _module text)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(min(public.cabinet_niveau_effectif(
           l.mission_dossier, l.mission_attribution, l.role, l.etat, _module)), 0)
  FROM public.cabinet_liens_internes(_uid, _societe) l
  WHERE coalesce(_uid = auth.uid(), false)
     OR (auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('authenticated', 'anon'))
$function$;

-- ─── Sociétés de l'appelant (pour les règles de la tâche 3) ────────────────
-- Sans dépendance à la ligne : à utiliser sous la forme
--   societe_id = ANY ((SELECT public.cabinet_societes('compta', 1)))
-- pour n'être calculées qu'une fois par requête.
CREATE OR REPLACE FUNCTION public.cabinet_societes(_module text, _min int)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(array_agg(l.societe_id), '{}'::uuid[])
  FROM public.cabinet_liens_internes(auth.uid()) l
  WHERE public.cabinet_niveau_effectif(
          l.mission_dossier, l.mission_attribution, l.role, l.etat, _module) >= _min
$function$;

CREATE OR REPLACE FUNCTION public.cabinet_societes_agit()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(array_agg(l.societe_id), '{}'::uuid[])
  FROM public.cabinet_liens_internes(auth.uid()) l
$function$;

-- ─── Droits d'exécution ─────────────────────────────────────────────────────
-- Fonctions internes : propriétaire seulement (les privilèges par défaut du
-- schéma public les accordent à anon, authenticated et service_role).
REVOKE EXECUTE ON FUNCTION public.cabinet_liens_internes(uuid, uuid)
  FROM anon, public, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cabinet_niveau_effectif(
  public.mission_cabinet, public.mission_cabinet, public.role_cabinet, public.etat_dossier_cabinet, text)
  FROM anon, public, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.niveau_mission(public.mission_cabinet, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.agit_comme_cabinet(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_niveau(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_societes(text, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_societes_agit() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.niveau_mission(public.mission_cabinet, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agit_comme_cabinet(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_niveau(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_societes(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_societes_agit() TO authenticated, service_role;

-- Index : cabinet_membres(user_id) (unique), cabinet_attributions (dossier_id,
-- user_id) (clé) et (user_id), cabinet_dossiers(cabinet_id) et (societe_id)
-- existent depuis la tâche 1 ; user_societes (user_id, societe_id) est unique
-- (20261008180000) ; aucun index supplémentaire.
