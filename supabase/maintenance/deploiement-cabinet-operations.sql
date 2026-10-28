-- Déploiement de la tâche 5 de l espace cabinet (opérations) : applique la migration 20261027124000_cabinet_operations.sql
-- et l inscrit dans l historique, en une seule transaction (tout ou rien). À lancer une fois.
-- Généré depuis supabase/migrations ; ne pas modifier à la main.
BEGIN;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261027123000') THEN
    RAISE EXCEPTION 'Les migrations précédentes de l espace cabinet ne sont pas inscrites : arrêt.';
  END IF;
END $g$;
-- Espace cabinet, étape 1 : opérations sur les cabinets
-- (spec 2026-10-27, § 2, § 4 et § 7 ; plan, tâche 5, et la fonction
-- cabinet_collaborateurs_dossier de la tâche 9, livrée ici).
--
-- Suppose appliquées les migrations 20261027120000 à 20261027123000
-- (tables, cabinet_admin_client, cabinet_liens_internes, schéma private).
-- Aucun lien cabinet n'existe en production : pas de garde de déploiement.
--
-- Fonctions exposées (SECURITY DEFINER, search_path = public, EXECUTE :
-- authenticated et service_role ; chacune contrôle elle-même l'appelant) :
--   * cabinet_creer(nom, responsable, max_dossiers)   super-admin (aal2)
--   * cabinet_reserver_ajout(cabinet)                 responsable du cabinet ou super-admin
--                                                     (quota d'ajouts, appelée par cabinet-ops)
--   * cabinet_definir_membre(cabinet, user, role, actif)
--                                                     responsable du cabinet ou super-admin
--   * cabinet_detacher_membre(cabinet, user)          super-admin, ou responsable pour un
--                                                     membre jamais connecté
--   * cabinet_creer_dossier(cabinet, nom, nif, rccm, forme_juridique, debut_exercice)
--                                                     responsable du cabinet
--   * cabinet_rattacher(cabinet, societe, mission)    super-admin
--   * cabinet_attribuer(dossier, user, mission)       responsable du cabinet du dossier
--   * cabinet_retirer_attribution(dossier, user)      responsable du cabinet du dossier
--   * cabinet_changer_mission(dossier, mission)       administrateur du client
--                                                     (cabinet_admin_client) ou super-admin
--   * mes_dossiers_cabinet()                          l'appelant (ses dossiers)
--   * cabinet_collaborateurs_dossier(societe)         administrateur du client ou super-admin
--   * mission_couvre(haute, basse)                    fonction pure (comme niveau_mission)
--
-- Définitions :
--   * super-admin : public.is_admin_general(auth.uid()), qui exige la session
--     aal2 (20261016120000). Un appel sans utilisateur (auth.uid() nul) n'est
--     jamais super-admin : les fonctions Edge appellent ces fonctions avec le
--     jeton de l'utilisateur, pas avec la clé service_role.
--   * responsable : ligne de cabinet_membres (lue directement) de l'appelant,
--     role 'responsable', actif, dans ce cabinet, cabinet actif.
--   * administrateur du client : public.cabinet_admin_client(auth.uid(), société)
--     uniquement (tâche 1). Avec des rôles globaux, une personne qui a le rôle
--     admin pour une autre société et qui est simplement rattachée
--     (user_societes) à la société cliente passe ce test : elle peut changer
--     la mission (limite connue, plan tâche 5).
--   * « mission A au plus égale à B » (mission_couvre(B, A)) : dans chacun des
--     huit modules, niveau_mission(A) <= niveau_mission(B). Ordre partiel :
--     lecture < declarations < compta_fiscalite < tenue_complete et
--     paie_social < tenue_complete ; paie_social n'est comparable qu'à
--     tenue_complete.
--
-- Choix :
--   * Changer la mission ABAISSE les attributions qui la dépassent : une
--     attribution que la nouvelle mission couvre est gardée ; sinon, si
--     l'attribution couvre la nouvelle mission, elle prend la nouvelle
--     mission ; sinon (missions non comparables, par exemple paie_social
--     contre compta_fiscalite), l'attribution est supprimée : aucune mission
--     ne vaut le minimum des deux, et le responsable réattribue. Ainsi
--     « attribution <= mission du dossier » reste vrai, et
--     mes_dossiers_cabinet() rend une mission exacte. Le calcul des droits
--     (tâche 2) prend de toute façon le minimum : rien ne change pour la base.
--   * La limite max_dossiers (liens non terminés : invitation, actif,
--     depart_demande) ne s'applique qu'à la création par le cabinet. Le
--     rattachement par le super-admin passe outre (décision du super-admin).
--   * cabinet_creer_dossier prend un verrou sur la ligne du cabinet : deux
--     créations simultanées ne dépassent pas la limite. Même verrou pour
--     cabinet_definir_membre (au moins un responsable actif).
--   * Une attribution ne vise qu'un membre ACTIF du même cabinet, collaborateur
--     ou stagiaire (un responsable agit déjà dans tous les dossiers).
--   * Aucune de ces fonctions n'écrit dans user_roles ni user_societes.
--   * Double accès (relecture de sécurité, I3) : cabinet_definir_membre refuse
--     d'ajouter ou d'activer une personne qui a une ligne user_societes sur
--     une société suivie par CE cabinet (lien non terminé) ; cabinet_rattacher
--     refuse une société où un membre actif du cabinet a une ligne
--     user_societes (CABINET_ACCES_DIRECT). Une désactivation reste toujours
--     possible. Le double accès peut encore naître ensuite, par admin-users
--     (l'administrateur du client rattache la personne) : l'écran super-admin
--     le signale (tâche 9).
--   * Quota (I1, puis C1 et M3 de la seconde relecture) : 20 TENTATIVES
--     d'ajout par cabinet sur 24 heures glissantes, abouties ou non. La
--     fonction Edge cabinet-ops appelle cabinet_reserver_ajout AVANT toute
--     recherche de compte : la tentative est enregistrée dans
--     cabinet_ajouts_tentatives (sa propre transaction, gardée même si l'ajout
--     échoue ensuite) ; au-delà, CABINET_QUOTA_JOUR, la même réponse quelle
--     que soit l'adresse (plus de test gratuit de l'existence d'un compte).
--     Seconde barrière dans cabinet_definir_membre : 20 insertions sur
--     24 heures (cabinet_membres.ajoute_par, colonne ajoutée ici). Ni les
--     tentatives ni les ajouts du super-admin ne comptent. La fonction Edge
--     supprime le compte qu'elle vient de créer si la base refuse.
--   * Comptes nouveaux seulement (C2) : pour un appelant qui n'est pas
--     super-admin, une INSERTION dans cabinet_definir_membre (pas la mise à
--     jour d'un membre de son cabinet) exige un compte tout juste créé
--     (private.cabinet_compte_neuf : créé il y a moins de 10 minutes, e-mail
--     confirmé, jamais connecté, ni user_roles, ni user_societes, ni membre
--     d'un cabinet ; un compte d'inscription publique n'est pas confirmé) ET
--     une réservation cabinet_reserver_ajout du même auteur, pour ce
--     cabinet, de moins de 10 minutes, consommée par l'insertion
--     (cabinet_ajouts_tentatives.utilisee) : un appel direct ne contourne
--     plus le quota, et détacher puis réajouter coûte une tentative.
--     Sinon un code unique, CABINET_COMPTE_EXISTANT, contrôlé AVANT les
--     autres refus qui décriraient le compte (UTILISATEUR, SUPER_ADMIN,
--     AUTRE_CABINET, ACCES_DIRECT) : appelée directement, la fonction ne
--     révèle rien de plus que cabinet-ops (qui rend MSG_ADRESSE).
--   * Détacher un membre (I1) : cabinet_detacher_membre supprime ses
--     attributions dans le cabinet puis sa ligne cabinet_membres ; le compte
--     redevient libre. Super-admin : tout membre ; responsable : un membre
--     jamais connecté (auth.users.last_sign_in_at nul), pas lui-même. Un
--     responsable actif ne se détache jamais (changer d'abord son rôle ou le
--     désactiver). Les tentatives d'ajout restent comptées. Trace dans
--     cabinet_membres_detaches (audit_log exige une société, qu'un
--     détachement n'a pas ; pas de trigger d'audit sur les tables cabinet).
--   * Identification à la création d'un dossier (I4) : NIF et RCCM dans
--     societes (nif, rccm) ; forme juridique et première année d'exercice
--     dans societe_identification.donnees (clés formeJuridique et
--     premiereAnnee, celles de l'écran Identification). Il n'existe pas de
--     colonne « date de début d'exercice » : les exercices sont des années
--     civiles (exercices.annee) ; la date fournie donne premiereAnnee.
--
-- Variables PL/pgSQL : jamais homonymes d'une colonne (relecture : nom).
--
-- Erreurs : RAISE EXCEPTION 'CABINET_<CODE>: <texte>' ; ERRCODE 42501 pour un
-- refus lié à l'appelant (CABINET_INTERDIT), P0001 sinon. messageErreur
-- (src/lib/ebene-utils.ts) affiche le texte qui suit « CABINET_<CODE>: ».
-- Migration rejouable.

-- ─── Pure : comparaison de deux missions ───────────────────────────────────
-- Vrai si _basse est au plus égale à _haute dans chacun des huit modules.
-- NULL si l'une des deux est NULL.
CREATE OR REPLACE FUNCTION public.mission_couvre(_haute public.mission_cabinet, _basse public.mission_cabinet)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT CASE WHEN _haute IS NULL OR _basse IS NULL THEN NULL
    ELSE bool_and(public.niveau_mission(_basse, m) <= public.niveau_mission(_haute, m)) END
  FROM unnest(ARRAY['compta', 'fiscalite', 'grh', 'factures', 'stock',
                    'immobilisations', 'parametres', 'dashboard']) AS m
$function$;

REVOKE EXECUTE ON FUNCTION public.mission_couvre(public.mission_cabinet, public.mission_cabinet) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mission_couvre(public.mission_cabinet, public.mission_cabinet) TO authenticated, service_role;

-- ─── Internes (schéma private, propriétaire seulement) ─────────────────────
DO $$
BEGIN
  IF to_regnamespace('private') IS NULL THEN
    RAISE EXCEPTION 'cabinet_operations : schéma private absent (migration 20261027122000 à appliquer avant)';
  END IF;
END $$;

-- Rôle super-admin d'un utilisateur quelconque (texte du rôle, quel que soit
-- le niveau aal ; comme cabinet_liens_internes et trg_bloquer_role_super_admin).
CREATE OR REPLACE FUNCTION private.cabinet_role_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _uid AND r.role::text IN ('admin_general', 'super_admin')
  )
$function$;

-- Responsable actif d'un cabinet actif (lecture directe des tables).
CREATE OR REPLACE FUNCTION private.cabinet_responsable_actif(_uid uuid, _cabinet uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cabinet_membres m
    JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
    WHERE m.user_id = _uid
      AND m.cabinet_id = _cabinet
      AND m.actif
      AND m.role = 'responsable'
  )
$function$;

-- Compte tout juste créé (C2) : créé il y a moins de 10 minutes, jamais
-- connecté, sans rôle global ni rattachement à une société, membre d'aucun
-- cabinet. Faux pour un id inconnu ou nul.
CREATE OR REPLACE FUNCTION private.cabinet_compte_neuf(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid
      AND u.created_at > now() - interval '10 minutes'
      AND u.last_sign_in_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid)
  AND NOT EXISTS (SELECT 1 FROM public.user_societes us WHERE us.user_id = _uid)
  AND NOT EXISTS (SELECT 1 FROM public.cabinet_membres m WHERE m.user_id = _uid)
$function$;

-- Identifiant d'adresse (slug) unique, à partir du nom, comme slugify()
-- (src/lib/superAdminApi.ts) : minuscules, sans accents, tirets, 60
-- caractères. En cas de doublon, suffixe tiré de l'id de la société.
CREATE OR REPLACE FUNCTION private.cabinet_slug(_nom text, _id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  base text;
  candidat text;
  n int := 0;
BEGIN
  -- Majuscules accentuées traduites aussi : lower() ne les convertit pas
  -- sous toutes les collations.
  base := translate(lower(coalesce(_nom, '')),
                    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
                    'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy');
  base := replace(replace(replace(replace(base, 'œ', 'oe'), 'æ', 'ae'), 'Œ', 'oe'), 'Æ', 'ae');
  base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
  base := btrim(left(base, 60), '-');
  IF base = '' THEN
    base := 'dossier';
  END IF;
  candidat := base;
  WHILE EXISTS (SELECT 1 FROM public.societes s WHERE s.slug = candidat) LOOP
    n := n + 1;
    candidat := btrim(left(base, 50), '-') || '-'
                || left(replace(_id::text, '-', ''), 6) || CASE WHEN n > 1 THEN n::text ELSE '' END;
  END LOOP;
  RETURN candidat;
END
$function$;

REVOKE ALL ON FUNCTION private.cabinet_role_super_admin(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_responsable_actif(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_slug(text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_compte_neuf(uuid) FROM public, anon, authenticated;

-- ─── Quota d'ajouts : tentatives et auteur des ajouts (C1, M3) ─────────────
-- Une ligne par tentative d'ajout de membre (cabinet_reserver_ajout), aboutie
-- ou non. Écrite seulement par cabinet_reserver_ajout ; lue par le
-- super-admin.
CREATE TABLE IF NOT EXISTS public.cabinet_ajouts_tentatives (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid        NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  auteur     uuid        NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  -- Vrai une fois consommée par une insertion (cabinet_definir_membre).
  utilisee   boolean     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS cabinet_ajouts_tentatives_cabinet_at_idx
  ON public.cabinet_ajouts_tentatives (cabinet_id, at DESC);

ALTER TABLE public.cabinet_ajouts_tentatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cabinet_ajouts_tentatives FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cabinet_ajouts_tentatives FROM authenticated;
GRANT SELECT ON public.cabinet_ajouts_tentatives TO authenticated;
GRANT ALL ON public.cabinet_ajouts_tentatives TO service_role;

DROP POLICY IF EXISTS cabinet_ajouts_tentatives_select ON public.cabinet_ajouts_tentatives;
CREATE POLICY cabinet_ajouts_tentatives_select ON public.cabinet_ajouts_tentatives FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_general((SELECT auth.uid()))));

-- Auteur d'un ajout de membre : la seconde barrière du quota ne compte pas
-- les ajouts du super-admin. Nul pour les lignes antérieures (comptées).
ALTER TABLE public.cabinet_membres ADD COLUMN IF NOT EXISTS ajoute_par uuid;

-- Trace des détachements (cabinet_detacher_membre) : audit_log exige une
-- société, qu'un détachement n'a pas. Écrite seulement par la fonction ;
-- lue par le super-admin.
CREATE TABLE IF NOT EXISTS public.cabinet_membres_detaches (
  id         uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid                NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  user_id    uuid                NOT NULL,
  role       public.role_cabinet NOT NULL,
  par        uuid                NOT NULL,
  at         timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cabinet_membres_detaches_cabinet_idx
  ON public.cabinet_membres_detaches (cabinet_id, at DESC);

ALTER TABLE public.cabinet_membres_detaches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cabinet_membres_detaches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cabinet_membres_detaches FROM authenticated;
GRANT SELECT ON public.cabinet_membres_detaches TO authenticated;
GRANT ALL ON public.cabinet_membres_detaches TO service_role;

DROP POLICY IF EXISTS cabinet_membres_detaches_select ON public.cabinet_membres_detaches;
CREATE POLICY cabinet_membres_detaches_select ON public.cabinet_membres_detaches FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_general((SELECT auth.uid()))));

-- ─── cabinet_reserver_ajout ─────────────────────────────────────────────────
-- Responsable actif du cabinet (cabinet actif) ou super-admin (aal2). Appelée
-- par cabinet-ops (jeton de l'appelant) AVANT toute recherche de compte.
-- Verrou sur la ligne du cabinet ; hors super-admin, 20 tentatives au plus
-- sur 24 heures glissantes (CABINET_QUOTA_JOUR), sinon la tentative est
-- enregistrée. Les tentatives du super-admin sont enregistrées sans compter.
CREATE OR REPLACE FUNCTION public.cabinet_reserver_ajout(_cabinet uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  est_super boolean;
  tentatives int;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  -- Verrou : deux tentatives simultanées ne dépassent pas le quota.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT est_super THEN
    SELECT count(*) INTO tentatives
    FROM public.cabinet_ajouts_tentatives t
    WHERE t.cabinet_id = _cabinet
      AND t.at > now() - interval '24 hours'
      AND NOT private.cabinet_role_super_admin(t.auteur);
    IF tentatives >= 20 THEN
      RAISE EXCEPTION 'CABINET_QUOTA_JOUR: Vingt ajouts ont déjà été tentés pour ce cabinet en 24 heures : réessayez demain.';
    END IF;
  END IF;
  INSERT INTO public.cabinet_ajouts_tentatives (cabinet_id, auteur) VALUES (_cabinet, uid);
END
$function$;

-- ─── cabinet_creer ──────────────────────────────────────────────────────────
-- Super-admin (aal2). Crée le cabinet et son premier responsable (compte
-- existant, ni super-admin, ni membre d'un autre cabinet).
CREATE OR REPLACE FUNCTION public.cabinet_creer(_nom text, _responsable uuid, _max_dossiers int DEFAULT 10)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  nouveau uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_admin_general(uid) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-administrateur (session validée par le code 2FA) peut créer un cabinet.'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_nom), '') IS NULL OR length(btrim(_nom)) > 200 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le nom du cabinet est obligatoire (200 caractères au plus).';
  END IF;
  IF _max_dossiers IS NULL OR _max_dossiers < 0 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La limite de dossiers doit être un nombre positif ou nul.';
  END IF;
  IF _responsable IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _responsable) THEN
    RAISE EXCEPTION 'CABINET_UTILISATEUR: Responsable introuvable : créez d''abord son compte.';
  END IF;
  IF private.cabinet_role_super_admin(_responsable) THEN
    RAISE EXCEPTION 'CABINET_SUPER_ADMIN: Un super-administrateur ne peut pas être membre d''un cabinet.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_membres m WHERE m.user_id = _responsable) THEN
    RAISE EXCEPTION 'CABINET_AUTRE_CABINET: Cette personne appartient déjà à un cabinet.';
  END IF;

  INSERT INTO public.cabinets (nom, max_dossiers, created_by)
  VALUES (btrim(_nom), _max_dossiers, uid)
  RETURNING id INTO nouveau;

  INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif, ajoute_par)
  VALUES (nouveau, _responsable, 'responsable', true, uid);

  RETURN nouveau;
END
$function$;

-- ─── cabinet_definir_membre ─────────────────────────────────────────────────
-- Ajoute un membre ou change son rôle / son état. Responsable actif du
-- cabinet (cabinet actif) ou super-admin. Pour un responsable, un ajout ne
-- vise qu'un compte tout juste créé (CABINET_COMPTE_EXISTANT sinon, avant
-- tout autre refus sur le compte). Refus : super-admin visé, membre d'un
-- autre cabinet, plus aucun responsable actif après le changement, accès
-- direct à une société suivie par ce cabinet (CABINET_ACCES_DIRECT, sauf pour
-- une désactivation), plus de 20 ajouts en 24 heures hors super-admin
-- (CABINET_QUOTA_JOUR, seconde barrière après cabinet_reserver_ajout).
-- Les attributions d'un membre désactivé sont gardées (sans effet tant qu'il
-- est inactif).
CREATE OR REPLACE FUNCTION public.cabinet_definir_membre(_cabinet uuid, _user uuid, _role public.role_cabinet, _actif boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  autre uuid;
  existe boolean;
  est_super boolean;
  ajouts_jour int;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  IF _role IS NULL OR _actif IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le rôle et l''état du membre sont obligatoires.';
  END IF;
  -- Verrou : les changements d'équipe d'un cabinet passent un par un.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  -- Responsable, insertion : un compte tout juste créé (et confirmé), et une
  -- réservation (cabinet_reserver_ajout) du même auteur pour ce cabinet, de
  -- moins de 10 minutes et non encore utilisée, consommée ici (une
  -- réservation, une insertion ; rendue si la fonction échoue ensuite).
  -- Contrôlé avant les refus qui décriraient le compte (un seul code).
  IF NOT est_super
     AND NOT EXISTS (SELECT 1 FROM public.cabinet_membres m
                     WHERE m.user_id = _user AND m.cabinet_id = _cabinet) THEN
    IF NOT private.cabinet_compte_neuf(_user) THEN
      RAISE EXCEPTION 'CABINET_COMPTE_EXISTANT: Impossible d''ajouter ce compte : contactez le super-administrateur.';
    END IF;
    UPDATE public.cabinet_ajouts_tentatives t SET utilisee = true
    WHERE t.id = (SELECT x.id FROM public.cabinet_ajouts_tentatives x
                  WHERE x.cabinet_id = _cabinet AND x.auteur = uid AND NOT x.utilisee
                    AND x.at > now() - interval '10 minutes'
                  ORDER BY x.at
                  LIMIT 1);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CABINET_COMPTE_EXISTANT: Impossible d''ajouter ce compte : contactez le super-administrateur.';
    END IF;
  END IF;
  IF _user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user) THEN
    RAISE EXCEPTION 'CABINET_UTILISATEUR: Utilisateur introuvable.';
  END IF;
  IF private.cabinet_role_super_admin(_user) THEN
    RAISE EXCEPTION 'CABINET_SUPER_ADMIN: Un super-administrateur ne peut pas être membre d''un cabinet.';
  END IF;

  SELECT m.cabinet_id INTO autre FROM public.cabinet_membres m WHERE m.user_id = _user;
  existe := FOUND;
  IF existe AND autre <> _cabinet THEN
    RAISE EXCEPTION 'CABINET_AUTRE_CABINET: Cette personne appartient déjà à un autre cabinet.';
  END IF;

  -- Double accès : la personne a un accès direct à un client de ce cabinet.
  IF _actif AND EXISTS (
       SELECT 1
       FROM public.user_societes us
       JOIN public.cabinet_dossiers d ON d.societe_id = us.societe_id
                                     AND d.cabinet_id = _cabinet
                                     AND d.etat <> 'termine'
       WHERE us.user_id = _user) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Cette personne a déjà un accès direct à un client du cabinet.';
  END IF;

  -- Seconde barrière du quota (24 heures glissantes) : ajouts faits hors
  -- super-admin (ajoute_par nul compris).
  IF NOT existe AND NOT est_super THEN
    SELECT count(*) INTO ajouts_jour
    FROM public.cabinet_membres m
    WHERE m.cabinet_id = _cabinet
      AND m.created_at > now() - interval '24 hours'
      AND NOT coalesce(private.cabinet_role_super_admin(m.ajoute_par), false);
    IF ajouts_jour >= 20 THEN
      RAISE EXCEPTION 'CABINET_QUOTA_JOUR: Vingt membres ont déjà été ajoutés à ce cabinet en 24 heures : réessayez demain.';
    END IF;
  END IF;

  IF existe THEN
    UPDATE public.cabinet_membres m SET role = _role, actif = _actif
    WHERE m.user_id = _user AND m.cabinet_id = _cabinet;
  ELSE
    INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif, ajoute_par)
    VALUES (_cabinet, _user, _role, _actif, uid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cabinet_membres m
                 WHERE m.cabinet_id = _cabinet AND m.role = 'responsable' AND m.actif) THEN
    RAISE EXCEPTION 'CABINET_DERNIER_RESPONSABLE: Le cabinet doit garder au moins un responsable actif.';
  END IF;
END
$function$;

-- ─── cabinet_detacher_membre ────────────────────────────────────────────────
-- Retire un membre du cabinet (ses attributions puis sa ligne) : le compte
-- n'est plus bloqué par cabinet_membres.user_id UNIQUE. Super-admin (aal2) :
-- tout membre. Responsable actif du cabinet : un membre qui ne s'est jamais
-- connecté, pas lui-même (CABINET_DEJA_CONNECTE, CABINET_SOI_MEME). Jamais un
-- responsable actif (CABINET_RESPONSABLE) : changer d'abord son rôle ou le
-- désactiver.
CREATE OR REPLACE FUNCTION public.cabinet_detacher_membre(_cabinet uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  est_super boolean;
  m public.cabinet_membres%ROWTYPE;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  -- Verrou : les changements d'équipe d'un cabinet passent un par un.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  SELECT * INTO m FROM public.cabinet_membres x
  WHERE x.user_id = _user AND x.cabinet_id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_MEMBRE: Cette personne n''est pas membre du cabinet.';
  END IF;
  IF NOT est_super THEN
    IF _user = uid THEN
      RAISE EXCEPTION 'CABINET_SOI_MEME: Un responsable ne se détache pas lui-même du cabinet.';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND u.last_sign_in_at IS NOT NULL) THEN
      RAISE EXCEPTION 'CABINET_DEJA_CONNECTE: Ce membre s''est déjà connecté : désactivez-le, ou demandez au super-administrateur de le détacher.';
    END IF;
  END IF;
  IF m.role = 'responsable' AND m.actif THEN
    RAISE EXCEPTION 'CABINET_RESPONSABLE: Un responsable actif ne se détache pas : changez d''abord son rôle ou désactivez-le.';
  END IF;

  DELETE FROM public.cabinet_attributions a
  USING public.cabinet_dossiers d
  WHERE a.dossier_id = d.id AND d.cabinet_id = _cabinet AND a.user_id = _user;
  DELETE FROM public.cabinet_membres x WHERE x.id = m.id;
  INSERT INTO public.cabinet_membres_detaches (cabinet_id, user_id, role, par)
  VALUES (_cabinet, _user, m.role, uid);
END
$function$;

-- ─── cabinet_creer_dossier ──────────────────────────────────────────────────
-- Responsable actif du cabinet. Crée la société cliente par le même chemin
-- que CreerSocieteModal (super-admin-ops, create_societe) :
--   1. INSERT INTO societes (nom, slug, plan 'starter', statut 'active',
--      created_by) ; le trigger trg_create_societe_config (handle_new_societe)
--      crée societe_config et les deux services intégrés ;
--   2. societe_config : modules du plan starter (DEFAULT_MODULES_BY_PLAN) ;
--   3. aucun compte administrateur, aucune ligne user_societes ni user_roles :
--      le responsable accède à la société au titre du cabinet. Le super-admin
--      invite ensuite l'administrateur du client (cabinet-ops,
--      inviter_admin_client).
--   4. identification minimale, facultative (NULL accepté) : NIF et RCCM
--      dans societes ; forme juridique et première année d'exercice (année
--      de _debut_exercice) dans societe_identification.donnees.
-- Puis le lien actif, origine cabinet, mission tenue_complete.
-- Refus au-delà de max_dossiers liens non terminés : CABINET_LIMITE.
-- Validation : nom 1 à 200 caractères ; NIF 50 au plus ; RCCM 100 au plus ;
-- forme juridique parmi les valeurs de l'écran Identification
-- (FormeJuridique, src/data/identification.repo.ts) ; début d'exercice
-- entre 1900 et 2100. Sinon CABINET_PARAMETRE.
-- Remplace la version à deux paramètres (jamais appliquée en production).
DROP FUNCTION IF EXISTS public.cabinet_creer_dossier(uuid, text);
CREATE OR REPLACE FUNCTION public.cabinet_creer_dossier(
  _cabinet         uuid,
  _nom             text,
  _nif             text DEFAULT NULL,
  _rccm            text DEFAULT NULL,
  _forme_juridique text DEFAULT NULL,
  _debut_exercice  date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  limite int;
  en_cours int;
  societe uuid := gen_random_uuid();
  ident jsonb := '{}'::jsonb;
BEGIN
  IF NOT private.cabinet_responsable_actif(uid, _cabinet) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut créer un dossier client.'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_nom), '') IS NULL OR length(btrim(_nom)) > 200 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le nom de la société cliente est obligatoire (200 caractères au plus).';
  END IF;
  IF length(btrim(_nif)) > 50 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le NIF compte 50 caractères au plus.';
  END IF;
  IF length(btrim(_rccm)) > 100 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le RCCM compte 100 caractères au plus.';
  END IF;
  IF nullif(btrim(_forme_juridique), '') IS NOT NULL
     AND btrim(_forme_juridique) <> ALL (ARRAY['SA_PUBLIQUE', 'SA', 'SARL', 'SCS', 'SNC', 'SP', 'GIE',
                                               'ASSOCIATION', 'SAS', 'EI', 'AUTRE']) THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Forme juridique inconnue.';
  END IF;
  IF _debut_exercice IS NOT NULL
     AND extract(year FROM _debut_exercice) NOT BETWEEN 1900 AND 2100 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Date de début d''exercice invalide.';
  END IF;

  -- Verrou : deux créations simultanées ne dépassent pas la limite.
  SELECT c.max_dossiers INTO limite FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  SELECT count(*) INTO en_cours
  FROM public.cabinet_dossiers d
  WHERE d.cabinet_id = _cabinet AND d.etat <> 'termine';
  IF en_cours >= limite THEN
    RAISE EXCEPTION 'CABINET_LIMITE: Limite de % dossiers atteinte pour ce cabinet.', limite;
  END IF;

  INSERT INTO public.societes (id, nom, slug, plan, statut, created_by, nif, rccm)
  VALUES (societe, btrim(_nom), private.cabinet_slug(_nom, societe), 'starter', 'active', uid,
          coalesce(btrim(_nif), ''), coalesce(btrim(_rccm), ''));

  -- Identification (clés de l'écran Identification).
  IF nullif(btrim(_forme_juridique), '') IS NOT NULL THEN
    ident := ident || jsonb_build_object('formeJuridique', btrim(_forme_juridique));
  END IF;
  IF _debut_exercice IS NOT NULL THEN
    ident := ident || jsonb_build_object('premiereAnnee', extract(year FROM _debut_exercice)::int);
  END IF;
  IF ident <> '{}'::jsonb THEN
    INSERT INTO public.societe_identification (societe_id, donnees)
    VALUES (societe, ident)
    ON CONFLICT (societe_id) DO UPDATE SET donnees = public.societe_identification.donnees || excluded.donnees,
                                           updated_at = now();
  END IF;

  -- Modules du plan starter, comme l'assistant de création.
  UPDATE public.societe_config sc
  SET module_stock = false,
      module_grh = true,
      module_fiscalite = true,
      module_immobilisations = false,
      module_ia = false,
      module_multi_societes = false
  WHERE sc.societe_id = societe;

  INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
  VALUES (_cabinet, societe, 'tenue_complete', 'actif', 'cabinet');

  RETURN societe;
END
$function$;

-- ─── cabinet_rattacher ──────────────────────────────────────────────────────
-- Super-admin. Lien actif, origine super_admin, mission au choix, sans limite
-- de dossiers. Refus : cabinet inactif, société déjà suivie, propre société
-- du cabinet, membre actif du cabinet avec un accès direct à la société
-- (CABINET_ACCES_DIRECT). Rend l'id du lien.
CREATE OR REPLACE FUNCTION public.cabinet_rattacher(_cabinet uuid, _societe uuid, _mission public.mission_cabinet)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  actif_cabinet boolean;
  propre uuid;
  lien uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_admin_general(uid) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-administrateur (session validée par le code 2FA) peut rattacher une société à un cabinet.'
      USING ERRCODE = '42501';
  END IF;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  SELECT c.actif, c.societe_propre_id INTO actif_cabinet, propre
  FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT actif_cabinet THEN
    RAISE EXCEPTION 'CABINET_INACTIF: Ce cabinet est désactivé.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.societes s WHERE s.id = _societe) THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_INTROUVABLE: Société introuvable.';
  END IF;
  IF _societe = propre THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_PROPRE: La propre société du cabinet ne peut pas être un dossier client.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers d WHERE d.societe_id = _societe AND d.etat <> 'termine') THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END IF;
  -- Double accès : un membre actif du cabinet a un accès direct à la société.
  IF EXISTS (SELECT 1
             FROM public.cabinet_membres m
             JOIN public.user_societes us ON us.user_id = m.user_id AND us.societe_id = _societe
             WHERE m.cabinet_id = _cabinet AND m.actif) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Un membre actif du cabinet a déjà un accès direct à cette société.';
  END IF;

  INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
  VALUES (_cabinet, _societe, _mission, 'actif', 'super_admin')
  RETURNING id INTO lien;
  RETURN lien;
END
$function$;

-- ─── cabinet_attribuer ──────────────────────────────────────────────────────
-- Responsable actif du cabinet du dossier. Le membre visé est un collaborateur
-- ou un stagiaire ACTIF du même cabinet ; la mission ne dépasse pas celle du
-- dossier (mission_couvre). Lien terminé : refus. Remplace une attribution
-- existante.
CREATE OR REPLACE FUNCTION public.cabinet_attribuer(_dossier uuid, _user uuid, _mission public.mission_cabinet)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.cabinet_dossiers%ROWTYPE;
  role_membre public.role_cabinet;
BEGIN
  -- Contrôle de l'appelant avant tout verrou (lecture simple), puis verrou :
  -- une attribution et un changement de mission passent un par un.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(uid, d.cabinet_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut attribuer un dossier.'
      USING ERRCODE = '42501';
  END IF;
  -- Le cabinet d'un lien ne change jamais : relecture sous verrou.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  IF d.etat = 'termine' THEN
    RAISE EXCEPTION 'CABINET_DOSSIER_TERMINE: Ce dossier n''est plus suivi par le cabinet.';
  END IF;

  SELECT m.role INTO role_membre
  FROM public.cabinet_membres m
  WHERE m.user_id = _user AND m.cabinet_id = d.cabinet_id AND m.actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_MEMBRE: Cette personne n''est pas un membre actif du cabinet.';
  END IF;
  IF role_membre = 'responsable' THEN
    RAISE EXCEPTION 'CABINET_RESPONSABLE: Un responsable agit déjà dans tous les dossiers du cabinet.';
  END IF;
  IF NOT public.mission_couvre(d.mission, _mission) THEN
    RAISE EXCEPTION 'CABINET_MISSION: La mission attribuée ne peut pas dépasser celle du dossier.';
  END IF;

  INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission)
  VALUES (_dossier, _user, _mission)
  ON CONFLICT (dossier_id, user_id) DO UPDATE SET mission = excluded.mission;
END
$function$;

-- ─── cabinet_retirer_attribution ───────────────────────────────────────────
-- Responsable actif du cabinet du dossier. Sans attribution : rien à faire.
CREATE OR REPLACE FUNCTION public.cabinet_retirer_attribution(_dossier uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  cabinet uuid;
BEGIN
  -- Contrôle de l'appelant avant tout verrou, puis verrou.
  SELECT d.cabinet_id INTO cabinet FROM public.cabinet_dossiers d WHERE d.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(uid, cabinet) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut retirer une attribution.'
      USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.cabinet_dossiers d WHERE d.id = _dossier FOR UPDATE;
  DELETE FROM public.cabinet_attributions a WHERE a.dossier_id = _dossier AND a.user_id = _user;
END
$function$;

-- ─── cabinet_changer_mission ────────────────────────────────────────────────
-- Administrateur du client (cabinet_admin_client) ou super-admin. Tant
-- qu'aucun administrateur client n'est rattaché, seul le super-admin passe.
-- Lien terminé : refus. Les attributions qui dépassent la nouvelle mission
-- sont abaissées, ou supprimées si les missions ne sont pas comparables (voir
-- l'en-tête).
CREATE OR REPLACE FUNCTION public.cabinet_changer_mission(_dossier uuid, _mission public.mission_cabinet)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  -- Contrôle de l'appelant avant tout verrou, puis verrou.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF uid IS NULL
     OR NOT (public.is_admin_general(uid) OR public.cabinet_admin_client(uid, d.societe_id)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur de la société cliente ou le super-administrateur peut changer la mission.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  IF d.etat = 'termine' THEN
    RAISE EXCEPTION 'CABINET_DOSSIER_TERMINE: Ce dossier n''est plus suivi par le cabinet.';
  END IF;

  UPDATE public.cabinet_dossiers x SET mission = _mission WHERE x.id = _dossier;

  -- Attributions non comparables : supprimées.
  DELETE FROM public.cabinet_attributions a
  WHERE a.dossier_id = _dossier
    AND NOT public.mission_couvre(_mission, a.mission)
    AND NOT public.mission_couvre(a.mission, _mission);
  -- Attributions au-dessus : ramenées à la mission du dossier.
  UPDATE public.cabinet_attributions a SET mission = _mission
  WHERE a.dossier_id = _dossier
    AND NOT public.mission_couvre(_mission, a.mission);
END
$function$;

-- ─── mes_dossiers_cabinet ───────────────────────────────────────────────────
-- Les dossiers où l'appelant agit comme cabinet (même règle que les droits,
-- cabinet_liens_internes : lien actif ou depart_demande, cabinet et membre
-- actifs, responsable ou attribué, pas d'accès direct, pas super-admin).
-- mission : celle du dossier pour un responsable, celle de l'attribution pour
-- un collaborateur ou un stagiaire (au plus celle du dossier, voir l'en-tête ;
-- si une écriture directe a rompu cette règle, celle du dossier). Le plafond du stagiaire et la lecture seule en
-- depart_demande se déduisent de mon_role et etat. Sans utilisateur : rien.
CREATE OR REPLACE FUNCTION public.mes_dossiers_cabinet()
RETURNS TABLE (
  societe_id  uuid,
  societe_nom text,
  cabinet_nom text,
  mission     public.mission_cabinet,
  etat        public.etat_dossier_cabinet,
  mon_role    public.role_cabinet)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT l.societe_id,
         s.nom,
         c.nom,
         CASE
           WHEN l.role = 'responsable' OR l.mission_attribution IS NULL THEN l.mission_dossier
           WHEN public.mission_couvre(l.mission_dossier, l.mission_attribution) THEN l.mission_attribution
           ELSE l.mission_dossier
         END,
         l.etat,
         l.role
  FROM public.cabinet_liens_internes(auth.uid()) l
  JOIN public.cabinet_dossiers d ON d.societe_id = l.societe_id
                                AND d.etat IN ('actif', 'depart_demande')
  JOIN public.cabinets c ON c.id = d.cabinet_id
  JOIN public.societes s ON s.id = l.societe_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY s.nom, l.societe_id
$function$;

-- ─── cabinet_collaborateurs_dossier (tâche 9) ──────────────────────────────
-- Pour le bloc « Mon cabinet » du client et l'audit : les membres du cabinet
-- qui ont accès à la société en ce moment (lien actif ou depart_demande,
-- cabinet actif, membre actif ; responsables à la mission du dossier,
-- collaborateurs et stagiaires attribués à la mission de leur attribution).
-- nom : profiles.nom, sinon l'e-mail. Réservée à l'administrateur du client
-- (cabinet_admin_client) et au super-admin : la règle de profiles ne donne
-- pas ces noms à l'administrateur du client.
CREATE OR REPLACE FUNCTION public.cabinet_collaborateurs_dossier(_societe uuid)
RETURNS TABLE (
  user_id uuid,
  nom     text,
  role    public.role_cabinet,
  mission public.mission_cabinet)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL
     OR NOT (public.is_admin_general(uid) OR public.cabinet_admin_client(uid, _societe)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Réservé à l''administrateur de la société cliente.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         coalesce(nullif(btrim(p.nom), ''), p.email, '')::text,
         m.role,
         CASE WHEN m.role = 'responsable' THEN d.mission ELSE a.mission END
  FROM public.cabinet_dossiers d
  JOIN public.cabinets c ON c.id = d.cabinet_id AND c.actif
  JOIN public.cabinet_membres m ON m.cabinet_id = d.cabinet_id AND m.actif
  LEFT JOIN public.cabinet_attributions a ON a.dossier_id = d.id AND a.user_id = m.user_id
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE d.societe_id = _societe
    AND d.etat IN ('actif', 'depart_demande')
    AND (m.role = 'responsable' OR a.user_id IS NOT NULL)
  ORDER BY m.role, 2;
END
$function$;

-- ─── Droits d'exécution ─────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cabinet_creer(text, uuid, int)',
    'public.cabinet_reserver_ajout(uuid)',
    'public.cabinet_definir_membre(uuid, uuid, public.role_cabinet, boolean)',
    'public.cabinet_detacher_membre(uuid, uuid)',
    'public.cabinet_creer_dossier(uuid, text, text, text, text, date)',
    'public.cabinet_rattacher(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_attribuer(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_retirer_attribution(uuid, uuid)',
    'public.cabinet_changer_mission(uuid, public.mission_cabinet)',
    'public.mes_dossiers_cabinet()',
    'public.cabinet_collaborateurs_dossier(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261027124000', 'cabinet_operations', ARRAY[$migration_sql$-- Espace cabinet, étape 1 : opérations sur les cabinets
-- (spec 2026-10-27, § 2, § 4 et § 7 ; plan, tâche 5, et la fonction
-- cabinet_collaborateurs_dossier de la tâche 9, livrée ici).
--
-- Suppose appliquées les migrations 20261027120000 à 20261027123000
-- (tables, cabinet_admin_client, cabinet_liens_internes, schéma private).
-- Aucun lien cabinet n'existe en production : pas de garde de déploiement.
--
-- Fonctions exposées (SECURITY DEFINER, search_path = public, EXECUTE :
-- authenticated et service_role ; chacune contrôle elle-même l'appelant) :
--   * cabinet_creer(nom, responsable, max_dossiers)   super-admin (aal2)
--   * cabinet_reserver_ajout(cabinet)                 responsable du cabinet ou super-admin
--                                                     (quota d'ajouts, appelée par cabinet-ops)
--   * cabinet_definir_membre(cabinet, user, role, actif)
--                                                     responsable du cabinet ou super-admin
--   * cabinet_detacher_membre(cabinet, user)          super-admin, ou responsable pour un
--                                                     membre jamais connecté
--   * cabinet_creer_dossier(cabinet, nom, nif, rccm, forme_juridique, debut_exercice)
--                                                     responsable du cabinet
--   * cabinet_rattacher(cabinet, societe, mission)    super-admin
--   * cabinet_attribuer(dossier, user, mission)       responsable du cabinet du dossier
--   * cabinet_retirer_attribution(dossier, user)      responsable du cabinet du dossier
--   * cabinet_changer_mission(dossier, mission)       administrateur du client
--                                                     (cabinet_admin_client) ou super-admin
--   * mes_dossiers_cabinet()                          l'appelant (ses dossiers)
--   * cabinet_collaborateurs_dossier(societe)         administrateur du client ou super-admin
--   * mission_couvre(haute, basse)                    fonction pure (comme niveau_mission)
--
-- Définitions :
--   * super-admin : public.is_admin_general(auth.uid()), qui exige la session
--     aal2 (20261016120000). Un appel sans utilisateur (auth.uid() nul) n'est
--     jamais super-admin : les fonctions Edge appellent ces fonctions avec le
--     jeton de l'utilisateur, pas avec la clé service_role.
--   * responsable : ligne de cabinet_membres (lue directement) de l'appelant,
--     role 'responsable', actif, dans ce cabinet, cabinet actif.
--   * administrateur du client : public.cabinet_admin_client(auth.uid(), société)
--     uniquement (tâche 1). Avec des rôles globaux, une personne qui a le rôle
--     admin pour une autre société et qui est simplement rattachée
--     (user_societes) à la société cliente passe ce test : elle peut changer
--     la mission (limite connue, plan tâche 5).
--   * « mission A au plus égale à B » (mission_couvre(B, A)) : dans chacun des
--     huit modules, niveau_mission(A) <= niveau_mission(B). Ordre partiel :
--     lecture < declarations < compta_fiscalite < tenue_complete et
--     paie_social < tenue_complete ; paie_social n'est comparable qu'à
--     tenue_complete.
--
-- Choix :
--   * Changer la mission ABAISSE les attributions qui la dépassent : une
--     attribution que la nouvelle mission couvre est gardée ; sinon, si
--     l'attribution couvre la nouvelle mission, elle prend la nouvelle
--     mission ; sinon (missions non comparables, par exemple paie_social
--     contre compta_fiscalite), l'attribution est supprimée : aucune mission
--     ne vaut le minimum des deux, et le responsable réattribue. Ainsi
--     « attribution <= mission du dossier » reste vrai, et
--     mes_dossiers_cabinet() rend une mission exacte. Le calcul des droits
--     (tâche 2) prend de toute façon le minimum : rien ne change pour la base.
--   * La limite max_dossiers (liens non terminés : invitation, actif,
--     depart_demande) ne s'applique qu'à la création par le cabinet. Le
--     rattachement par le super-admin passe outre (décision du super-admin).
--   * cabinet_creer_dossier prend un verrou sur la ligne du cabinet : deux
--     créations simultanées ne dépassent pas la limite. Même verrou pour
--     cabinet_definir_membre (au moins un responsable actif).
--   * Une attribution ne vise qu'un membre ACTIF du même cabinet, collaborateur
--     ou stagiaire (un responsable agit déjà dans tous les dossiers).
--   * Aucune de ces fonctions n'écrit dans user_roles ni user_societes.
--   * Double accès (relecture de sécurité, I3) : cabinet_definir_membre refuse
--     d'ajouter ou d'activer une personne qui a une ligne user_societes sur
--     une société suivie par CE cabinet (lien non terminé) ; cabinet_rattacher
--     refuse une société où un membre actif du cabinet a une ligne
--     user_societes (CABINET_ACCES_DIRECT). Une désactivation reste toujours
--     possible. Le double accès peut encore naître ensuite, par admin-users
--     (l'administrateur du client rattache la personne) : l'écran super-admin
--     le signale (tâche 9).
--   * Quota (I1, puis C1 et M3 de la seconde relecture) : 20 TENTATIVES
--     d'ajout par cabinet sur 24 heures glissantes, abouties ou non. La
--     fonction Edge cabinet-ops appelle cabinet_reserver_ajout AVANT toute
--     recherche de compte : la tentative est enregistrée dans
--     cabinet_ajouts_tentatives (sa propre transaction, gardée même si l'ajout
--     échoue ensuite) ; au-delà, CABINET_QUOTA_JOUR, la même réponse quelle
--     que soit l'adresse (plus de test gratuit de l'existence d'un compte).
--     Seconde barrière dans cabinet_definir_membre : 20 insertions sur
--     24 heures (cabinet_membres.ajoute_par, colonne ajoutée ici). Ni les
--     tentatives ni les ajouts du super-admin ne comptent. La fonction Edge
--     supprime le compte qu'elle vient de créer si la base refuse.
--   * Comptes nouveaux seulement (C2) : pour un appelant qui n'est pas
--     super-admin, une INSERTION dans cabinet_definir_membre (pas la mise à
--     jour d'un membre de son cabinet) exige un compte tout juste créé
--     (private.cabinet_compte_neuf : créé il y a moins de 10 minutes, e-mail
--     confirmé, jamais connecté, ni user_roles, ni user_societes, ni membre
--     d'un cabinet ; un compte d'inscription publique n'est pas confirmé) ET
--     une réservation cabinet_reserver_ajout du même auteur, pour ce
--     cabinet, de moins de 10 minutes, consommée par l'insertion
--     (cabinet_ajouts_tentatives.utilisee) : un appel direct ne contourne
--     plus le quota, et détacher puis réajouter coûte une tentative.
--     Sinon un code unique, CABINET_COMPTE_EXISTANT, contrôlé AVANT les
--     autres refus qui décriraient le compte (UTILISATEUR, SUPER_ADMIN,
--     AUTRE_CABINET, ACCES_DIRECT) : appelée directement, la fonction ne
--     révèle rien de plus que cabinet-ops (qui rend MSG_ADRESSE).
--   * Détacher un membre (I1) : cabinet_detacher_membre supprime ses
--     attributions dans le cabinet puis sa ligne cabinet_membres ; le compte
--     redevient libre. Super-admin : tout membre ; responsable : un membre
--     jamais connecté (auth.users.last_sign_in_at nul), pas lui-même. Un
--     responsable actif ne se détache jamais (changer d'abord son rôle ou le
--     désactiver). Les tentatives d'ajout restent comptées. Trace dans
--     cabinet_membres_detaches (audit_log exige une société, qu'un
--     détachement n'a pas ; pas de trigger d'audit sur les tables cabinet).
--   * Identification à la création d'un dossier (I4) : NIF et RCCM dans
--     societes (nif, rccm) ; forme juridique et première année d'exercice
--     dans societe_identification.donnees (clés formeJuridique et
--     premiereAnnee, celles de l'écran Identification). Il n'existe pas de
--     colonne « date de début d'exercice » : les exercices sont des années
--     civiles (exercices.annee) ; la date fournie donne premiereAnnee.
--
-- Variables PL/pgSQL : jamais homonymes d'une colonne (relecture : nom).
--
-- Erreurs : RAISE EXCEPTION 'CABINET_<CODE>: <texte>' ; ERRCODE 42501 pour un
-- refus lié à l'appelant (CABINET_INTERDIT), P0001 sinon. messageErreur
-- (src/lib/ebene-utils.ts) affiche le texte qui suit « CABINET_<CODE>: ».
-- Migration rejouable.

-- ─── Pure : comparaison de deux missions ───────────────────────────────────
-- Vrai si _basse est au plus égale à _haute dans chacun des huit modules.
-- NULL si l'une des deux est NULL.
CREATE OR REPLACE FUNCTION public.mission_couvre(_haute public.mission_cabinet, _basse public.mission_cabinet)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT CASE WHEN _haute IS NULL OR _basse IS NULL THEN NULL
    ELSE bool_and(public.niveau_mission(_basse, m) <= public.niveau_mission(_haute, m)) END
  FROM unnest(ARRAY['compta', 'fiscalite', 'grh', 'factures', 'stock',
                    'immobilisations', 'parametres', 'dashboard']) AS m
$function$;

REVOKE EXECUTE ON FUNCTION public.mission_couvre(public.mission_cabinet, public.mission_cabinet) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mission_couvre(public.mission_cabinet, public.mission_cabinet) TO authenticated, service_role;

-- ─── Internes (schéma private, propriétaire seulement) ─────────────────────
DO $$
BEGIN
  IF to_regnamespace('private') IS NULL THEN
    RAISE EXCEPTION 'cabinet_operations : schéma private absent (migration 20261027122000 à appliquer avant)';
  END IF;
END $$;

-- Rôle super-admin d'un utilisateur quelconque (texte du rôle, quel que soit
-- le niveau aal ; comme cabinet_liens_internes et trg_bloquer_role_super_admin).
CREATE OR REPLACE FUNCTION private.cabinet_role_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _uid AND r.role::text IN ('admin_general', 'super_admin')
  )
$function$;

-- Responsable actif d'un cabinet actif (lecture directe des tables).
CREATE OR REPLACE FUNCTION private.cabinet_responsable_actif(_uid uuid, _cabinet uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cabinet_membres m
    JOIN public.cabinets c ON c.id = m.cabinet_id AND c.actif
    WHERE m.user_id = _uid
      AND m.cabinet_id = _cabinet
      AND m.actif
      AND m.role = 'responsable'
  )
$function$;

-- Compte tout juste créé (C2) : créé il y a moins de 10 minutes, jamais
-- connecté, sans rôle global ni rattachement à une société, membre d'aucun
-- cabinet. Faux pour un id inconnu ou nul.
CREATE OR REPLACE FUNCTION private.cabinet_compte_neuf(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid
      AND u.created_at > now() - interval '10 minutes'
      AND u.last_sign_in_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _uid)
  AND NOT EXISTS (SELECT 1 FROM public.user_societes us WHERE us.user_id = _uid)
  AND NOT EXISTS (SELECT 1 FROM public.cabinet_membres m WHERE m.user_id = _uid)
$function$;

-- Identifiant d'adresse (slug) unique, à partir du nom, comme slugify()
-- (src/lib/superAdminApi.ts) : minuscules, sans accents, tirets, 60
-- caractères. En cas de doublon, suffixe tiré de l'id de la société.
CREATE OR REPLACE FUNCTION private.cabinet_slug(_nom text, _id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  base text;
  candidat text;
  n int := 0;
BEGIN
  -- Majuscules accentuées traduites aussi : lower() ne les convertit pas
  -- sous toutes les collations.
  base := translate(lower(coalesce(_nom, '')),
                    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
                    'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy');
  base := replace(replace(replace(replace(base, 'œ', 'oe'), 'æ', 'ae'), 'Œ', 'oe'), 'Æ', 'ae');
  base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
  base := btrim(left(base, 60), '-');
  IF base = '' THEN
    base := 'dossier';
  END IF;
  candidat := base;
  WHILE EXISTS (SELECT 1 FROM public.societes s WHERE s.slug = candidat) LOOP
    n := n + 1;
    candidat := btrim(left(base, 50), '-') || '-'
                || left(replace(_id::text, '-', ''), 6) || CASE WHEN n > 1 THEN n::text ELSE '' END;
  END LOOP;
  RETURN candidat;
END
$function$;

REVOKE ALL ON FUNCTION private.cabinet_role_super_admin(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_responsable_actif(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_slug(text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.cabinet_compte_neuf(uuid) FROM public, anon, authenticated;

-- ─── Quota d'ajouts : tentatives et auteur des ajouts (C1, M3) ─────────────
-- Une ligne par tentative d'ajout de membre (cabinet_reserver_ajout), aboutie
-- ou non. Écrite seulement par cabinet_reserver_ajout ; lue par le
-- super-admin.
CREATE TABLE IF NOT EXISTS public.cabinet_ajouts_tentatives (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid        NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  auteur     uuid        NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  -- Vrai une fois consommée par une insertion (cabinet_definir_membre).
  utilisee   boolean     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS cabinet_ajouts_tentatives_cabinet_at_idx
  ON public.cabinet_ajouts_tentatives (cabinet_id, at DESC);

ALTER TABLE public.cabinet_ajouts_tentatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cabinet_ajouts_tentatives FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cabinet_ajouts_tentatives FROM authenticated;
GRANT SELECT ON public.cabinet_ajouts_tentatives TO authenticated;
GRANT ALL ON public.cabinet_ajouts_tentatives TO service_role;

DROP POLICY IF EXISTS cabinet_ajouts_tentatives_select ON public.cabinet_ajouts_tentatives;
CREATE POLICY cabinet_ajouts_tentatives_select ON public.cabinet_ajouts_tentatives FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_general((SELECT auth.uid()))));

-- Auteur d'un ajout de membre : la seconde barrière du quota ne compte pas
-- les ajouts du super-admin. Nul pour les lignes antérieures (comptées).
ALTER TABLE public.cabinet_membres ADD COLUMN IF NOT EXISTS ajoute_par uuid;

-- Trace des détachements (cabinet_detacher_membre) : audit_log exige une
-- société, qu'un détachement n'a pas. Écrite seulement par la fonction ;
-- lue par le super-admin.
CREATE TABLE IF NOT EXISTS public.cabinet_membres_detaches (
  id         uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid                NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  user_id    uuid                NOT NULL,
  role       public.role_cabinet NOT NULL,
  par        uuid                NOT NULL,
  at         timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cabinet_membres_detaches_cabinet_idx
  ON public.cabinet_membres_detaches (cabinet_id, at DESC);

ALTER TABLE public.cabinet_membres_detaches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cabinet_membres_detaches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.cabinet_membres_detaches FROM authenticated;
GRANT SELECT ON public.cabinet_membres_detaches TO authenticated;
GRANT ALL ON public.cabinet_membres_detaches TO service_role;

DROP POLICY IF EXISTS cabinet_membres_detaches_select ON public.cabinet_membres_detaches;
CREATE POLICY cabinet_membres_detaches_select ON public.cabinet_membres_detaches FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_general((SELECT auth.uid()))));

-- ─── cabinet_reserver_ajout ─────────────────────────────────────────────────
-- Responsable actif du cabinet (cabinet actif) ou super-admin (aal2). Appelée
-- par cabinet-ops (jeton de l'appelant) AVANT toute recherche de compte.
-- Verrou sur la ligne du cabinet ; hors super-admin, 20 tentatives au plus
-- sur 24 heures glissantes (CABINET_QUOTA_JOUR), sinon la tentative est
-- enregistrée. Les tentatives du super-admin sont enregistrées sans compter.
CREATE OR REPLACE FUNCTION public.cabinet_reserver_ajout(_cabinet uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  est_super boolean;
  tentatives int;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  -- Verrou : deux tentatives simultanées ne dépassent pas le quota.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT est_super THEN
    SELECT count(*) INTO tentatives
    FROM public.cabinet_ajouts_tentatives t
    WHERE t.cabinet_id = _cabinet
      AND t.at > now() - interval '24 hours'
      AND NOT private.cabinet_role_super_admin(t.auteur);
    IF tentatives >= 20 THEN
      RAISE EXCEPTION 'CABINET_QUOTA_JOUR: Vingt ajouts ont déjà été tentés pour ce cabinet en 24 heures : réessayez demain.';
    END IF;
  END IF;
  INSERT INTO public.cabinet_ajouts_tentatives (cabinet_id, auteur) VALUES (_cabinet, uid);
END
$function$;

-- ─── cabinet_creer ──────────────────────────────────────────────────────────
-- Super-admin (aal2). Crée le cabinet et son premier responsable (compte
-- existant, ni super-admin, ni membre d'un autre cabinet).
CREATE OR REPLACE FUNCTION public.cabinet_creer(_nom text, _responsable uuid, _max_dossiers int DEFAULT 10)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  nouveau uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_admin_general(uid) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-administrateur (session validée par le code 2FA) peut créer un cabinet.'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_nom), '') IS NULL OR length(btrim(_nom)) > 200 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le nom du cabinet est obligatoire (200 caractères au plus).';
  END IF;
  IF _max_dossiers IS NULL OR _max_dossiers < 0 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La limite de dossiers doit être un nombre positif ou nul.';
  END IF;
  IF _responsable IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _responsable) THEN
    RAISE EXCEPTION 'CABINET_UTILISATEUR: Responsable introuvable : créez d''abord son compte.';
  END IF;
  IF private.cabinet_role_super_admin(_responsable) THEN
    RAISE EXCEPTION 'CABINET_SUPER_ADMIN: Un super-administrateur ne peut pas être membre d''un cabinet.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_membres m WHERE m.user_id = _responsable) THEN
    RAISE EXCEPTION 'CABINET_AUTRE_CABINET: Cette personne appartient déjà à un cabinet.';
  END IF;

  INSERT INTO public.cabinets (nom, max_dossiers, created_by)
  VALUES (btrim(_nom), _max_dossiers, uid)
  RETURNING id INTO nouveau;

  INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif, ajoute_par)
  VALUES (nouveau, _responsable, 'responsable', true, uid);

  RETURN nouveau;
END
$function$;

-- ─── cabinet_definir_membre ─────────────────────────────────────────────────
-- Ajoute un membre ou change son rôle / son état. Responsable actif du
-- cabinet (cabinet actif) ou super-admin. Pour un responsable, un ajout ne
-- vise qu'un compte tout juste créé (CABINET_COMPTE_EXISTANT sinon, avant
-- tout autre refus sur le compte). Refus : super-admin visé, membre d'un
-- autre cabinet, plus aucun responsable actif après le changement, accès
-- direct à une société suivie par ce cabinet (CABINET_ACCES_DIRECT, sauf pour
-- une désactivation), plus de 20 ajouts en 24 heures hors super-admin
-- (CABINET_QUOTA_JOUR, seconde barrière après cabinet_reserver_ajout).
-- Les attributions d'un membre désactivé sont gardées (sans effet tant qu'il
-- est inactif).
CREATE OR REPLACE FUNCTION public.cabinet_definir_membre(_cabinet uuid, _user uuid, _role public.role_cabinet, _actif boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  autre uuid;
  existe boolean;
  est_super boolean;
  ajouts_jour int;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  IF _role IS NULL OR _actif IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le rôle et l''état du membre sont obligatoires.';
  END IF;
  -- Verrou : les changements d'équipe d'un cabinet passent un par un.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  -- Responsable, insertion : un compte tout juste créé (et confirmé), et une
  -- réservation (cabinet_reserver_ajout) du même auteur pour ce cabinet, de
  -- moins de 10 minutes et non encore utilisée, consommée ici (une
  -- réservation, une insertion ; rendue si la fonction échoue ensuite).
  -- Contrôlé avant les refus qui décriraient le compte (un seul code).
  IF NOT est_super
     AND NOT EXISTS (SELECT 1 FROM public.cabinet_membres m
                     WHERE m.user_id = _user AND m.cabinet_id = _cabinet) THEN
    IF NOT private.cabinet_compte_neuf(_user) THEN
      RAISE EXCEPTION 'CABINET_COMPTE_EXISTANT: Impossible d''ajouter ce compte : contactez le super-administrateur.';
    END IF;
    UPDATE public.cabinet_ajouts_tentatives t SET utilisee = true
    WHERE t.id = (SELECT x.id FROM public.cabinet_ajouts_tentatives x
                  WHERE x.cabinet_id = _cabinet AND x.auteur = uid AND NOT x.utilisee
                    AND x.at > now() - interval '10 minutes'
                  ORDER BY x.at
                  LIMIT 1);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CABINET_COMPTE_EXISTANT: Impossible d''ajouter ce compte : contactez le super-administrateur.';
    END IF;
  END IF;
  IF _user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user) THEN
    RAISE EXCEPTION 'CABINET_UTILISATEUR: Utilisateur introuvable.';
  END IF;
  IF private.cabinet_role_super_admin(_user) THEN
    RAISE EXCEPTION 'CABINET_SUPER_ADMIN: Un super-administrateur ne peut pas être membre d''un cabinet.';
  END IF;

  SELECT m.cabinet_id INTO autre FROM public.cabinet_membres m WHERE m.user_id = _user;
  existe := FOUND;
  IF existe AND autre <> _cabinet THEN
    RAISE EXCEPTION 'CABINET_AUTRE_CABINET: Cette personne appartient déjà à un autre cabinet.';
  END IF;

  -- Double accès : la personne a un accès direct à un client de ce cabinet.
  IF _actif AND EXISTS (
       SELECT 1
       FROM public.user_societes us
       JOIN public.cabinet_dossiers d ON d.societe_id = us.societe_id
                                     AND d.cabinet_id = _cabinet
                                     AND d.etat <> 'termine'
       WHERE us.user_id = _user) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Cette personne a déjà un accès direct à un client du cabinet.';
  END IF;

  -- Seconde barrière du quota (24 heures glissantes) : ajouts faits hors
  -- super-admin (ajoute_par nul compris).
  IF NOT existe AND NOT est_super THEN
    SELECT count(*) INTO ajouts_jour
    FROM public.cabinet_membres m
    WHERE m.cabinet_id = _cabinet
      AND m.created_at > now() - interval '24 hours'
      AND NOT coalesce(private.cabinet_role_super_admin(m.ajoute_par), false);
    IF ajouts_jour >= 20 THEN
      RAISE EXCEPTION 'CABINET_QUOTA_JOUR: Vingt membres ont déjà été ajoutés à ce cabinet en 24 heures : réessayez demain.';
    END IF;
  END IF;

  IF existe THEN
    UPDATE public.cabinet_membres m SET role = _role, actif = _actif
    WHERE m.user_id = _user AND m.cabinet_id = _cabinet;
  ELSE
    INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif, ajoute_par)
    VALUES (_cabinet, _user, _role, _actif, uid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cabinet_membres m
                 WHERE m.cabinet_id = _cabinet AND m.role = 'responsable' AND m.actif) THEN
    RAISE EXCEPTION 'CABINET_DERNIER_RESPONSABLE: Le cabinet doit garder au moins un responsable actif.';
  END IF;
END
$function$;

-- ─── cabinet_detacher_membre ────────────────────────────────────────────────
-- Retire un membre du cabinet (ses attributions puis sa ligne) : le compte
-- n'est plus bloqué par cabinet_membres.user_id UNIQUE. Super-admin (aal2) :
-- tout membre. Responsable actif du cabinet : un membre qui ne s'est jamais
-- connecté, pas lui-même (CABINET_DEJA_CONNECTE, CABINET_SOI_MEME). Jamais un
-- responsable actif (CABINET_RESPONSABLE) : changer d'abord son rôle ou le
-- désactiver.
CREATE OR REPLACE FUNCTION public.cabinet_detacher_membre(_cabinet uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  est_super boolean;
  m public.cabinet_membres%ROWTYPE;
BEGIN
  est_super := uid IS NOT NULL AND public.is_admin_general(uid);
  IF uid IS NULL
     OR NOT (est_super OR private.cabinet_responsable_actif(uid, _cabinet)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut gérer son équipe.'
      USING ERRCODE = '42501';
  END IF;
  -- Verrou : les changements d'équipe d'un cabinet passent un par un.
  PERFORM 1 FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  SELECT * INTO m FROM public.cabinet_membres x
  WHERE x.user_id = _user AND x.cabinet_id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_MEMBRE: Cette personne n''est pas membre du cabinet.';
  END IF;
  IF NOT est_super THEN
    IF _user = uid THEN
      RAISE EXCEPTION 'CABINET_SOI_MEME: Un responsable ne se détache pas lui-même du cabinet.';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user AND u.last_sign_in_at IS NOT NULL) THEN
      RAISE EXCEPTION 'CABINET_DEJA_CONNECTE: Ce membre s''est déjà connecté : désactivez-le, ou demandez au super-administrateur de le détacher.';
    END IF;
  END IF;
  IF m.role = 'responsable' AND m.actif THEN
    RAISE EXCEPTION 'CABINET_RESPONSABLE: Un responsable actif ne se détache pas : changez d''abord son rôle ou désactivez-le.';
  END IF;

  DELETE FROM public.cabinet_attributions a
  USING public.cabinet_dossiers d
  WHERE a.dossier_id = d.id AND d.cabinet_id = _cabinet AND a.user_id = _user;
  DELETE FROM public.cabinet_membres x WHERE x.id = m.id;
  INSERT INTO public.cabinet_membres_detaches (cabinet_id, user_id, role, par)
  VALUES (_cabinet, _user, m.role, uid);
END
$function$;

-- ─── cabinet_creer_dossier ──────────────────────────────────────────────────
-- Responsable actif du cabinet. Crée la société cliente par le même chemin
-- que CreerSocieteModal (super-admin-ops, create_societe) :
--   1. INSERT INTO societes (nom, slug, plan 'starter', statut 'active',
--      created_by) ; le trigger trg_create_societe_config (handle_new_societe)
--      crée societe_config et les deux services intégrés ;
--   2. societe_config : modules du plan starter (DEFAULT_MODULES_BY_PLAN) ;
--   3. aucun compte administrateur, aucune ligne user_societes ni user_roles :
--      le responsable accède à la société au titre du cabinet. Le super-admin
--      invite ensuite l'administrateur du client (cabinet-ops,
--      inviter_admin_client).
--   4. identification minimale, facultative (NULL accepté) : NIF et RCCM
--      dans societes ; forme juridique et première année d'exercice (année
--      de _debut_exercice) dans societe_identification.donnees.
-- Puis le lien actif, origine cabinet, mission tenue_complete.
-- Refus au-delà de max_dossiers liens non terminés : CABINET_LIMITE.
-- Validation : nom 1 à 200 caractères ; NIF 50 au plus ; RCCM 100 au plus ;
-- forme juridique parmi les valeurs de l'écran Identification
-- (FormeJuridique, src/data/identification.repo.ts) ; début d'exercice
-- entre 1900 et 2100. Sinon CABINET_PARAMETRE.
-- Remplace la version à deux paramètres (jamais appliquée en production).
DROP FUNCTION IF EXISTS public.cabinet_creer_dossier(uuid, text);
CREATE OR REPLACE FUNCTION public.cabinet_creer_dossier(
  _cabinet         uuid,
  _nom             text,
  _nif             text DEFAULT NULL,
  _rccm            text DEFAULT NULL,
  _forme_juridique text DEFAULT NULL,
  _debut_exercice  date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  limite int;
  en_cours int;
  societe uuid := gen_random_uuid();
  ident jsonb := '{}'::jsonb;
BEGIN
  IF NOT private.cabinet_responsable_actif(uid, _cabinet) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut créer un dossier client.'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_nom), '') IS NULL OR length(btrim(_nom)) > 200 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le nom de la société cliente est obligatoire (200 caractères au plus).';
  END IF;
  IF length(btrim(_nif)) > 50 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le NIF compte 50 caractères au plus.';
  END IF;
  IF length(btrim(_rccm)) > 100 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Le RCCM compte 100 caractères au plus.';
  END IF;
  IF nullif(btrim(_forme_juridique), '') IS NOT NULL
     AND btrim(_forme_juridique) <> ALL (ARRAY['SA_PUBLIQUE', 'SA', 'SARL', 'SCS', 'SNC', 'SP', 'GIE',
                                               'ASSOCIATION', 'SAS', 'EI', 'AUTRE']) THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Forme juridique inconnue.';
  END IF;
  IF _debut_exercice IS NOT NULL
     AND extract(year FROM _debut_exercice) NOT BETWEEN 1900 AND 2100 THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: Date de début d''exercice invalide.';
  END IF;

  -- Verrou : deux créations simultanées ne dépassent pas la limite.
  SELECT c.max_dossiers INTO limite FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  SELECT count(*) INTO en_cours
  FROM public.cabinet_dossiers d
  WHERE d.cabinet_id = _cabinet AND d.etat <> 'termine';
  IF en_cours >= limite THEN
    RAISE EXCEPTION 'CABINET_LIMITE: Limite de % dossiers atteinte pour ce cabinet.', limite;
  END IF;

  INSERT INTO public.societes (id, nom, slug, plan, statut, created_by, nif, rccm)
  VALUES (societe, btrim(_nom), private.cabinet_slug(_nom, societe), 'starter', 'active', uid,
          coalesce(btrim(_nif), ''), coalesce(btrim(_rccm), ''));

  -- Identification (clés de l'écran Identification).
  IF nullif(btrim(_forme_juridique), '') IS NOT NULL THEN
    ident := ident || jsonb_build_object('formeJuridique', btrim(_forme_juridique));
  END IF;
  IF _debut_exercice IS NOT NULL THEN
    ident := ident || jsonb_build_object('premiereAnnee', extract(year FROM _debut_exercice)::int);
  END IF;
  IF ident <> '{}'::jsonb THEN
    INSERT INTO public.societe_identification (societe_id, donnees)
    VALUES (societe, ident)
    ON CONFLICT (societe_id) DO UPDATE SET donnees = public.societe_identification.donnees || excluded.donnees,
                                           updated_at = now();
  END IF;

  -- Modules du plan starter, comme l'assistant de création.
  UPDATE public.societe_config sc
  SET module_stock = false,
      module_grh = true,
      module_fiscalite = true,
      module_immobilisations = false,
      module_ia = false,
      module_multi_societes = false
  WHERE sc.societe_id = societe;

  INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
  VALUES (_cabinet, societe, 'tenue_complete', 'actif', 'cabinet');

  RETURN societe;
END
$function$;

-- ─── cabinet_rattacher ──────────────────────────────────────────────────────
-- Super-admin. Lien actif, origine super_admin, mission au choix, sans limite
-- de dossiers. Refus : cabinet inactif, société déjà suivie, propre société
-- du cabinet, membre actif du cabinet avec un accès direct à la société
-- (CABINET_ACCES_DIRECT). Rend l'id du lien.
CREATE OR REPLACE FUNCTION public.cabinet_rattacher(_cabinet uuid, _societe uuid, _mission public.mission_cabinet)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  actif_cabinet boolean;
  propre uuid;
  lien uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_admin_general(uid) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul le super-administrateur (session validée par le code 2FA) peut rattacher une société à un cabinet.'
      USING ERRCODE = '42501';
  END IF;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  SELECT c.actif, c.societe_propre_id INTO actif_cabinet, propre
  FROM public.cabinets c WHERE c.id = _cabinet FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Cabinet introuvable.';
  END IF;
  IF NOT actif_cabinet THEN
    RAISE EXCEPTION 'CABINET_INACTIF: Ce cabinet est désactivé.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.societes s WHERE s.id = _societe) THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_INTROUVABLE: Société introuvable.';
  END IF;
  IF _societe = propre THEN
    RAISE EXCEPTION 'CABINET_SOCIETE_PROPRE: La propre société du cabinet ne peut pas être un dossier client.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cabinet_dossiers d WHERE d.societe_id = _societe AND d.etat <> 'termine') THEN
    RAISE EXCEPTION 'CABINET_DEJA_LIE: Cette société est déjà suivie par un cabinet.';
  END IF;
  -- Double accès : un membre actif du cabinet a un accès direct à la société.
  IF EXISTS (SELECT 1
             FROM public.cabinet_membres m
             JOIN public.user_societes us ON us.user_id = m.user_id AND us.societe_id = _societe
             WHERE m.cabinet_id = _cabinet AND m.actif) THEN
    RAISE EXCEPTION 'CABINET_ACCES_DIRECT: Un membre actif du cabinet a déjà un accès direct à cette société.';
  END IF;

  INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
  VALUES (_cabinet, _societe, _mission, 'actif', 'super_admin')
  RETURNING id INTO lien;
  RETURN lien;
END
$function$;

-- ─── cabinet_attribuer ──────────────────────────────────────────────────────
-- Responsable actif du cabinet du dossier. Le membre visé est un collaborateur
-- ou un stagiaire ACTIF du même cabinet ; la mission ne dépasse pas celle du
-- dossier (mission_couvre). Lien terminé : refus. Remplace une attribution
-- existante.
CREATE OR REPLACE FUNCTION public.cabinet_attribuer(_dossier uuid, _user uuid, _mission public.mission_cabinet)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.cabinet_dossiers%ROWTYPE;
  role_membre public.role_cabinet;
BEGIN
  -- Contrôle de l'appelant avant tout verrou (lecture simple), puis verrou :
  -- une attribution et un changement de mission passent un par un.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(uid, d.cabinet_id) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut attribuer un dossier.'
      USING ERRCODE = '42501';
  END IF;
  -- Le cabinet d'un lien ne change jamais : relecture sous verrou.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  IF d.etat = 'termine' THEN
    RAISE EXCEPTION 'CABINET_DOSSIER_TERMINE: Ce dossier n''est plus suivi par le cabinet.';
  END IF;

  SELECT m.role INTO role_membre
  FROM public.cabinet_membres m
  WHERE m.user_id = _user AND m.cabinet_id = d.cabinet_id AND m.actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_MEMBRE: Cette personne n''est pas un membre actif du cabinet.';
  END IF;
  IF role_membre = 'responsable' THEN
    RAISE EXCEPTION 'CABINET_RESPONSABLE: Un responsable agit déjà dans tous les dossiers du cabinet.';
  END IF;
  IF NOT public.mission_couvre(d.mission, _mission) THEN
    RAISE EXCEPTION 'CABINET_MISSION: La mission attribuée ne peut pas dépasser celle du dossier.';
  END IF;

  INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission)
  VALUES (_dossier, _user, _mission)
  ON CONFLICT (dossier_id, user_id) DO UPDATE SET mission = excluded.mission;
END
$function$;

-- ─── cabinet_retirer_attribution ───────────────────────────────────────────
-- Responsable actif du cabinet du dossier. Sans attribution : rien à faire.
CREATE OR REPLACE FUNCTION public.cabinet_retirer_attribution(_dossier uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  cabinet uuid;
BEGIN
  -- Contrôle de l'appelant avant tout verrou, puis verrou.
  SELECT d.cabinet_id INTO cabinet FROM public.cabinet_dossiers d WHERE d.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF NOT private.cabinet_responsable_actif(uid, cabinet) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul un responsable du cabinet peut retirer une attribution.'
      USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.cabinet_dossiers d WHERE d.id = _dossier FOR UPDATE;
  DELETE FROM public.cabinet_attributions a WHERE a.dossier_id = _dossier AND a.user_id = _user;
END
$function$;

-- ─── cabinet_changer_mission ────────────────────────────────────────────────
-- Administrateur du client (cabinet_admin_client) ou super-admin. Tant
-- qu'aucun administrateur client n'est rattaché, seul le super-admin passe.
-- Lien terminé : refus. Les attributions qui dépassent la nouvelle mission
-- sont abaissées, ou supprimées si les missions ne sont pas comparables (voir
-- l'en-tête).
CREATE OR REPLACE FUNCTION public.cabinet_changer_mission(_dossier uuid, _mission public.mission_cabinet)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.cabinet_dossiers%ROWTYPE;
BEGIN
  -- Contrôle de l'appelant avant tout verrou, puis verrou.
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CABINET_INTROUVABLE: Dossier introuvable.';
  END IF;
  IF uid IS NULL
     OR NOT (public.is_admin_general(uid) OR public.cabinet_admin_client(uid, d.societe_id)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Seul l''administrateur de la société cliente ou le super-administrateur peut changer la mission.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.cabinet_dossiers x WHERE x.id = _dossier FOR UPDATE;
  IF _mission IS NULL THEN
    RAISE EXCEPTION 'CABINET_PARAMETRE: La mission est obligatoire.';
  END IF;
  IF d.etat = 'termine' THEN
    RAISE EXCEPTION 'CABINET_DOSSIER_TERMINE: Ce dossier n''est plus suivi par le cabinet.';
  END IF;

  UPDATE public.cabinet_dossiers x SET mission = _mission WHERE x.id = _dossier;

  -- Attributions non comparables : supprimées.
  DELETE FROM public.cabinet_attributions a
  WHERE a.dossier_id = _dossier
    AND NOT public.mission_couvre(_mission, a.mission)
    AND NOT public.mission_couvre(a.mission, _mission);
  -- Attributions au-dessus : ramenées à la mission du dossier.
  UPDATE public.cabinet_attributions a SET mission = _mission
  WHERE a.dossier_id = _dossier
    AND NOT public.mission_couvre(_mission, a.mission);
END
$function$;

-- ─── mes_dossiers_cabinet ───────────────────────────────────────────────────
-- Les dossiers où l'appelant agit comme cabinet (même règle que les droits,
-- cabinet_liens_internes : lien actif ou depart_demande, cabinet et membre
-- actifs, responsable ou attribué, pas d'accès direct, pas super-admin).
-- mission : celle du dossier pour un responsable, celle de l'attribution pour
-- un collaborateur ou un stagiaire (au plus celle du dossier, voir l'en-tête ;
-- si une écriture directe a rompu cette règle, celle du dossier). Le plafond du stagiaire et la lecture seule en
-- depart_demande se déduisent de mon_role et etat. Sans utilisateur : rien.
CREATE OR REPLACE FUNCTION public.mes_dossiers_cabinet()
RETURNS TABLE (
  societe_id  uuid,
  societe_nom text,
  cabinet_nom text,
  mission     public.mission_cabinet,
  etat        public.etat_dossier_cabinet,
  mon_role    public.role_cabinet)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT l.societe_id,
         s.nom,
         c.nom,
         CASE
           WHEN l.role = 'responsable' OR l.mission_attribution IS NULL THEN l.mission_dossier
           WHEN public.mission_couvre(l.mission_dossier, l.mission_attribution) THEN l.mission_attribution
           ELSE l.mission_dossier
         END,
         l.etat,
         l.role
  FROM public.cabinet_liens_internes(auth.uid()) l
  JOIN public.cabinet_dossiers d ON d.societe_id = l.societe_id
                                AND d.etat IN ('actif', 'depart_demande')
  JOIN public.cabinets c ON c.id = d.cabinet_id
  JOIN public.societes s ON s.id = l.societe_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY s.nom, l.societe_id
$function$;

-- ─── cabinet_collaborateurs_dossier (tâche 9) ──────────────────────────────
-- Pour le bloc « Mon cabinet » du client et l'audit : les membres du cabinet
-- qui ont accès à la société en ce moment (lien actif ou depart_demande,
-- cabinet actif, membre actif ; responsables à la mission du dossier,
-- collaborateurs et stagiaires attribués à la mission de leur attribution).
-- nom : profiles.nom, sinon l'e-mail. Réservée à l'administrateur du client
-- (cabinet_admin_client) et au super-admin : la règle de profiles ne donne
-- pas ces noms à l'administrateur du client.
CREATE OR REPLACE FUNCTION public.cabinet_collaborateurs_dossier(_societe uuid)
RETURNS TABLE (
  user_id uuid,
  nom     text,
  role    public.role_cabinet,
  mission public.mission_cabinet)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL
     OR NOT (public.is_admin_general(uid) OR public.cabinet_admin_client(uid, _societe)) THEN
    RAISE EXCEPTION 'CABINET_INTERDIT: Réservé à l''administrateur de la société cliente.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         coalesce(nullif(btrim(p.nom), ''), p.email, '')::text,
         m.role,
         CASE WHEN m.role = 'responsable' THEN d.mission ELSE a.mission END
  FROM public.cabinet_dossiers d
  JOIN public.cabinets c ON c.id = d.cabinet_id AND c.actif
  JOIN public.cabinet_membres m ON m.cabinet_id = d.cabinet_id AND m.actif
  LEFT JOIN public.cabinet_attributions a ON a.dossier_id = d.id AND a.user_id = m.user_id
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE d.societe_id = _societe
    AND d.etat IN ('actif', 'depart_demande')
    AND (m.role = 'responsable' OR a.user_id IS NOT NULL)
  ORDER BY m.role, 2;
END
$function$;

-- ─── Droits d'exécution ─────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cabinet_creer(text, uuid, int)',
    'public.cabinet_reserver_ajout(uuid)',
    'public.cabinet_definir_membre(uuid, uuid, public.role_cabinet, boolean)',
    'public.cabinet_detacher_membre(uuid, uuid)',
    'public.cabinet_creer_dossier(uuid, text, text, text, text, date)',
    'public.cabinet_rattacher(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_attribuer(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_retirer_attribution(uuid, uuid)',
    'public.cabinet_changer_mission(uuid, public.mission_cabinet)',
    'public.mes_dossiers_cabinet()',
    'public.cabinet_collaborateurs_dossier(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
$migration_sql$])
ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
