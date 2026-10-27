-- Espace cabinet, étape 1 : règles d'accès des tables métier
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
