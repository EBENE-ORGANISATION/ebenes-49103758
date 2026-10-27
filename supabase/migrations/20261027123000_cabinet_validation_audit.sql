-- Espace cabinet, étape 1 : validation à quatre yeux et audit signé
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
