-- Espace cabinet, étape 1 : tables et types (spec 2026-10-27, § 4.1 à 4.4).
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
