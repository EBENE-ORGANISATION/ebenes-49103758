-- Inscrit dans l historique des migrations de la production les 4 migrations de l espace cabinet
-- (tâches 1 à 4), déjà appliquées le 2026-10-28 par l éditeur SQL mais absentes de
-- supabase_migrations.schema_migrations (le schéma de référence a été tiré juste avant).
-- Sans cela, une branche Supabase serait construite sans l espace cabinet.
-- Ne modifie AUCUN objet du schéma : seulement la table d historique. À lancer UNE fois.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027000001') THEN
    RAISE EXCEPTION 'Schéma de référence absent de l historique : arrêt.';
  END IF;
  IF to_regclass('public.cabinets') IS NULL OR to_regprocedure('private.cabinet_signature(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'L espace cabinet n est pas appliqué en production : arrêt.';
  END IF;
END $g$;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20261027120000', 'cabinet_schema', ARRAY[$migration_sql$-- Espace cabinet, étape 1 : tables et types (spec 2026-10-27, § 4.1 à 4.4).
--
-- Un cabinet comptable travaille dans les dossiers de ses clients sans ligne
-- user_societes ni rôle global. Ce fichier ne crée que la structure et la
-- lecture des tables cabinet :
--   * lecture : membre actif d'un cabinet actif (le collaborateur ne voit que
--     ses dossiers attribués), administrateur de la société cliente, super-admin ;
--   * aucune règle INSERT / UPDATE / DELETE : toute écriture passe par les
--     fonctions cabinet_* (tâche 5), en SECURITY DEFINER.
-- L'accès aux données métier des dossiers vient à la tâche 2.
-- Migration rejouable.

-- ─── Types ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.mission_cabinet AS ENUM
    ('tenue_complete', 'compta_fiscalite', 'paie_social', 'declarations', 'lecture');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.role_cabinet AS ENUM ('responsable', 'collaborateur', 'stagiaire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.etat_dossier_cabinet AS ENUM ('invitation', 'actif', 'depart_demande', 'termine');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.origine_dossier_cabinet AS ENUM ('cabinet', 'client', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── cabinets ───────────────────────────────────────────────────────────────
-- Un cabinet désactivé perd tout accès (ses membres ne lisent plus que leur
-- propre ligne de cabinet_membres).
CREATE TABLE IF NOT EXISTS public.cabinets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom               text        NOT NULL,
  formule           text        NOT NULL DEFAULT 'cabinet',
  max_dossiers      int         NOT NULL DEFAULT 10 CHECK (max_dossiers >= 0),
  societe_propre_id uuid        REFERENCES public.societes(id) ON DELETE SET NULL,
  actif             boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);
CREATE INDEX IF NOT EXISTS cabinets_societe_propre_idx ON public.cabinets (societe_propre_id);

-- ─── cabinet_membres : une personne, un seul cabinet ───────────────────────
CREATE TABLE IF NOT EXISTS public.cabinet_membres (
  id         uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid                NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  user_id    uuid                NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.role_cabinet NOT NULL DEFAULT 'collaborateur',
  actif      boolean             NOT NULL DEFAULT true,
  created_at timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cabinet_membres_cabinet_idx ON public.cabinet_membres (cabinet_id);

-- ─── cabinet_dossiers : lien cabinet ↔ société cliente ─────────────────────
-- Un lien terminé n'est jamais supprimé (historique des accès) : ni le
-- cabinet ni la société liée ne peuvent être supprimés tant qu'un lien
-- existe. Un compte de cabinet se désactive, il ne se supprime pas.
CREATE TABLE IF NOT EXISTS public.cabinet_dossiers (
  id                 uuid                           PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id         uuid                           NOT NULL REFERENCES public.cabinets(id) ON DELETE RESTRICT,
  societe_id         uuid                           NOT NULL REFERENCES public.societes(id) ON DELETE RESTRICT,
  mission            public.mission_cabinet         NOT NULL,
  etat               public.etat_dossier_cabinet    NOT NULL DEFAULT 'invitation',
  origine            public.origine_dossier_cabinet NOT NULL,
  depart_demande_par uuid,
  depart_demande_le  timestamptz,
  depart_motif       text,
  valide_par         uuid,
  termine_le         timestamptz,
  created_at         timestamptz                    NOT NULL DEFAULT now()
);
-- Un seul cabinet à la fois par client (liens non terminés).
CREATE UNIQUE INDEX IF NOT EXISTS cabinet_dossiers_societe_en_cours_uniq
  ON public.cabinet_dossiers (societe_id) WHERE etat <> 'termine';
CREATE INDEX IF NOT EXISTS cabinet_dossiers_societe_idx ON public.cabinet_dossiers (societe_id);
CREATE INDEX IF NOT EXISTS cabinet_dossiers_cabinet_idx ON public.cabinet_dossiers (cabinet_id);

-- Si une version antérieure de ce fichier a créé la clé en CASCADE.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cabinet_dossiers_societe_id_fkey'
      AND conrelid = 'public.cabinet_dossiers'::regclass
      AND confdeltype <> 'r'
  ) THEN
    ALTER TABLE public.cabinet_dossiers DROP CONSTRAINT cabinet_dossiers_societe_id_fkey;
    ALTER TABLE public.cabinet_dossiers
      ADD CONSTRAINT cabinet_dossiers_societe_id_fkey
      FOREIGN KEY (societe_id) REFERENCES public.societes(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── cabinet_attributions : collaborateur ↔ dossier ────────────────────────
CREATE TABLE IF NOT EXISTS public.cabinet_attributions (
  dossier_id uuid                   NOT NULL REFERENCES public.cabinet_dossiers(id) ON DELETE CASCADE,
  user_id    uuid                   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission    public.mission_cabinet NOT NULL,
  created_at timestamptz            NOT NULL DEFAULT now(),
  PRIMARY KEY (dossier_id, user_id)
);
CREATE INDEX IF NOT EXISTS cabinet_attributions_user_idx ON public.cabinet_attributions (user_id);

-- ─── Fonctions de lecture (évitent la récursion entre règles) ──────────────
-- Les règles des quatre tables se référencent mutuellement : ces fonctions
-- lisent les tables en propriétaire, sans repasser par les règles.
-- Fonctions sur l'appelant ; une fonction qui examine un autre utilisateur
-- lit les tables directement. Elles répondent NULL / faux pour un autre
-- utilisateur que l'appelant (sauf appel du service, auth.uid() nul).

-- Cabinet actif dont l'utilisateur est membre actif (NULL sinon).
CREATE OR REPLACE FUNCTION public.cabinet_du_membre(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT m.cabinet_id
  FROM public.cabinet_membres m
  JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
  WHERE m.user_id = _user_id
    AND m.actif
    AND (_user_id = auth.uid() OR auth.uid() IS NULL)
$function$;

-- Administrateur de la société cliente (rôle admin + accès à la société).
CREATE OR REPLACE FUNCTION public.cabinet_admin_client(_user_id uuid, _societe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(_user_id = auth.uid() OR auth.uid() IS NULL, false)
    AND public.is_admin(_user_id)
    AND public.has_societe_access(_user_id, _societe_id)
$function$;

-- Lecture d'un lien : super-admin, administrateur du client (liens terminés
-- compris), ou membre actif d'un cabinet actif, responsable ou attribué.
CREATE OR REPLACE FUNCTION public.cabinet_lit_dossier(_user_id uuid, _dossier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(_user_id = auth.uid() OR auth.uid() IS NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.cabinet_dossiers d
      WHERE d.id = _dossier_id
        AND (
          public.is_admin_general(_user_id)
          OR public.cabinet_admin_client(_user_id, d.societe_id)
          OR EXISTS (
            SELECT 1
            FROM public.cabinet_membres m
            JOIN public.cabinets c ON c.id = d.cabinet_id AND c.actif
            WHERE m.user_id = _user_id
              AND m.cabinet_id = d.cabinet_id
              AND m.actif
              AND (
                m.role = 'responsable'
                OR EXISTS (
                  SELECT 1 FROM public.cabinet_attributions a
                  WHERE a.dossier_id = d.id AND a.user_id = _user_id
                )
              )
          )
        )
    )
$function$;

-- Gestion d'un lien (voir toutes ses attributions) : super-admin,
-- administrateur du client tant que le lien n'est pas terminé, responsable
-- actif d'un cabinet actif.
CREATE OR REPLACE FUNCTION public.cabinet_gere_dossier(_user_id uuid, _dossier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(_user_id = auth.uid() OR auth.uid() IS NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.cabinet_dossiers d
      WHERE d.id = _dossier_id
        AND (
          public.is_admin_general(_user_id)
          OR (d.etat <> 'termine' AND public.cabinet_admin_client(_user_id, d.societe_id))
          OR EXISTS (
            SELECT 1
            FROM public.cabinet_membres m
            JOIN public.cabinets c ON c.id = d.cabinet_id AND c.actif
            WHERE m.user_id = _user_id
              AND m.cabinet_id = d.cabinet_id
              AND m.actif
              AND m.role = 'responsable'
          )
        )
    )
$function$;

REVOKE EXECUTE ON FUNCTION public.cabinet_du_membre(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_admin_client(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_lit_dossier(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cabinet_gere_dossier(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cabinet_du_membre(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_admin_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_lit_dossier(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_gere_dossier(uuid, uuid) TO authenticated, service_role;

-- ─── RLS et droits ──────────────────────────────────────────────────────────
ALTER TABLE public.cabinets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_attributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cabinets, public.cabinet_membres, public.cabinet_dossiers, public.cabinet_attributions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.cabinets, public.cabinet_membres, public.cabinet_dossiers, public.cabinet_attributions
  FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.cabinets, public.cabinet_membres, public.cabinet_dossiers, public.cabinet_attributions
  TO authenticated;
GRANT ALL
  ON public.cabinets, public.cabinet_membres, public.cabinet_dossiers, public.cabinet_attributions
  TO service_role;

-- ─── Règles de lecture (aucune règle d'écriture) ───────────────────────────
-- Les appels qui ne dépendent pas de la ligne sont entourés d'un SELECT pour
-- n'être calculés qu'une fois par requête.

-- cabinets : son cabinet, ceux liés à une société qu'on administre, ou tout (super-admin).
DROP POLICY IF EXISTS cabinets_select ON public.cabinets;
CREATE POLICY cabinets_select ON public.cabinets FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin_general((SELECT auth.uid())))
    OR id = (SELECT public.cabinet_du_membre((SELECT auth.uid())))
    OR EXISTS (
      SELECT 1 FROM public.cabinet_dossiers d
      WHERE d.cabinet_id = cabinets.id
        AND d.societe_id IN (SELECT us.societe_id FROM public.user_societes us
                             WHERE us.user_id = (SELECT auth.uid()))
        AND public.cabinet_admin_client((SELECT auth.uid()), d.societe_id)
    )
  );

-- cabinet_membres : sa propre ligne, l'équipe de son cabinet ; pour
-- l'administrateur du client, les membres actifs qui ont accès à son dossier
-- en cours (responsables du cabinet et collaborateurs attribués).
DROP POLICY IF EXISTS cabinet_membres_select ON public.cabinet_membres;
CREATE POLICY cabinet_membres_select ON public.cabinet_membres FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin_general((SELECT auth.uid())))
    OR user_id = (SELECT auth.uid())
    OR cabinet_id = (SELECT public.cabinet_du_membre((SELECT auth.uid())))
    OR (
      actif
      AND EXISTS (
        SELECT 1 FROM public.cabinet_dossiers d
        WHERE d.cabinet_id = cabinet_membres.cabinet_id
          AND d.etat <> 'termine'
          AND d.societe_id IN (SELECT us.societe_id FROM public.user_societes us
                               WHERE us.user_id = (SELECT auth.uid()))
          AND public.cabinet_admin_client((SELECT auth.uid()), d.societe_id)
          AND (
            cabinet_membres.role = 'responsable'
            OR EXISTS (
              SELECT 1 FROM public.cabinet_attributions a
              WHERE a.dossier_id = d.id AND a.user_id = cabinet_membres.user_id
            )
          )
      )
    )
  );

-- cabinet_dossiers : voir cabinet_lit_dossier.
DROP POLICY IF EXISTS cabinet_dossiers_select ON public.cabinet_dossiers;
CREATE POLICY cabinet_dossiers_select ON public.cabinet_dossiers FOR SELECT TO authenticated
  USING (public.cabinet_lit_dossier((SELECT auth.uid()), id));

-- cabinet_attributions : toutes celles du dossier pour qui le gère (l'admin
-- du client seulement sur un lien non terminé) ; sinon ses propres attributions
-- sur un dossier qu'on lit.
DROP POLICY IF EXISTS cabinet_attributions_select ON public.cabinet_attributions;
CREATE POLICY cabinet_attributions_select ON public.cabinet_attributions FOR SELECT TO authenticated
  USING (
    public.cabinet_gere_dossier((SELECT auth.uid()), dossier_id)
    OR (
      user_id = (SELECT auth.uid())
      AND public.cabinet_lit_dossier((SELECT auth.uid()), dossier_id)
    )
  );
$migration_sql$]),
  ('20261027121000', 'cabinet_droits', ARRAY[$migration_sql$-- Espace cabinet, étape 1 : calcul des droits d'un membre de cabinet
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
-- n'est pas super-admin (rôle admin_general ou super_admin, quel que soit son
-- niveau aal).
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
    -- Super-admin : test sur le texte du rôle, comme trg_bloquer_role_super_admin
    -- (24/10/2026), et non is_admin_general (qui dépend du niveau aal).
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = _uid AND r.role::text IN ('admin_general', 'super_admin')
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
--   societe_id = ANY ((SELECT public.cabinet_societes('compta', 1))::uuid[])
-- pour n'être calculées qu'une fois par requête (le cast ::uuid[] est
-- nécessaire : sans lui, ANY ((SELECT …)) est lu comme ANY(sous-requête)).
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
$migration_sql$]),
  ('20261027122000', 'cabinet_regles_acces', ARRAY[$migration_sql$-- Espace cabinet, étape 1 : règles d'accès des tables métier
-- (spec 2026-10-27, § 6.1 et 6.2 ; plan, tâche 3 ; corrigée après relecture
-- de sécurité et premier passage des tests).
--
-- Suppose appliquées les migrations 20261027120000_cabinet_schema.sql et
-- 20261027121000_cabinet_droits.sql (cabinet_societes, cabinet_societes_agit).
-- Les migrations des tâches 2, 3 et 4 s'appliquent ensemble.
--
-- Contenu :
--   1. module_de_table(table) : correspondance table → module du § 6.2.
--   2. Sur chaque table métier, des règles générées en boucle :
--        permissives  cabinet_lecture            (SELECT, niveau 1)
--                     cabinet_ecriture_insert / _update (niveau d'écriture)
--                     cabinet_ecriture_delete    (niveau de suppression : 3)
--        RESTRICTIVES cabinet_plafond_lecture    (SELECT, niveau 1)
--                     cabinet_plafond_ecriture_insert / _update / _delete
--      Forme des permissives :
--        <col> = ANY ((SELECT public.cabinet_societes('<module>', n))::uuid[])
--      Forme des restrictives :
--        <col> <> ALL ((SELECT public.cabinet_societes_agit())::uuid[])
--        OR <col> = ANY ((SELECT public.cabinet_societes('<module>', n))::uuid[])
--      Le cast ::uuid[] est indispensable : sans lui, « ANY ((SELECT …)) » est
--      lu comme ANY(sous-requête) et compare un uuid à un uuid[] (erreur
--      42883). Avec lui, la sous-requête scalaire devient une expression
--      tableau, calculée une seule fois par requête (InitPlan), pas par ligne.
--      Pour un utilisateur sans cabinet, cabinet_societes_agit() rend '{}' :
--      « <col> <> ALL ('{}') » est vrai, les restrictives ne changent rien et
--      les permissives n'ouvrent rien.
--   3. Sur les tables d'administration, une règle RESTRICTIVE cabinet_refus
--      (FOR ALL) : un membre de cabinet n'y lit ni n'y écrit rien qui concerne
--      une société où il agit comme cabinet.
--   4. Un trigger trg_societe_immuable sur chaque table métier (sauf
--      societes) : une ligne ne change jamais de société.
--
-- Choix :
--   * FOR INSERT n'accepte pas de USING, et une règle ne porte que sur une
--     commande ou sur toutes : d'où une règle par opération d'écriture.
--   * Suppression (relecture de sécurité) : niveau 3 (validation) ; jamais
--     pour un cabinet sur exercices, compteurs_numerotation, societes,
--     societe_config, societe_identification et activites (pas de
--     permissive DELETE, et la restrictive DELETE n'a pas de branche
--     cabinet : refus sur toute société où l'on agit comme cabinet).
--   * exercices : écriture au niveau 3 (et non 2). Clôturer un exercice n'est
--     pas une saisie ; un stagiaire (plafonné à 2) ne clôture pas.
--   * compteurs_numerotation : aucune règle permissive d'écriture. Personne
--     n'écrit ces compteurs depuis le client (la numérotation passe par une
--     fonction SECURITY DEFINER ; authenticated n'a d'ailleurs pas le droit
--     UPDATE sur la table). Les restrictives y sont posées quand même.
--   * societes : colonne id. La société cliente apparaît dans SELECT FROM
--     societes pour le collaborateur (paramètres = 1 pour toutes les
--     missions) ; l'écriture reste refusée (paramètres jamais à 2).
--   * suivi_declarations n'existe pas encore : module_de_table la connaît
--     (fiscalite), mais aucune règle n'y est posée ici.
--   * portail_messages (classée paie / GRH au § 6.2) est traitée comme une
--     table d'administration (plan, tâche 3) : refus total pour un cabinet.
--   * user_roles et user_societes : écriture déjà retirée à authenticated
--     (20261024120000) ; rien à ajouter ici.
--   * Effet accepté (permission_overrides, cross_service_grants) : un
--     utilisateur rattaché à la fois à la propre société d'un cabinet et à un
--     client de ce cabinet devient ingérable, sur ces deux tables, par les
--     membres du cabinet qui administrent leur propre société (le refus porte
--     sur l'utilisateur visé, pas sur une société). Son administrateur côté
--     client, ou le super-admin, garde la main.
--
-- Migration rejouable : DROP POLICY / DROP TRIGGER IF EXISTS avant chaque
-- création, CREATE OR REPLACE pour les fonctions.

-- ─── Garde de déploiement ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE etat <> 'termine') THEN
    RAISE EXCEPTION 'Espace cabinet : appliquer les migrations des tâches 2, 3 et 4 ensemble, avant tout lien cabinet.';
  END IF;
END $$;

-- ─── Correspondance table → module (§ 6.2) ─────────────────────────────────
-- Fonction pure : SECURITY INVOKER, IMMUTABLE, PARALLEL SAFE (comme
-- niveau_mission). Table inconnue ou NULL : NULL. Servira aussi à
-- controle_quatre_yeux (tâche 4) avec TG_TABLE_NAME.
CREATE OR REPLACE FUNCTION public.module_de_table(_table text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT CASE _table
    WHEN 'ecritures_comptables'   THEN 'compta'
    WHEN 'transactions'           THEN 'compta'
    WHEN 'exercices'              THEN 'compta'
    WHEN 'emprunts'               THEN 'compta'
    WHEN 'informations_fiscales'  THEN 'fiscalite'
    WHEN 'taux_historique'        THEN 'fiscalite'
    WHEN 'params_annuels'         THEN 'fiscalite'
    WHEN 'suivi_declarations'     THEN 'fiscalite'
    WHEN 'employes'               THEN 'grh'
    WHEN 'bulletins_paie'         THEN 'grh'
    WHEN 'primes'                 THEN 'grh'
    WHEN 'heures_sup'             THEN 'grh'
    WHEN 'retenues'               THEN 'grh'
    WHEN 'absences'               THEN 'grh'
    WHEN 'sanctions'              THEN 'grh'
    WHEN 'factures'               THEN 'factures'
    WHEN 'devis'                  THEN 'factures'
    WHEN 'compteurs_numerotation' THEN 'factures'
    WHEN 'articles'               THEN 'stock'
    WHEN 'mouvements_stock'       THEN 'stock'
    WHEN 'fournisseurs'           THEN 'stock'
    WHEN 'categories_stock'       THEN 'stock'
    WHEN 'immobilisations'        THEN 'immobilisations'
    WHEN 'societes'               THEN 'parametres'
    WHEN 'societe_config'         THEN 'parametres'
    WHEN 'societe_identification' THEN 'parametres'
    WHEN 'activites'              THEN 'parametres'
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.module_de_table(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.module_de_table(text) TO authenticated, service_role;

-- ─── Schéma private : fonctions d'aide des règles, hors API ────────────────
-- PostgREST n'expose pas ce schéma. authenticated garde USAGE et EXECUTE :
-- les règles sont évaluées avec ses droits.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, public;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Versions publiques d'un brouillon antérieur de ce fichier, s'il a été joué.
DROP FUNCTION IF EXISTS public.cabinet_services_agit();
DROP FUNCTION IF EXISTS public.cabinet_custom_services_agit();
DROP FUNCTION IF EXISTS public.cabinet_utilisateurs_agit();

-- Lues en propriétaire : une sous-requête dans une règle passerait par les
-- règles de services / custom_services / user_societes, qui cachent justement
-- ces lignes au membre de cabinet (le refus ne jouerait plus).
-- Pour un utilisateur sans cabinet : '{}' (cabinet_societes_agit() est vide).

-- Services des sociétés où l'appelant agit comme cabinet (pour service_membres).
CREATE OR REPLACE FUNCTION private.cabinet_services_agit()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(array_agg(s.id), '{}'::uuid[])
  FROM public.services s
  WHERE s.societe_id = ANY ((SELECT public.cabinet_societes_agit())::uuid[])
$function$;

-- Services personnalisés de ces sociétés (pour custom_postes).
CREATE OR REPLACE FUNCTION private.cabinet_custom_services_agit()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(array_agg(cs.id), '{}'::uuid[])
  FROM public.custom_services cs
  WHERE cs.societe_id = ANY ((SELECT public.cabinet_societes_agit())::uuid[])
$function$;

-- Utilisateurs rattachés (user_societes) à ces sociétés (pour
-- permission_overrides et cross_service_grants, qui portent sur un
-- utilisateur et non sur une société). L'appelant n'y figure jamais : il
-- n'agit comme cabinet que là où il n'a pas de ligne user_societes.
CREATE OR REPLACE FUNCTION private.cabinet_utilisateurs_agit()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT coalesce(array_agg(DISTINCT us.user_id), '{}'::uuid[])
  FROM public.user_societes us
  WHERE us.societe_id = ANY ((SELECT public.cabinet_societes_agit())::uuid[])
$function$;

REVOKE ALL ON FUNCTION private.cabinet_services_agit() FROM anon, public;
REVOKE ALL ON FUNCTION private.cabinet_custom_services_agit() FROM anon, public;
REVOKE ALL ON FUNCTION private.cabinet_utilisateurs_agit() FROM anon, public;
GRANT EXECUTE ON FUNCTION private.cabinet_services_agit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cabinet_custom_services_agit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cabinet_utilisateurs_agit() TO authenticated, service_role;

-- Index de la recherche ci-dessus (existe déjà sous ce nom depuis
-- 20261006110000 : sans effet dans ce cas).
CREATE INDEX IF NOT EXISTS user_societes_societe_id_idx ON public.user_societes (societe_id);

-- ─── Une ligne ne change pas de société ────────────────────────────────────
-- Trigger générique BEFORE UPDATE OF <colonne> ; la colonne est passée en
-- argument. Exceptions : appel hors session utilisateur (service_role,
-- postgres : auth.uid() nul et rôle autre qu'authenticated / anon) et
-- super-admin (rôle admin_general ou super_admin, testé sur le texte du rôle
-- comme trg_bloquer_role_super_admin).
-- SECURITY DEFINER (et non INVOKER) : la lecture de user_roles ne doit pas
-- dépendre des règles de cette table pour l'appelant.
-- Aucun code existant ne change la société d'une ligne (vérifié le
-- 2026-10-27 dans supabase/migrations, supabase/functions et src : les mises
-- à jour filtrent sur societe_id sans le modifier, les upsert ont societe_id
-- dans leur clé de conflit).
CREATE OR REPLACE FUNCTION public.interdire_changement_societe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  colonne constant text := TG_ARGV[0];
  uid uuid := auth.uid();
BEGIN
  IF (to_jsonb(OLD) -> colonne) IS DISTINCT FROM (to_jsonb(NEW) -> colonne) THEN
    IF uid IS NULL
       AND coalesce(current_setting('role', true), '') NOT IN ('authenticated', 'anon') THEN
      RETURN NEW;
    END IF;
    IF uid IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.user_roles r
         WHERE r.user_id = uid AND r.role::text IN ('admin_general', 'super_admin')) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'SOCIETE_IMMUABLE: une ligne ne change pas de société.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.interdire_changement_societe() FROM public, anon, authenticated;

-- ─── Règles des tables métier ───────────────────────────────────────────────
-- Liste : (table, colonne de société, module, niveau d'écriture, écriture
-- directe ouverte au cabinet, niveau de suppression — NULL : jamais).
-- Le module doit être celui de module_de_table : la boucle le vérifie.
DO $$
DECLARE
  r record;
  op text;
  agit constant text := '(SELECT public.cabinet_societes_agit())::uuid[]';
  lecture text;
  ecriture text;
  suppression text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ecritures_comptables',   'societe_id', 'compta',          2, true,  3),
      ('transactions',           'societe_id', 'compta',          2, true,  3),
      ('exercices',              'societe_id', 'compta',          3, true,  NULL),
      ('emprunts',               'societe_id', 'compta',          2, true,  3),
      ('informations_fiscales',  'societe_id', 'fiscalite',       2, true,  3),
      ('taux_historique',        'societe_id', 'fiscalite',       2, true,  3),
      ('params_annuels',         'societe_id', 'fiscalite',       2, true,  3),
      ('employes',               'societe_id', 'grh',             2, true,  3),
      ('bulletins_paie',         'societe_id', 'grh',             2, true,  3),
      ('primes',                 'societe_id', 'grh',             2, true,  3),
      ('heures_sup',             'societe_id', 'grh',             2, true,  3),
      ('retenues',               'societe_id', 'grh',             2, true,  3),
      ('absences',               'societe_id', 'grh',             2, true,  3),
      ('sanctions',              'societe_id', 'grh',             2, true,  3),
      ('factures',               'societe_id', 'factures',        2, true,  3),
      ('devis',                  'societe_id', 'factures',        2, true,  3),
      ('compteurs_numerotation', 'societe_id', 'factures',        2, false, NULL),
      ('articles',               'societe_id', 'stock',           2, true,  3),
      ('mouvements_stock',       'societe_id', 'stock',           2, true,  3),
      ('fournisseurs',           'societe_id', 'stock',           2, true,  3),
      ('categories_stock',       'societe_id', 'stock',           2, true,  3),
      ('immobilisations',        'societe_id', 'immobilisations', 2, true,  3),
      ('societes',               'id',         'parametres',      2, true,  NULL),
      ('societe_config',         'societe_id', 'parametres',      2, true,  NULL),
      ('societe_identification', 'societe_id', 'parametres',      2, true,  NULL),
      ('activites',              'societe_id', 'parametres',      2, true,  NULL)
    ) AS t(tab, col, module, niveau_ecriture, ecriture_directe, niveau_suppression)
  LOOP
    -- Table et colonne présentes, RLS active, module cohérent.
    IF to_regclass(format('public.%I', r.tab)) IS NULL THEN
      RAISE EXCEPTION 'cabinet_regles_acces : table public.% absente', r.tab;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = format('public.%I', r.tab)::regclass
        AND attname = r.col AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'cabinet_regles_acces : colonne %.% absente', r.tab, r.col;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', r.tab)::regclass) THEN
      RAISE EXCEPTION 'cabinet_regles_acces : RLS inactive sur public.%', r.tab;
    END IF;
    IF public.module_de_table(r.tab) IS DISTINCT FROM r.module THEN
      RAISE EXCEPTION 'cabinet_regles_acces : module de % (%) <> module_de_table (%)',
        r.tab, r.module, public.module_de_table(r.tab);
    END IF;

    lecture := format('%I = ANY ((SELECT public.cabinet_societes(%L, 1))::uuid[])', r.col, r.module);
    ecriture := format('%I = ANY ((SELECT public.cabinet_societes(%L, %s))::uuid[])',
                       r.col, r.module, r.niveau_ecriture);
    suppression := CASE WHEN r.niveau_suppression IS NOT NULL THEN
      format('%I = ANY ((SELECT public.cabinet_societes(%L, %s))::uuid[])',
             r.col, r.module, r.niveau_suppression) END;

    -- Permissive : lecture.
    EXECUTE format('DROP POLICY IF EXISTS cabinet_lecture ON public.%I', r.tab);
    EXECUTE format('CREATE POLICY cabinet_lecture ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)',
                   r.tab, lecture);

    -- Permissives : écriture et suppression.
    FOREACH op IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'cabinet_ecriture_' || op, r.tab);
    END LOOP;
    IF r.ecriture_directe THEN
      EXECUTE format('CREATE POLICY cabinet_ecriture_insert ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',
                     r.tab, ecriture);
      EXECUTE format('CREATE POLICY cabinet_ecriture_update ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                     r.tab, ecriture, ecriture);
    END IF;
    IF r.ecriture_directe AND suppression IS NOT NULL THEN
      EXECUTE format('CREATE POLICY cabinet_ecriture_delete ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',
                     r.tab, suppression);
    END IF;

    -- Restrictives : plafonds, quelles que soient les autres règles.
    EXECUTE format('DROP POLICY IF EXISTS cabinet_plafond_lecture ON public.%I', r.tab);
    EXECUTE format('CREATE POLICY cabinet_plafond_lecture ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%I <> ALL (%s) OR %s)',
                   r.tab, r.col, agit, lecture);

    EXECUTE format('DROP POLICY IF EXISTS cabinet_plafond_ecriture_insert ON public.%I', r.tab);
    EXECUTE format('CREATE POLICY cabinet_plafond_ecriture_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%I <> ALL (%s) OR %s)',
                   r.tab, r.col, agit, ecriture);
    EXECUTE format('DROP POLICY IF EXISTS cabinet_plafond_ecriture_update ON public.%I', r.tab);
    EXECUTE format('CREATE POLICY cabinet_plafond_ecriture_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%I <> ALL (%s) OR %s) WITH CHECK (%I <> ALL (%s) OR %s)',
                   r.tab, r.col, agit, ecriture, r.col, agit, ecriture);
    EXECUTE format('DROP POLICY IF EXISTS cabinet_plafond_ecriture_delete ON public.%I', r.tab);
    IF suppression IS NOT NULL THEN
      EXECUTE format('CREATE POLICY cabinet_plafond_ecriture_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%I <> ALL (%s) OR %s)',
                     r.tab, r.col, agit, suppression);
    ELSE
      -- Pas de branche cabinet : aucune suppression là où l'on agit comme cabinet.
      EXECUTE format('CREATE POLICY cabinet_plafond_ecriture_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%I <> ALL (%s))',
                     r.tab, r.col, agit);
    END IF;

    -- Société immuable (societes : sa colonne est id, non concernée).
    EXECUTE format('DROP TRIGGER IF EXISTS trg_societe_immuable ON public.%I', r.tab);
    IF r.tab <> 'societes' THEN
      EXECUTE format('CREATE TRIGGER trg_societe_immuable BEFORE UPDATE OF %I ON public.%I FOR EACH ROW EXECUTE FUNCTION public.interdire_changement_societe(%L)',
                     r.col, r.tab, r.col);
    END IF;
  END LOOP;
END $$;

-- ─── Tables d'administration : refus total pour un membre de cabinet ───────
-- Une seule règle RESTRICTIVE FOR ALL (lecture et écriture). Pour un
-- utilisateur sans cabinet, ou pour une société où l'on a un accès direct
-- (user_societes : l'accès direct prime), elle ne change rien.
--   * tables avec societe_id : la société n'est pas une de celles où
--     l'appelant agit comme cabinet ;
--   * service_membres (service_id → services) et custom_postes
--     (service_id → custom_services) : le service n'appartient pas à l'une
--     de ces sociétés ;
--   * permission_overrides et cross_service_grants (droits d'un utilisateur,
--     sans société) : l'utilisateur visé n'est rattaché à aucune de ces
--     sociétés (voir l'effet accepté en tête de fichier).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('services',             'societe_id', 'public.cabinet_societes_agit()'),
      ('custom_services',      'societe_id', 'public.cabinet_societes_agit()'),
      ('user_custom_postes',   'societe_id', 'public.cabinet_societes_agit()'),
      ('user_activites',       'societe_id', 'public.cabinet_societes_agit()'),
      ('portail_messages',     'societe_id', 'public.cabinet_societes_agit()'),
      ('service_membres',      'service_id', 'private.cabinet_services_agit()'),
      ('custom_postes',        'service_id', 'private.cabinet_custom_services_agit()'),
      ('permission_overrides', 'user_id',    'private.cabinet_utilisateurs_agit()'),
      ('cross_service_grants', 'user_id',    'private.cabinet_utilisateurs_agit()')
    ) AS t(tab, col, liste)
  LOOP
    IF to_regclass(format('public.%I', r.tab)) IS NULL THEN
      RAISE EXCEPTION 'cabinet_regles_acces : table public.% absente', r.tab;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = format('public.%I', r.tab)::regclass
        AND attname = r.col AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'cabinet_regles_acces : colonne %.% absente', r.tab, r.col;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', r.tab)::regclass) THEN
      RAISE EXCEPTION 'cabinet_regles_acces : RLS inactive sur public.%', r.tab;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS cabinet_refus ON public.%I', r.tab);
    EXECUTE format(
      'CREATE POLICY cabinet_refus ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%I <> ALL ((SELECT %s)::uuid[])) WITH CHECK (%I <> ALL ((SELECT %s)::uuid[]))',
      r.tab, r.col, r.liste, r.col, r.liste);
  END LOOP;
END $$;
$migration_sql$]),
  ('20261027123000', 'cabinet_validation_audit', ARRAY[$migration_sql$-- Espace cabinet, étape 1 : validation à quatre yeux et audit signé
-- (spec 2026-10-27, § 5, § 6.3 et § 6.4 ; plan, tâche 4, avec les ajouts
-- des relectures des tâches 2 et 3).
--
-- Suppose appliquées les migrations 20261027120000_cabinet_schema.sql,
-- 20261027121000_cabinet_droits.sql (agit_comme_cabinet, cabinet_niveau) et
-- 20261027122000_cabinet_regles_acces.sql (module_de_table).
-- Les migrations des tâches 2, 3 et 4 s'appliquent ensemble.
--
-- Contenu :
--   1. controle_quatre_yeux() (source : 20261008223000_quatre_yeux_annulation_
--      restauration.sql, non redéfinie depuis) :
--        * la dispense des administrateurs ne vaut plus quand l'auteur agit
--          comme cabinet sur la société de la ligne ;
--        * un membre de cabinet ne passe une pièce au statut validé que si son
--          niveau dans le module de la table est 3 (validation) :
--          sinon CABINET_VALIDATION ;
--        * la règle « pas sa propre saisie » est inchangée.
--   2. controle_reouverture_exercice() (source : 20261009070000_exercices_
--      cloture.sql, non redéfinie depuis), trigger trg_exercices_reouverture
--      recréé en BEFORE UPDATE OR DELETE :
--        * réouverture : administrateur direct seulement ; jamais pour un
--          auteur qui agit comme cabinet, quel que soit son niveau (§ 5) ;
--        * exercice clos : ni suppression, ni changement d'annee ou de
--          societe_id, sauf administrateur direct.
--   3. cree_par non falsifiable : trigger trg_cree_par (BEFORE INSERT) sur les
--      huit tables à quatre yeux.
--   4. audit_log.cabinet_id, rempli par audit_trigger_fn() (source :
--      20260522011847_124c8eb4-0478-4525-a123-3e026930e4e7.sql, non redéfinie
--      depuis) quand l'auteur agit comme cabinet sur la société de la ligne.
--      Le cabinet est donné par private.cabinet_signature(uid, société),
--      calculée seulement quand une ligne d'audit est écrite (pas pour un
--      UPDATE sans changement).
--   5. bulletins_paie (sans contrôle quatre yeux), à l'INSERT comme à
--      l'UPDATE : un membre de cabinet ne passe un bulletin à 'valide' ou
--      'paye' qu'au niveau 3 en grh (sinon CABINET_VALIDATION), et ne le passe
--      à 'paye' qu'au niveau 2 au moins en compta (sinon CABINET_PAIEMENT :
--      le paiement du salaire est une opération comptable).
--   6. Signature non falsifiable : toute ligne d'audit qui ne vient pas
--      d'audit_trigger_fn (insertion directe par l'application, fonction
--      Edge, autre fonction) voit son cabinet_id recalculé pour auth.uid()
--      et la société de la ligne ; la valeur fournie est ignorée.
--   7. Ligne déjà validée : un membre de cabinet sous le niveau 3 du module
--      ne modifie ni une écriture validée (lignes, libelle, date, journal,
--      numero_piece) ni un bulletin validé ou payé (toute colonne sauf
--      statut), sauf pour la repasser en brouillon (CABINET_VALIDATION).
--      Les autres tables ne sont pas concernées (l'encaissement d'une
--      facture validée reste possible).
--
-- Limites acceptées (décisions du 2026-10-27, relecture de la tâche 4) :
--   * ecritures_comptables n'a pas de trigger d'audit (aucune migration n'en
--     pose) : rien n'est ajouté ici ; le test d'audit porte sur transactions.
--   * L'insertion directe d'une pièce au statut validé n'est pas contrôlée
--     (quatre yeux et CABINET_VALIDATION portent sur l'UPDATE) : l'application
--     crée validées les écritures automatiques (facture payée, paie, cession,
--     variation de stock, clôture).
--   * Sociétés sans cabinet : un chef comptable non administrateur ne peut
--     plus supprimer un exercice clos ni en changer l'année (l'application ne
--     le fait pas : definirStatut est un upsert à société et année constantes).
--   * cree_par : une pièce recréée en session (par exemple depuis la
--     corbeille) prend pour auteur l'utilisateur qui la recrée.
--   * Message levé : 'CABINET_VALIDATION: <texte>' (format CODE: texte des
--     autres codes) ; messageErreur le reconnaît par son code.
--   * Ordre : pour un membre de cabinet sous le niveau 3 qui valide sa propre
--     saisie, CABINET_VALIDATION passe avant QUATRE_YEUX.
--   * La colonne audit_log.cabinet_id, sa clé étrangère et son index sont
--     créés dans la transaction de migration : audit_log reste verrouillée le
--     temps du parcours de la table.
--   * Exercice clos : un niveau 3 du cabinet (comme un chef comptable direct)
--     peut encore modifier affectation, date_cloture et cloture_par d'un
--     exercice clos ; seuls la réouverture, la suppression et le changement
--     d'année ou de société sont contrôlés.
--
-- « Administrateur direct » : (is_admin(uid) OR is_admin_general(uid)) AND NOT
-- agit_comme_cabinet(uid, société de la ligne). Une personne qui a le rôle
-- global admin (par exemple pour la propre société de son cabinet) garde ses
-- dispenses là où elle a un accès direct, et les perd chez les clients du
-- cabinet. Un super-admin n'agit jamais comme cabinet (tâche 2) : inchangé.
--
-- Fonctions trigger : SECURITY DEFINER. auth.uid() y reste l'auteur de la
-- requête (il lit request.jwt.claims, indépendant du rôle d'exécution) :
-- agit_comme_cabinet(uid, …) et cabinet_niveau(uid, …), qui ne répondent que
-- pour l'appelant (_uid = auth.uid()), donnent donc bien la réponse pour
-- l'auteur.
--
-- Opérations serveur (auth.uid() nul : service_role, postgres, tâches
-- planifiées) : aucun contrôle, comme avant.
-- Migration rejouable.

-- ─── Garde de déploiement ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE etat <> 'termine') THEN
    RAISE EXCEPTION 'Espace cabinet : appliquer les migrations des tâches 2, 3 et 4 ensemble, avant tout lien cabinet.';
  END IF;
END $$;

-- ─── Tables à quatre yeux : vérification ───────────────────────────────────
-- Les huit tables où trg_quatre_yeux est posé (20261008223000) ; aucune
-- migration plus récente n'en ajoute. Chacune doit avoir societe_id et
-- cree_par, et un module dans module_de_table (sinon cabinet_niveau rendrait
-- 0 et toute validation par un cabinet serait refusée).
DO $$
DECLARE
  attendues constant text[] := ARRAY['absences', 'ecritures_comptables', 'employes', 'factures',
                                     'heures_sup', 'primes', 'sanctions', 'transactions'];
  posees text[];
  t text;
BEGIN
  SELECT coalesce(array_agg(DISTINCT c.relname::text ORDER BY c.relname::text), '{}')
    INTO posees
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE tg.tgfoid = 'public.controle_quatre_yeux()'::regprocedure
    AND NOT tg.tgisinternal;
  IF posees IS DISTINCT FROM attendues THEN
    RAISE EXCEPTION 'cabinet_validation_audit : trg_quatre_yeux posé sur %, attendu %', posees, attendues;
  END IF;

  FOREACH t IN ARRAY attendues LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                   WHERE attrelid = format('public.%I', t)::regclass
                     AND attname = 'societe_id' AND NOT attisdropped) THEN
      RAISE EXCEPTION 'cabinet_validation_audit : colonne %.societe_id absente', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                   WHERE attrelid = format('public.%I', t)::regclass
                     AND attname = 'cree_par' AND NOT attisdropped) THEN
      RAISE EXCEPTION 'cabinet_validation_audit : colonne %.cree_par absente', t;
    END IF;
    IF public.module_de_table(t) IS NULL THEN
      RAISE EXCEPTION 'cabinet_validation_audit : % absente de module_de_table', t;
    END IF;
  END LOOP;
END $$;

-- ─── 1. Quatre yeux ─────────────────────────────────────────────────────────
-- TG_ARGV[0] = colonne de statut, TG_ARGV[1] = valeur « validé ».
-- L'auteur ne peut pas être modifié. Saisies anciennes (auteur inconnu) :
-- pas de contrôle « propre saisie » (inchangé), mais le niveau du cabinet
-- s'applique.
CREATE OR REPLACE FUNCTION public.controle_quatre_yeux()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  colonne text := TG_ARGV[0];
  valeur_valide text := TG_ARGV[1];
  ancien text;
  nouveau text;
  uid uuid := auth.uid();
  cabinet boolean;
BEGIN
  NEW.cree_par := OLD.cree_par;
  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', colonne, colonne)
    INTO ancien, nouveau USING OLD, NEW;
  IF uid IS NOT NULL
     AND nouveau = valeur_valide
     AND ancien IS DISTINCT FROM valeur_valide THEN
    cabinet := public.agit_comme_cabinet(uid, NEW.societe_id);
    -- Membre de cabinet : validation au niveau 3 seulement (jamais un
    -- stagiaire, jamais en depart_demande).
    IF cabinet
       AND public.cabinet_niveau(uid, NEW.societe_id, public.module_de_table(TG_TABLE_NAME)) < 3 THEN
      RAISE EXCEPTION 'CABINET_VALIDATION: votre mission dans ce dossier ne permet pas de valider'
        USING ERRCODE = '42501';
    END IF;
    -- Pas sa propre saisie, sauf administrateur direct.
    IF OLD.cree_par = uid
       AND NOT ((public.is_admin(uid) OR public.is_admin_general(uid)) AND NOT cabinet) THEN
      RAISE EXCEPTION 'QUATRE_YEUX: vous ne pouvez pas valider votre propre saisie'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.controle_quatre_yeux() FROM anon, public;

-- ─── 2. Exercices : réouverture, suppression, année d'un exercice clos ─────
-- Codes repris pour que messageErreur les traduise : EXERCICE_REOUVERTURE pour
-- une réouverture refusée, EXERCICE_CLOTURE pour la suppression ou le
-- changement d'année / de société d'un exercice clos.
-- Pour un changement de société, l'accès cabinet est testé sur l'ancienne et
-- sur la nouvelle société (le trigger trg_societe_immuable le refuse déjà,
-- sauf super-admin).
CREATE OR REPLACE FUNCTION public.controle_reouverture_exercice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cabinet boolean;
  dispense boolean;
BEGIN
  IF uid IS NULL OR OLD.statut IS DISTINCT FROM 'cloture' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  cabinet := public.agit_comme_cabinet(uid, OLD.societe_id)
             OR (TG_OP = 'UPDATE' AND NEW.societe_id IS DISTINCT FROM OLD.societe_id
                 AND public.agit_comme_cabinet(uid, NEW.societe_id));
  dispense := (public.is_admin(uid) OR public.is_admin_general(uid)) AND NOT cabinet;

  IF TG_OP = 'DELETE' THEN
    IF NOT dispense THEN
      RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé et ne peut pas être supprimé', OLD.annee
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Réouverture : jamais par un cabinet (§ 5), sinon administrateur direct.
  IF NEW.statut = 'ouvert' THEN
    IF cabinet THEN
      RAISE EXCEPTION 'EXERCICE_REOUVERTURE: un cabinet ne rouvre pas un exercice clôturé'
        USING ERRCODE = '42501';
    END IF;
    IF NOT dispense THEN
      RAISE EXCEPTION 'EXERCICE_REOUVERTURE: seul un administrateur peut rouvrir un exercice clôturé'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.annee IS DISTINCT FROM OLD.annee OR NEW.societe_id IS DISTINCT FROM OLD.societe_id)
     AND NOT dispense THEN
    RAISE EXCEPTION 'EXERCICE_CLOTURE: l''exercice % est clôturé', OLD.annee
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.controle_reouverture_exercice() FROM anon, public;

DROP TRIGGER IF EXISTS trg_exercices_reouverture ON public.exercices;
CREATE TRIGGER trg_exercices_reouverture BEFORE UPDATE OR DELETE ON public.exercices
  FOR EACH ROW EXECUTE FUNCTION public.controle_reouverture_exercice();

-- ─── 3. cree_par non falsifiable à l'insertion ─────────────────────────────
-- En session utilisateur, l'auteur est toujours l'appelant, quelle que soit
-- la valeur envoyée ; hors session (auth.uid() nul), la valeur fournie est
-- gardée (reprises et traitements serveur). En UPDATE, controle_quatre_yeux
-- garde déjà l'auteur d'origine.
CREATE OR REPLACE FUNCTION public.forcer_cree_par()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.cree_par := coalesce(auth.uid(), NEW.cree_par);
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.forcer_cree_par() FROM public, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['absences', 'ecritures_comptables', 'employes', 'factures',
                           'heures_sup', 'primes', 'sanctions', 'transactions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_cree_par ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_cree_par BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.forcer_cree_par()', t);
  END LOOP;
END $$;

-- ─── 4. Audit signé ─────────────────────────────────────────────────────────
-- Historique conservé : un cabinet cité dans l'audit ne se supprime pas.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS cabinet_id uuid REFERENCES public.cabinets(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_audit_log_cabinet
  ON public.audit_log (cabinet_id, created_at DESC) WHERE cabinet_id IS NOT NULL;

-- Le schéma private est créé par 20261027122000_cabinet_regles_acces.sql
-- (tâche 3, appliquée avant celle-ci) ; vérification.
DO $$
BEGIN
  IF to_regnamespace('private') IS NULL THEN
    RAISE EXCEPTION 'cabinet_validation_audit : schéma private absent (migration 20261027122000 à appliquer avant)';
  END IF;
END $$;

-- Cabinet au titre duquel _uid agit sur _societe (NULL sinon). Même logique
-- que cabinet_liens_internes (tâche 2) : lien actif ou depart_demande,
-- cabinet actif, membre actif, responsable ou attribué sur le dossier, aucune
-- ligne user_societes pour ce couple, pas de rôle super-admin. Sans la limite
-- à l'appelant : appelée seulement par des triggers (audit_trigger_fn,
-- audit_log_cabinet_client), avec auth.uid(). EXECUTE : propriétaire et
-- service_role seulement.
CREATE OR REPLACE FUNCTION private.cabinet_signature(_uid uuid, _societe uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT d.cabinet_id
  FROM public.cabinet_membres m
  JOIN public.cabinets c         ON c.id = m.cabinet_id AND c.actif
  JOIN public.cabinet_dossiers d ON d.cabinet_id = m.cabinet_id
                                AND d.etat IN ('actif', 'depart_demande')
  LEFT JOIN public.cabinet_attributions a ON a.dossier_id = d.id AND a.user_id = m.user_id
  WHERE m.user_id = _uid
    AND m.actif
    AND d.societe_id = _societe
    AND (m.role = 'responsable' OR a.user_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_societes us
      WHERE us.user_id = _uid AND us.societe_id = d.societe_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = _uid AND r.role::text IN ('admin_general', 'super_admin')
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION private.cabinet_signature(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cabinet_signature(uuid, uuid) TO service_role;

-- Identique à la version du 2026-05-22, plus :
--   * cabinet_id = private.cabinet_signature(auteur, société), calculée
--     seulement quand une ligne est écrite (après le calcul des changements
--     pour un UPDATE) ; lignes sans societe_id (profiles, user_roles…) ou sans
--     auteur : NULL ;
--   * le réglage de transaction ebene.audit_interne vaut '1' le temps de
--     l'INSERT dans audit_log : le trigger audit_log_cabinet_client garde
--     alors le cabinet_id calculé ici (section 6).
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_old JSONB;
  v_new JSONB;
  v_changes JSONB := '{}'::jsonb;
  v_record_id TEXT;
  v_societe_id UUID;
  v_cabinet_id UUID;
  k TEXT;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(v_old->>'id', '');
    BEGIN v_societe_id := (v_old->>'societe_id')::uuid; EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', '');
    BEGIN v_societe_id := (v_new->>'societe_id')::uuid; EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(v_new->>'id', '');
    BEGIN v_societe_id := COALESCE((v_new->>'societe_id')::uuid, (v_old->>'societe_id')::uuid); EXCEPTION WHEN OTHERS THEN v_societe_id := NULL; END;
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_old->k) IS DISTINCT FROM (v_new->k) THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      END IF;
    END LOOP;
    -- UPDATE sans changement : aucune ligne d'audit, aucun calcul.
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE user_id = v_user_id;
    IF v_societe_id IS NOT NULL THEN
      v_cabinet_id := private.cabinet_signature(v_user_id, v_societe_id);
    END IF;
  END IF;

  PERFORM set_config('ebene.audit_interne', '1', true);
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, old_data, societe_id, cabinet_id)
    VALUES (v_user_id, v_user_email, 'DELETE', TG_TABLE_NAME, v_record_id, v_old, v_societe_id, v_cabinet_id);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, new_data, societe_id, cabinet_id)
    VALUES (v_user_id, v_user_email, 'INSERT', TG_TABLE_NAME, v_record_id, v_new, v_societe_id, v_cabinet_id);
  ELSE
    INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data, changes, societe_id, cabinet_id)
    VALUES (v_user_id, v_user_email, 'UPDATE', TG_TABLE_NAME, v_record_id, v_old, v_new, v_changes, v_societe_id, v_cabinet_id);
  END IF;
  PERFORM set_config('ebene.audit_interne', '', true);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- Comme en 20261006110000 : fonction trigger, jamais appelée par l'API.
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM public, anon, authenticated;

-- ─── 5. Bulletins de paie : validation et paiement par un cabinet ──────────
-- Statuts de bulletins_paie : 'brouillon', 'valide', 'paye' (CHECK de
-- 20260504000001_bulletins_paie.sql). À l'INSERT, ou à l'UPDATE quand le
-- statut change, vers 'valide' ou 'paye' :
--   * membre de cabinet sous le niveau 3 en grh (stagiaire, mission sans
--     validation paie, depart_demande) : CABINET_VALIDATION ;
--   * vers 'paye', membre de cabinet sous le niveau 2 en compta (mission
--     paie_social, lecture…) : CABINET_PAIEMENT.
-- Sans cabinet : aucun effet (agit_comme_cabinet faux). Hors session : aucun
-- contrôle.
CREATE OR REPLACE FUNCTION public.controle_validation_bulletin_cabinet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  transition boolean;
BEGIN
  IF uid IS NULL OR NEW.statut NOT IN ('valide', 'paye') THEN
    RETURN NEW;
  END IF;
  -- OLD n'existe pas à l'INSERT : pas de lecture de OLD dans ce cas.
  IF TG_OP = 'INSERT' THEN
    transition := true;
  ELSE
    transition := OLD.statut IS DISTINCT FROM NEW.statut;
  END IF;
  IF NOT transition OR NOT public.agit_comme_cabinet(uid, NEW.societe_id) THEN
    RETURN NEW;
  END IF;
  IF public.cabinet_niveau(uid, NEW.societe_id, 'grh') < 3 THEN
    RAISE EXCEPTION 'CABINET_VALIDATION: votre mission dans ce dossier ne permet pas de valider'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.statut = 'paye' AND public.cabinet_niveau(uid, NEW.societe_id, 'compta') < 2 THEN
    RAISE EXCEPTION 'CABINET_PAIEMENT: votre mission ne couvre pas la comptabilité'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.controle_validation_bulletin_cabinet() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bulletins_validation_cabinet ON public.bulletins_paie;
CREATE TRIGGER trg_bulletins_validation_cabinet BEFORE INSERT OR UPDATE ON public.bulletins_paie
  FOR EACH ROW EXECUTE FUNCTION public.controle_validation_bulletin_cabinet();

-- ─── 6. audit_log : cabinet_id non falsifiable ─────────────────────────────
-- Mécanisme : audit_trigger_fn met le réglage de transaction
-- ebene.audit_interne à '1' juste avant son INSERT et le remet à '' juste
-- après. Toute autre insertion (règle audit_log_insert : l'application écrit
-- elle-même des lignes ; fonctions Edge ; autres fonctions) trouve un réglage
-- différent de '1' : cabinet_id y est recalculé par
-- private.cabinet_signature(auth.uid(), societe_id), NULL sans utilisateur ou
-- sans société ; la valeur fournie est ignorée.
-- Pourquoi c'est sûr : une session client (PostgREST) ne peut exécuter ni SET
-- ni set_config (pg_catalog n'est pas exposé, et aucune fonction publique ne
-- pose ce réglage) ; si l'INSERT d'audit_trigger_fn échoue, l'erreur annule
-- la requête (ou la sous-transaction) et le réglage avec elle.
-- SECURITY DEFINER : nécessaire pour appeler private.cabinet_signature, dont
-- authenticated n'a pas l'EXECUTE.
DO $$
DECLARE
  definer boolean;
  proprietaire text;
BEGIN
  SELECT p.prosecdef, pg_get_userbyid(p.proowner) INTO definer, proprietaire
  FROM pg_proc p WHERE p.oid = 'public.audit_trigger_fn()'::regprocedure;
  IF NOT definer THEN
    RAISE EXCEPTION 'cabinet_validation_audit : audit_trigger_fn n''est pas SECURITY DEFINER';
  END IF;
  IF proprietaire IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'cabinet_validation_audit : audit_trigger_fn appartient à %', proprietaire;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.audit_log_cabinet_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF coalesce(current_setting('ebene.audit_interne', true), '') <> '1' THEN
    NEW.cabinet_id := CASE WHEN uid IS NOT NULL AND NEW.societe_id IS NOT NULL
                           THEN private.cabinet_signature(uid, NEW.societe_id) END;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.audit_log_cabinet_client() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_cabinet_client ON public.audit_log;
CREATE TRIGGER trg_audit_log_cabinet_client BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_cabinet_client();

-- ─── 7. Ligne déjà validée : pas de modification sous le niveau 3 ──────────
-- ecritures_comptables : ligne au statut 'valide' ; colonnes surveillées
-- lignes, libelle, date, journal, numero_piece.
-- bulletins_paie : ligne au statut 'valide' ou 'paye' ; toute colonne sauf
-- statut et updated_at (posée par le trigger de mise à jour).
-- Toujours permis : repasser la ligne en brouillon (NEW.statut = 'brouillon').
-- Ne concerne qu'un auteur qui agit comme cabinet avec un niveau < 3 dans le
-- module de la table (compta, grh). Comparaison en jsonb : une colonne absente
-- vaut NULL des deux côtés.
CREATE OR REPLACE FUNCTION public.controle_ligne_validee_cabinet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  vieux jsonb;
  neuf jsonb;
BEGIN
  IF uid IS NULL OR NEW.statut = 'brouillon' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'ecritures_comptables' THEN
    IF OLD.statut IS DISTINCT FROM 'valide' THEN
      RETURN NEW;
    END IF;
    SELECT jsonb_object_agg(c, to_jsonb(OLD) -> c), jsonb_object_agg(c, to_jsonb(NEW) -> c)
      INTO vieux, neuf
    FROM unnest(ARRAY['lignes', 'libelle', 'date', 'journal', 'numero_piece']) AS c;
  ELSIF TG_TABLE_NAME = 'bulletins_paie' THEN
    IF OLD.statut NOT IN ('valide', 'paye') THEN
      RETURN NEW;
    END IF;
    vieux := to_jsonb(OLD) - 'statut' - 'updated_at';
    neuf  := to_jsonb(NEW) - 'statut' - 'updated_at';
  ELSE
    RETURN NEW;
  END IF;
  IF vieux IS DISTINCT FROM neuf
     AND public.agit_comme_cabinet(uid, OLD.societe_id)
     AND public.cabinet_niveau(uid, OLD.societe_id, public.module_de_table(TG_TABLE_NAME)) < 3 THEN
    RAISE EXCEPTION 'CABINET_VALIDATION: votre mission dans ce dossier ne permet pas de modifier une pièce validée'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.controle_ligne_validee_cabinet() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ligne_validee_cabinet ON public.ecritures_comptables;
CREATE TRIGGER trg_ligne_validee_cabinet BEFORE UPDATE ON public.ecritures_comptables
  FOR EACH ROW EXECUTE FUNCTION public.controle_ligne_validee_cabinet();
DROP TRIGGER IF EXISTS trg_ligne_validee_cabinet ON public.bulletins_paie;
CREATE TRIGGER trg_ligne_validee_cabinet BEFORE UPDATE ON public.bulletins_paie
  FOR EACH ROW EXECUTE FUNCTION public.controle_ligne_validee_cabinet();
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
