BEGIN;
-- debut test
-- Test de la tâche 4 (espace cabinet) : validation à quatre yeux, exercices
-- clos, cree_par non falsifiable, audit signé (et non falsifiable par une
-- insertion directe), validation et paiement des bulletins de paie par un
-- cabinet, lignes validées non modifiables sous le niveau 3, non-régression
-- d'une société sans cabinet.
-- Suppose appliquées juste avant les migrations 20261027120000_cabinet_schema.sql,
-- 20261027121000_cabinet_droits.sql, 20261027122000_cabinet_regles_acces.sql
-- et 20261027123000_cabinet_validation_audit.sql.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-cab4-) :
--   utilisateurs  …-0000-0000000000NN
--     01 R1 responsable cabinet 1, rôle global admin, rattaché (user_societes)
--        à S, la propre société du cabinet 1
--     02 C1 collaborateur cabinet 1 : tenue_complete sur A
--     03 C2 collaborateur cabinet 1 : tenue_complete sur A
--     04 stagiaire cabinet 1 : tenue_complete sur A
--     05 P1 collaborateur cabinet 1 : paie_social sur A (grh 3, compta 1)
--     07 administrateur direct de A (rôle admin), sans cabinet
--     08 CPT membre comptable de D (rôle membre_compta), sans cabinet
--     09 CHEF chef comptable de D (rôle chef_compta), sans cabinet
--   sociétés      …-0001-0000000000NN : 01 A, 04 S (propre société du cabinet 1),
--                 05 D (société sans cabinet)
--   cabinets      …-0002-0000000000NN : 01 cabinet 1 (société propre S),
--                 02 cabinet 2 (sans membre : sert de valeur forgée)
--   lien          …-0003-000000000001 : A–cabinet 1, tenue_complete, actif
--   exercices     A 2024 clos, S 2024 clos, D 2024 clos
-- Les pièces sont saisies en 2026 (exercice non clos), marquées « CAB4 ».
--
-- Les actions passent par pg_temp.cab4_executer(uid, sql), appelée en
-- postgres : elle prend la session de l'utilisateur (SET LOCAL ROLE
-- authenticated et request.jwt.claims), exécute la requête, revient en
-- postgres et rend « ok:<lignes> » ou « <SQLSTATE> <message> ». Une requête
-- acceptée reste en base (jusqu'au ROLLBACK final) ; une requête refusée est
-- annulée.

-- ─── Structure ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'public.audit_log'::regclass
                   AND attname = 'cabinet_id' AND NOT attisdropped),
    'audit_log.cabinet_id absente';
  -- trg_exercices_reouverture : BEFORE UPDATE OR DELETE.
  ASSERT (SELECT (tgtype & 2) <> 0 AND (tgtype & 16) <> 0 AND (tgtype & 8) <> 0
          FROM pg_trigger
          WHERE tgrelid = 'public.exercices'::regclass AND tgname = 'trg_exercices_reouverture'),
    'trg_exercices_reouverture : attendu BEFORE UPDATE OR DELETE';
  -- trg_cree_par (BEFORE INSERT) sur chaque table à quatre yeux.
  FOREACH t IN ARRAY ARRAY['absences', 'ecritures_comptables', 'employes', 'factures',
                           'heures_sup', 'primes', 'sanctions', 'transactions'] LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgrelid = format('public.%I', t)::regclass AND tgname = 'trg_cree_par'
                     AND (tgtype & 2) <> 0 AND (tgtype & 4) <> 0),
      format('trg_cree_par absent ou mal posé sur %s', t);
    ASSERT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgrelid = format('public.%I', t)::regclass AND tgname = 'trg_quatre_yeux'),
      format('trg_quatre_yeux absent sur %s', t);
  END LOOP;
  -- Fonctions trigger : pas d'exécution par l'API.
  ASSERT NOT has_function_privilege('anon', 'public.controle_quatre_yeux()', 'EXECUTE'),
    'controle_quatre_yeux exécutable par anon';
  ASSERT NOT has_function_privilege('anon', 'public.controle_reouverture_exercice()', 'EXECUTE'),
    'controle_reouverture_exercice exécutable par anon';
  ASSERT NOT has_function_privilege('authenticated', 'public.forcer_cree_par()', 'EXECUTE'),
    'forcer_cree_par exécutable par authenticated';
  ASSERT NOT has_function_privilege('authenticated', 'public.audit_trigger_fn()', 'EXECUTE'),
    'audit_trigger_fn exécutable par authenticated';
  -- Bulletins de paie et audit_log : triggers BEFORE UPDATE / BEFORE INSERT.
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.bulletins_paie'::regclass
                   AND tgname = 'trg_bulletins_validation_cabinet'
                   AND (tgtype & 2) <> 0 AND (tgtype & 4) <> 0 AND (tgtype & 16) <> 0),
    'trg_bulletins_validation_cabinet : attendu BEFORE INSERT OR UPDATE';
  FOREACH t IN ARRAY ARRAY['ecritures_comptables', 'bulletins_paie'] LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgrelid = format('public.%I', t)::regclass
                     AND tgname = 'trg_ligne_validee_cabinet'
                     AND (tgtype & 2) <> 0 AND (tgtype & 16) <> 0),
      format('trg_ligne_validee_cabinet absent ou mal posé sur %s', t);
  END LOOP;
  -- private.cabinet_signature : SECURITY DEFINER, fermée aux rôles client.
  ASSERT (SELECT prosecdef FROM pg_proc
          WHERE oid = 'private.cabinet_signature(uuid, uuid)'::regprocedure),
    'cabinet_signature : attendu SECURITY DEFINER';
  ASSERT NOT has_function_privilege('authenticated', 'private.cabinet_signature(uuid, uuid)', 'EXECUTE'),
    'cabinet_signature exécutable par authenticated';
  ASSERT NOT has_function_privilege('anon', 'private.cabinet_signature(uuid, uuid)', 'EXECUTE'),
    'cabinet_signature exécutable par anon';
  ASSERT (SELECT prosecdef FROM pg_proc
          WHERE oid = 'public.audit_log_cabinet_client()'::regprocedure),
    'audit_log_cabinet_client : attendu SECURITY DEFINER';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.audit_log'::regclass
                   AND tgname = 'trg_audit_log_cabinet_client'
                   AND (tgtype & 2) <> 0 AND (tgtype & 4) <> 0),
    'trg_audit_log_cabinet_client absent ou mal posé';
  -- audit_trigger_fn : SECURITY DEFINER, propriétaire hors rôles client.
  ASSERT (SELECT prosecdef AND pg_get_userbyid(proowner) NOT IN ('authenticated', 'anon')
          FROM pg_proc WHERE oid = 'public.audit_trigger_fn()'::regprocedure),
    'audit_trigger_fn : attendu SECURITY DEFINER, propriétaire hors authenticated / anon';
END $$;

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
-- auth.uid() lit d'abord request.jwt.claim.sub : on le vide pour que seul
-- request.jwt.claims compte.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-cab4-0000-0000-000000000001', 'cab4-resp1@exemple.invalid',   'Responsable 1'),
  ('00000000-cab4-0000-0000-000000000002', 'cab4-c1@exemple.invalid',      'Collaborateur C1'),
  ('00000000-cab4-0000-0000-000000000003', 'cab4-c2@exemple.invalid',      'Collaborateur C2'),
  ('00000000-cab4-0000-0000-000000000004', 'cab4-stag@exemple.invalid',    'Stagiaire'),
  ('00000000-cab4-0000-0000-000000000005', 'cab4-paie@exemple.invalid',    'Collaborateur paie'),
  ('00000000-cab4-0000-0000-000000000007', 'cab4-admin-a@exemple.invalid', 'Administrateur A'),
  ('00000000-cab4-0000-0000-000000000008', 'cab4-cpt-d@exemple.invalid',   'Comptable D'),
  ('00000000-cab4-0000-0000-000000000009', 'cab4-chef-d@exemple.invalid',  'Chef comptable D')
) AS u(id, email, nom);

-- Le trigger handle_new_societe crée societe_config et les services intégrés.
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-cab4-0000-0001-000000000001', 'CAB4 TEST A'),
  ('00000000-cab4-0000-0001-000000000004', 'CAB4 TEST S'),
  ('00000000-cab4-0000-0001-000000000005', 'CAB4 TEST D');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-cab4-0000-0000-000000000007', '00000000-cab4-0000-0001-000000000001'),
  ('00000000-cab4-0000-0000-000000000001', '00000000-cab4-0000-0001-000000000004'),
  ('00000000-cab4-0000-0000-000000000008', '00000000-cab4-0000-0001-000000000005'),
  ('00000000-cab4-0000-0000-000000000009', '00000000-cab4-0000-0001-000000000005');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-cab4-0000-0000-000000000007', 'admin'::public.app_role),
  ('00000000-cab4-0000-0000-000000000001', 'admin'::public.app_role),
  ('00000000-cab4-0000-0000-000000000008', 'membre_compta'::public.app_role),
  ('00000000-cab4-0000-0000-000000000009', 'chef_compta'::public.app_role);
RESET role;

-- Exercices clos (l'INSERT n'est pas contrôlé par controle_reouverture_exercice).
INSERT INTO public.exercices (societe_id, annee, statut, date_cloture) VALUES
  ('00000000-cab4-0000-0001-000000000001', 2024, 'cloture', now()),
  ('00000000-cab4-0000-0001-000000000004', 2024, 'cloture', now()),
  ('00000000-cab4-0000-0001-000000000005', 2024, 'cloture', now());

INSERT INTO public.cabinets (id, nom, societe_propre_id) VALUES
  ('00000000-cab4-0000-0002-000000000001', 'CAB4 Cabinet 1', '00000000-cab4-0000-0001-000000000004'),
  ('00000000-cab4-0000-0002-000000000002', 'CAB4 Cabinet 2', NULL);

INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
  ('00000000-cab4-0000-0002-000000000001', '00000000-cab4-0000-0000-000000000001', 'responsable'),
  ('00000000-cab4-0000-0002-000000000001', '00000000-cab4-0000-0000-000000000002', 'collaborateur'),
  ('00000000-cab4-0000-0002-000000000001', '00000000-cab4-0000-0000-000000000003', 'collaborateur'),
  ('00000000-cab4-0000-0002-000000000001', '00000000-cab4-0000-0000-000000000004', 'stagiaire'),
  ('00000000-cab4-0000-0002-000000000001', '00000000-cab4-0000-0000-000000000005', 'collaborateur');

INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine) VALUES
  ('00000000-cab4-0000-0003-000000000001', '00000000-cab4-0000-0002-000000000001',
   '00000000-cab4-0000-0001-000000000001', 'tenue_complete', 'actif', 'cabinet');

INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission) VALUES
  ('00000000-cab4-0000-0003-000000000001', '00000000-cab4-0000-0000-000000000002', 'tenue_complete'),
  ('00000000-cab4-0000-0003-000000000001', '00000000-cab4-0000-0000-000000000003', 'tenue_complete'),
  ('00000000-cab4-0000-0003-000000000001', '00000000-cab4-0000-0000-000000000004', 'tenue_complete'),
  ('00000000-cab4-0000-0003-000000000001', '00000000-cab4-0000-0000-000000000005', 'paie_social');

-- ─── Exécution en session simulée ───────────────────────────────────────────
CREATE FUNCTION pg_temp.cab4_executer(_uid uuid, _sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  n bigint;
  res text;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal2"}', _uid), true);
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    res := 'ok:' || n;
  EXCEPTION WHEN OTHERS THEN
    res := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN res;
END
$f$;

-- Vérifie un résultat : _attendu « ok:<n> » (égalité) ou un préfixe d'erreur
-- (« 42501 QUATRE_YEUX », etc.).
CREATE FUNCTION pg_temp.cab4_attendre(_cas text, _uid uuid, _sql text, _attendu text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  res text := pg_temp.cab4_executer(_uid, _sql);
BEGIN
  IF _attendu LIKE 'ok:%' THEN
    IF res IS DISTINCT FROM _attendu THEN
      RAISE EXCEPTION '% : attendu %, obtenu %', _cas, _attendu, res;
    END IF;
  ELSIF res NOT LIKE _attendu || '%' THEN
    RAISE EXCEPTION '% : attendu %…, obtenu %', _cas, _attendu, res;
  END IF;
END
$f$;

-- ═══ 1. Stagiaire, collaborateurs : validation d'une écriture de A ═════════
DO $$
DECLARE
  a  constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1 constant uuid := '00000000-cab4-0000-0000-000000000002';
  c2 constant uuid := '00000000-cab4-0000-0000-000000000003';
  st constant uuid := '00000000-cab4-0000-0000-000000000004';
BEGIN
  -- C1 saisit une écriture.
  PERFORM pg_temp.cab4_attendre('C1 saisit', c1, format(
    'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 3, %L, %L, %L)',
    a, 'OD', 'CAB4 saisie C1', 'CAB4-C1'), 'ok:1');
  ASSERT (SELECT cree_par FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-C1') = c1,
    'C1 : cree_par attendu C1';

  -- Le stagiaire ne valide pas (niveau 2), même la saisie d'un autre.
  PERFORM pg_temp.cab4_attendre('stagiaire valide la saisie de C1', st, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-C1'), '42501 CABINET_VALIDATION');
  -- Il garde la saisie (niveau 2) : une modification sans validation passe.
  PERFORM pg_temp.cab4_attendre('stagiaire modifie le libellé', st, format(
    'UPDATE public.ecritures_comptables SET libelle = %L WHERE societe_id = %L AND numero_piece = %L',
    'CAB4 saisie C1 (relue)', a, 'CAB4-C1'), 'ok:1');

  -- C1 ne valide pas sa propre saisie.
  PERFORM pg_temp.cab4_attendre('C1 valide sa saisie', c1, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-C1'), '42501 QUATRE_YEUX');

  -- C2 valide la saisie de C1.
  PERFORM pg_temp.cab4_attendre('C2 valide la saisie de C1', c2, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-C1'), 'ok:1');
  ASSERT (SELECT statut FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-C1') = 'valide',
    'C2 : écriture non validée';
  -- L'auteur reste C1 après la validation.
  ASSERT (SELECT cree_par FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-C1') = c1,
    'C2 : cree_par modifié par la validation';
END $$;

-- ═══ 2. cree_par falsifié à l'insertion ════════════════════════════════════
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  adm constant uuid := '00000000-cab4-0000-0000-000000000007';
BEGIN
  -- C1 se fait passer pour l'administrateur du client…
  PERFORM pg_temp.cab4_attendre('C1 saisit avec cree_par falsifié', c1, format(
    'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece, cree_par) VALUES (%L, 2026, 3, %L, %L, %L, %L)',
    a, 'OD', 'CAB4 saisie falsifiée', 'CAB4-FAUX', adm), 'ok:1');
  ASSERT (SELECT cree_par FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-FAUX') = c1,
    'cree_par falsifié conservé (écriture)';
  -- … et ne peut donc toujours pas valider sa saisie.
  PERFORM pg_temp.cab4_attendre('C1 valide sa saisie falsifiée', c1, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-FAUX'), '42501 QUATRE_YEUX');

  -- Même chose sur une opération de trésorerie.
  PERFORM pg_temp.cab4_attendre('C1 saisit une opération avec cree_par falsifié', c1, format(
    'INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description, cree_par) VALUES (%L, 2026, 3, %L, %L, 1000, %L, %L)',
    a, '2026-03-15', 'd', 'CAB4 opération C1', adm), 'ok:1');
  ASSERT (SELECT cree_par FROM public.transactions WHERE societe_id = a AND description = 'CAB4 opération C1') = c1,
    'cree_par falsifié conservé (transaction)';
END $$;

-- Hors session utilisateur (auth.uid() nul) : la valeur fournie est gardée.
DO $$
BEGIN
  ASSERT auth.uid() IS NULL, 'fixture : auth.uid() attendu nul';
  INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece, cree_par)
    VALUES ('00000000-cab4-0000-0001-000000000001', 2026, 3, 'OD', 'CAB4 reprise serveur', 'CAB4-SRV',
            '00000000-cab4-0000-0000-000000000007');
  ASSERT (SELECT cree_par FROM public.ecritures_comptables
          WHERE societe_id = '00000000-cab4-0000-0001-000000000001' AND numero_piece = 'CAB4-SRV')
         = '00000000-cab4-0000-0000-000000000007',
    'hors session : cree_par fourni remplacé';
END $$;

-- ═══ 3. Responsable de cabinet avec le rôle global admin ═══════════════════
-- Chez le client A : aucune dispense d'administrateur.
DO $$
DECLARE
  a  constant uuid := '00000000-cab4-0000-0001-000000000001';
  r1 constant uuid := '00000000-cab4-0000-0000-000000000001';
  c1 constant uuid := '00000000-cab4-0000-0000-000000000002';
  n bigint;
BEGIN
  ASSERT public.cabinet_niveau(r1, a, 'compta') = 3, 'fixture : R1 attendu au niveau 3 sur A';

  -- Propre saisie : refusée, malgré le rôle admin et le niveau 3.
  PERFORM pg_temp.cab4_attendre('R1 saisit sur A', r1, format(
    'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 4, %L, %L, %L)',
    a, 'OD', 'CAB4 saisie R1 sur A', 'CAB4-R1-A'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('R1 valide sa saisie sur A', r1, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-R1-A'), '42501 QUATRE_YEUX');
  -- Il valide celle d'un autre (niveau 3).
  PERFORM pg_temp.cab4_attendre('R1 valide une saisie de C1', r1, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-FAUX'), 'ok:1');

  -- Exercice clos de A : ni réouverture, ni changement d'année, ni suppression.
  PERFORM pg_temp.cab4_attendre('R1 rouvre un exercice clos de A', r1, format(
    'UPDATE public.exercices SET statut = %L, date_cloture = NULL WHERE societe_id = %L AND annee = 2024',
    'ouvert', a), '42501 EXERCICE_REOUVERTURE');
  PERFORM pg_temp.cab4_attendre('C1 rouvre un exercice clos de A', c1, format(
    'UPDATE public.exercices SET statut = %L WHERE societe_id = %L AND annee = 2024',
    'ouvert', a), '42501 EXERCICE_REOUVERTURE');
  PERFORM pg_temp.cab4_attendre('R1 change l''année d''un exercice clos de A', r1, format(
    'UPDATE public.exercices SET annee = 2023 WHERE societe_id = %L AND annee = 2024', a),
    '42501 EXERCICE_CLOTURE');
  -- Suppression : refusée par les règles (aucune ligne) ou par le trigger.
  DECLARE
    res text := pg_temp.cab4_executer(r1, format(
      'DELETE FROM public.exercices WHERE societe_id = %L AND annee = 2024', a));
  BEGIN
    ASSERT res = 'ok:0' OR res LIKE '42501 %',
      format('R1 supprime un exercice clos de A : obtenu %s', res);
  END;
  SELECT count(*) INTO n FROM public.exercices WHERE societe_id = a AND annee = 2024 AND statut = 'cloture';
  ASSERT n = 1, 'R1 : exercice clos de A modifié ou supprimé';
END $$;

-- Sur sa propre société S (accès direct) : dispenses habituelles.
DO $$
DECLARE
  s  constant uuid := '00000000-cab4-0000-0001-000000000004';
  r1 constant uuid := '00000000-cab4-0000-0000-000000000001';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(r1, s), 'fixture : R1 ne doit pas agir comme cabinet sur S';
  PERFORM pg_temp.cab4_attendre('R1 saisit sur S', r1, format(
    'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 4, %L, %L, %L)',
    s, 'OD', 'CAB4 saisie R1 sur S', 'CAB4-R1-S'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('R1 valide sa saisie sur S', r1, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', s, 'CAB4-R1-S'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('R1 rouvre un exercice clos de S', r1, format(
    'UPDATE public.exercices SET statut = %L, date_cloture = NULL WHERE societe_id = %L AND annee = 2024',
    'ouvert', s), 'ok:1');
END $$;

-- ═══ 4. Administrateur direct de A : dispenses inchangées ══════════════════
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  adm constant uuid := '00000000-cab4-0000-0000-000000000007';
BEGIN
  PERFORM pg_temp.cab4_attendre('administrateur saisit sur A', adm, format(
    'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 5, %L, %L, %L)',
    a, 'OD', 'CAB4 saisie administrateur', 'CAB4-ADM'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('administrateur valide sa saisie', adm, format(
    'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L',
    'valide', a, 'CAB4-ADM'), 'ok:1');
  -- Exercice clos de A : changement d'année, réouverture, suppression.
  PERFORM pg_temp.cab4_attendre('administrateur change l''année d''un exercice clos', adm, format(
    'UPDATE public.exercices SET annee = 2023 WHERE societe_id = %L AND annee = 2024', a), 'ok:1');
  PERFORM pg_temp.cab4_attendre('administrateur rouvre un exercice clos', adm, format(
    'UPDATE public.exercices SET statut = %L, date_cloture = NULL WHERE societe_id = %L AND annee = 2023',
    'ouvert', a), 'ok:1');
  PERFORM pg_temp.cab4_attendre('administrateur clôture de nouveau', adm, format(
    'UPDATE public.exercices SET statut = %L, date_cloture = now() WHERE societe_id = %L AND annee = 2023',
    'cloture', a), 'ok:1');
  PERFORM pg_temp.cab4_attendre('administrateur supprime un exercice clos', adm, format(
    'DELETE FROM public.exercices WHERE societe_id = %L AND annee = 2023', a), 'ok:1');
END $$;

-- ═══ 5. Audit signé ════════════════════════════════════════════════════════
-- Sur transactions (trigger trg_transactions_audit) : opération saisie par C1
-- (section 2), par l'administrateur direct de A, et par R1 sur S.
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  s   constant uuid := '00000000-cab4-0000-0001-000000000004';
  r1  constant uuid := '00000000-cab4-0000-0000-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  adm constant uuid := '00000000-cab4-0000-0000-000000000007';
  cab constant uuid := '00000000-cab4-0000-0002-000000000001';
  id_c1 text;
  id_adm text;
  id_r1 text;
  n bigint;
BEGIN
  PERFORM pg_temp.cab4_attendre('administrateur saisit une opération', adm, format(
    'INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description) VALUES (%L, 2026, 3, %L, %L, 2000, %L)',
    a, '2026-03-16', 'd', 'CAB4 opération administrateur'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('R1 saisit une opération sur S', r1, format(
    'INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description) VALUES (%L, 2026, 3, %L, %L, 3000, %L)',
    s, '2026-03-17', 'd', 'CAB4 opération R1 sur S'), 'ok:1');

  SELECT id::text INTO id_c1  FROM public.transactions WHERE societe_id = a AND description = 'CAB4 opération C1';
  SELECT id::text INTO id_adm FROM public.transactions WHERE societe_id = a AND description = 'CAB4 opération administrateur';
  SELECT id::text INTO id_r1  FROM public.transactions WHERE societe_id = s AND description = 'CAB4 opération R1 sur S';

  SELECT count(*) INTO n FROM public.audit_log
  WHERE table_name = 'transactions' AND action = 'INSERT' AND record_id = id_c1
    AND user_id = c1 AND societe_id = a AND cabinet_id = cab;
  ASSERT n = 1, format('audit : opération de C1 sans cabinet_id (%s ligne(s))', n);

  SELECT count(*) INTO n FROM public.audit_log
  WHERE table_name = 'transactions' AND action = 'INSERT' AND record_id = id_adm
    AND user_id = adm AND societe_id = a AND cabinet_id IS NULL;
  ASSERT n = 1, format('audit : opération de l''administrateur, cabinet_id attendu NULL (%s ligne(s))', n);

  SELECT count(*) INTO n FROM public.audit_log
  WHERE table_name = 'transactions' AND action = 'INSERT' AND record_id = id_r1
    AND user_id = r1 AND societe_id = s AND cabinet_id IS NULL;
  ASSERT n = 1, format('audit : opération de R1 sur S, cabinet_id attendu NULL (%s ligne(s))', n);

  -- Une modification par C1 est signée aussi.
  PERFORM pg_temp.cab4_attendre('C1 modifie son opération', c1, format(
    'UPDATE public.transactions SET montant = 1500 WHERE id = %s', id_c1), 'ok:1');
  SELECT count(*) INTO n FROM public.audit_log
  WHERE table_name = 'transactions' AND action = 'UPDATE' AND record_id = id_c1
    AND user_id = c1 AND cabinet_id = cab;
  ASSERT n = 1, format('audit : modification de C1 sans cabinet_id (%s ligne(s))', n);
END $$;

-- ═══ 6. Ligne d'audit écrite directement (signature recalculée) ══════════
-- La règle d'insertion existante peut accepter (ok:1) ou refuser (42501) :
-- les deux issues sont admises. Une ligne acceptée porte le cabinet de
-- l'auteur sur la société de la ligne (recalculé), jamais la valeur fournie.
DO $$
DECLARE
  a    constant uuid := '00000000-cab4-0000-0001-000000000001';
  s    constant uuid := '00000000-cab4-0000-0001-000000000004';
  c1   constant uuid := '00000000-cab4-0000-0000-000000000002';
  adm  constant uuid := '00000000-cab4-0000-0000-000000000007';
  cab1 constant uuid := '00000000-cab4-0000-0002-000000000001';
  cab2 constant uuid := '00000000-cab4-0000-0002-000000000002';
  ins  constant text := 'INSERT INTO public.audit_log (user_id, action, table_name, record_id, societe_id, cabinet_id) VALUES (%L, %L, %L, %L, %L, %L)';
  res text;
BEGIN
  -- C1 sur A, cabinet 2 forgé → cabinet 1 (le sien).
  res := pg_temp.cab4_executer(c1, format(ins, c1, 'INSERT', 'transactions', 'CAB4-AUDIT-A', a, cab2));
  IF res = 'ok:1' THEN
    ASSERT (SELECT count(*) FROM public.audit_log
            WHERE record_id = 'CAB4-AUDIT-A' AND user_id = c1 AND cabinet_id = cab1) = 1,
      'audit direct, C1 sur A : cabinet 1 attendu';
  ELSIF res LIKE '42501 %' THEN
    RAISE NOTICE 'audit direct, C1 sur A : insertion refusée (%)', res;
  ELSE
    RAISE EXCEPTION 'audit direct, C1 sur A : issue inattendue %', res;
  END IF;

  -- C1 sur S (il n'y agit pas comme cabinet), cabinet 1 forgé → NULL.
  res := pg_temp.cab4_executer(c1, format(ins, c1, 'INSERT', 'transactions', 'CAB4-AUDIT-S', s, cab1));
  IF res = 'ok:1' THEN
    ASSERT (SELECT count(*) FROM public.audit_log
            WHERE record_id = 'CAB4-AUDIT-S' AND user_id = c1 AND cabinet_id IS NULL) = 1,
      'audit direct, C1 sur S : cabinet_id NULL attendu';
  ELSIF res NOT LIKE '42501 %' THEN
    RAISE EXCEPTION 'audit direct, C1 sur S : issue inattendue %', res;
  END IF;

  -- Administrateur direct de A, cabinet 1 forgé → NULL.
  res := pg_temp.cab4_executer(adm, format(ins, adm, 'INSERT', 'transactions', 'CAB4-AUDIT-ADM', a, cab1));
  IF res = 'ok:1' THEN
    ASSERT (SELECT count(*) FROM public.audit_log
            WHERE record_id = 'CAB4-AUDIT-ADM' AND user_id = adm AND cabinet_id IS NULL) = 1,
      'audit direct, administrateur : cabinet_id NULL attendu';
  ELSIF res NOT LIKE '42501 %' THEN
    RAISE EXCEPTION 'audit direct, administrateur : issue inattendue %', res;
  END IF;

  -- Jamais la valeur forgée.
  ASSERT (SELECT count(*) FROM public.audit_log
          WHERE record_id LIKE 'CAB4-AUDIT-%' AND cabinet_id = cab2) = 0,
    'audit direct : cabinet 2 forgé enregistré';
END $$;

-- ═══ 7. Bulletins de paie : validation et paiement ════════════════════════
-- Fixtures en postgres : un employé et cinq bulletins brouillon (mois 1 à 5)
-- sur A ; l'employé est retenu dans cab4.employe.
DO $$
DECLARE
  a constant uuid := '00000000-cab4-0000-0001-000000000001';
  e bigint;
BEGIN
  INSERT INTO public.employes (societe_id, nom) VALUES (a, 'CAB4 employé') RETURNING id INTO e;
  PERFORM set_config('cab4.employe', e::text, true);
  INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee)
  SELECT a, e, 'CAB4 employé', m, 2026 FROM generate_series(1, 5) m;
END $$;

DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  st  constant uuid := '00000000-cab4-0000-0000-000000000004';
  p1  constant uuid := '00000000-cab4-0000-0000-000000000005';
  adm constant uuid := '00000000-cab4-0000-0000-000000000007';
  e   constant text := current_setting('cab4.employe');
  maj constant text := 'UPDATE public.bulletins_paie SET statut = %L WHERE societe_id = %L AND annee = 2026 AND mois = %s';
  net constant text := 'UPDATE public.bulletins_paie SET net_a_payer = %s WHERE societe_id = %L AND annee = 2026 AND mois = %s';
  ins constant text := 'INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee, statut) VALUES (%L, %s, %L, %s, 2026, %L)';
BEGIN
  ASSERT public.cabinet_niveau(st, a, 'grh') = 2, 'fixture : stagiaire attendu au niveau 2 en grh';
  ASSERT public.cabinet_niveau(c1, a, 'grh') = 3, 'fixture : C1 attendu au niveau 3 en grh';
  ASSERT public.cabinet_niveau(p1, a, 'grh') = 3, 'fixture : P1 attendu au niveau 3 en grh';
  ASSERT public.cabinet_niveau(p1, a, 'compta') = 1, 'fixture : P1 attendu au niveau 1 en compta';

  -- Stagiaire (niveau 2) : il modifie un montant sur un brouillon…
  PERFORM pg_temp.cab4_attendre('stagiaire modifie le net d''un brouillon', st,
    format(net, 150000, a, 1), 'ok:1');
  -- … mais ne valide ni ne paie, ni par UPDATE ni par INSERT direct.
  PERFORM pg_temp.cab4_attendre('stagiaire valide un bulletin', st,
    format(maj, 'valide', a, 1), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire passe un bulletin à payé', st,
    format(maj, 'paye', a, 1), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire insère un bulletin payé', st,
    format(ins, a, e, 'CAB4 employé', 7, 'paye'), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire insère un bulletin validé', st,
    format(ins, a, e, 'CAB4 employé', 8, 'valide'), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire insère un bulletin brouillon', st,
    format(ins, a, e, 'CAB4 employé', 9, 'brouillon'), 'ok:1');

  -- Collaborateur tenue_complete (grh 3, compta 3) : validation puis paiement.
  PERFORM pg_temp.cab4_attendre('C1 valide un bulletin', c1,
    format(maj, 'valide', a, 2), 'ok:1');
  PERFORM pg_temp.cab4_attendre('C1 passe un bulletin à payé', c1,
    format(maj, 'paye', a, 2), 'ok:1');

  -- Collaborateur paie_social (grh 3, compta 1) : validation, pas de paiement.
  PERFORM pg_temp.cab4_attendre('P1 valide un bulletin', p1,
    format(maj, 'valide', a, 4), 'ok:1');
  PERFORM pg_temp.cab4_attendre('P1 passe un bulletin à payé', p1,
    format(maj, 'paye', a, 4), '42501 CABINET_PAIEMENT');
  PERFORM pg_temp.cab4_attendre('P1 insère un bulletin payé', p1,
    format(ins, a, e, 'CAB4 employé', 10, 'paye'), '42501 CABINET_PAIEMENT');

  -- Administrateur direct : inchangé.
  PERFORM pg_temp.cab4_attendre('administrateur valide un bulletin', adm,
    format(maj, 'valide', a, 3), 'ok:1');
  PERFORM pg_temp.cab4_attendre('administrateur passe un bulletin à payé', adm,
    format(maj, 'paye', a, 3), 'ok:1');

  -- Bulletin validé ou payé : le stagiaire ne le modifie pas, sauf pour le
  -- repasser en brouillon ; C1 (niveau 3) le modifie.
  PERFORM pg_temp.cab4_attendre('stagiaire modifie le net d''un bulletin payé', st,
    format(net, 1, a, 2), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire repasse un bulletin validé en brouillon', st,
    format(maj, 'brouillon', a, 4), 'ok:1');
  PERFORM pg_temp.cab4_attendre('C1 modifie le net d''un bulletin payé', c1,
    format(net, 160000, a, 2), 'ok:1');

  ASSERT (SELECT array_agg(statut ORDER BY mois) FROM public.bulletins_paie
          WHERE societe_id = a AND annee = 2026)
         = ARRAY['brouillon', 'paye', 'paye', 'brouillon', 'brouillon', 'brouillon'],
    'bulletins : statuts finaux inattendus';
  ASSERT (SELECT net_a_payer FROM public.bulletins_paie
          WHERE societe_id = a AND annee = 2026 AND mois = 2) = 160000,
    'bulletins : net du bulletin payé, attendu 160000';
END $$;

-- ═══ 8. Écriture validée ; validation d'une absence ═══════════════════════
-- CAB4-C1 a été validée par C2 (section 1).
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  c2  constant uuid := '00000000-cab4-0000-0000-000000000003';
  st  constant uuid := '00000000-cab4-0000-0000-000000000004';
  ecr constant text := 'UPDATE public.ecritures_comptables SET %s WHERE societe_id = %L AND numero_piece = %L';
BEGIN
  ASSERT (SELECT statut FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-C1') = 'valide',
    'fixture : CAB4-C1 attendue validée';
  -- Stagiaire : pas de modification d'une écriture validée…
  PERFORM pg_temp.cab4_attendre('stagiaire modifie une écriture validée', st,
    format(ecr, 'libelle = ''CAB4 retouche stagiaire''', a, 'CAB4-C1'), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('stagiaire modifie les lignes d''une écriture validée', st,
    format(ecr, 'lignes = ''[{"compte": "601"}]''::jsonb', a, 'CAB4-C1'), '42501 CABINET_VALIDATION');
  -- … mais il peut la repasser en brouillon.
  PERFORM pg_temp.cab4_attendre('stagiaire repasse une écriture en brouillon', st,
    format(ecr, 'statut = ''brouillon''', a, 'CAB4-C1'), 'ok:1');
  -- C2 la valide de nouveau ; C1 (niveau 3) la modifie validée.
  PERFORM pg_temp.cab4_attendre('C2 valide de nouveau', c2,
    format(ecr, 'statut = ''valide''', a, 'CAB4-C1'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('C1 modifie une écriture validée', c1,
    format(ecr, 'libelle = ''CAB4 retouche C1''', a, 'CAB4-C1'), 'ok:1');
  ASSERT (SELECT libelle FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB4-C1')
         = 'CAB4 retouche C1',
    'écriture validée : retouche de C1 absente';
END $$;

-- Table à statut_validation : absence en attente, créée en postgres.
INSERT INTO public.absences (societe_id, employe_id, annee, mois, type, date_debut, date_fin, statut_validation)
VALUES ('00000000-cab4-0000-0001-000000000001', current_setting('cab4.employe')::bigint,
        2026, 3, 'conge', '2026-03-05', '2026-03-06', 'en_validation');
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  st  constant uuid := '00000000-cab4-0000-0000-000000000004';
  maj constant text := 'UPDATE public.absences SET statut_validation = %L WHERE societe_id = %L AND annee = 2026 AND mois = 3';
BEGIN
  PERFORM pg_temp.cab4_attendre('stagiaire valide une absence', st,
    format(maj, 'valide', a), '42501 CABINET_VALIDATION');
  PERFORM pg_temp.cab4_attendre('C1 valide une absence', c1,
    format(maj, 'valide', a), 'ok:1');
END $$;

-- ═══ 9. Audit : suppression signée, UPDATE sans changement, hors session ══
-- UPDATE sans changement : la ligne a été créée dans cette transaction et
-- updated_at vaut now() (constant dans la transaction) ; le trigger de mise à
-- jour ne crée donc pas de différence.
DO $$
DECLARE
  a   constant uuid := '00000000-cab4-0000-0001-000000000001';
  c1  constant uuid := '00000000-cab4-0000-0000-000000000002';
  cab constant uuid := '00000000-cab4-0000-0002-000000000001';
  id_c1 text;
  avant bigint;
  apres bigint;
BEGIN
  SELECT id::text INTO id_c1 FROM public.transactions WHERE societe_id = a AND description = 'CAB4 opération C1';
  ASSERT id_c1 IS NOT NULL, 'fixture : opération de C1 absente';

  SELECT count(*) INTO avant FROM public.audit_log WHERE table_name = 'transactions' AND record_id = id_c1;
  PERFORM pg_temp.cab4_attendre('C1 : UPDATE sans changement', c1, format(
    'UPDATE public.transactions SET montant = montant WHERE id = %s', id_c1), 'ok:1');
  SELECT count(*) INTO apres FROM public.audit_log WHERE table_name = 'transactions' AND record_id = id_c1;
  ASSERT apres = avant, format('audit : UPDATE sans changement journalisé (%s → %s)', avant, apres);

  PERFORM pg_temp.cab4_attendre('C1 supprime son opération', c1, format(
    'DELETE FROM public.transactions WHERE id = %s', id_c1), 'ok:1');
  ASSERT (SELECT count(*) FROM public.audit_log
          WHERE table_name = 'transactions' AND action = 'DELETE' AND record_id = id_c1
            AND user_id = c1 AND societe_id = a AND cabinet_id = cab) = 1,
    'audit : suppression par C1 non signée';
END $$;

-- Hors session (postgres, auth.uid() nul) : validation de « sa » saisie
-- acceptée (CAB4-SRV porte cree_par = administrateur de A).
DO $$
DECLARE
  n bigint;
BEGIN
  ASSERT auth.uid() IS NULL, 'fixture : auth.uid() attendu nul';
  UPDATE public.ecritures_comptables SET statut = 'valide'
  WHERE societe_id = '00000000-cab4-0000-0001-000000000001' AND numero_piece = 'CAB4-SRV';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'hors session : validation refusée';
END $$;

-- ═══ 10. Non-régression : société D sans cabinet ══════════════════════════
DO $$
DECLARE
  d    constant uuid := '00000000-cab4-0000-0001-000000000005';
  cpt  constant uuid := '00000000-cab4-0000-0000-000000000008';
  chef constant uuid := '00000000-cab4-0000-0000-000000000009';
  ins  constant text := 'INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 6, %L, %L, %L)';
  val  constant text := 'UPDATE public.ecritures_comptables SET statut = %L WHERE societe_id = %L AND numero_piece = %L';
  res text;
BEGIN
  ASSERT NOT public.agit_comme_cabinet(cpt, d) AND NOT public.agit_comme_cabinet(chef, d),
    'fixture : personne n''agit comme cabinet sur D';

  -- Quatre yeux.
  PERFORM pg_temp.cab4_attendre('D, comptable saisit', cpt,
    format(ins, d, 'OD', 'CAB4 saisie comptable D', 'CAB4-D-CPT'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('D, chef comptable saisit', chef,
    format(ins, d, 'OD', 'CAB4 saisie chef D', 'CAB4-D-CHEF'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('D, comptable valide sa saisie', cpt,
    format(val, 'valide', d, 'CAB4-D-CPT'), '42501 QUATRE_YEUX');
  PERFORM pg_temp.cab4_attendre('D, chef comptable valide sa saisie', chef,
    format(val, 'valide', d, 'CAB4-D-CHEF'), '42501 QUATRE_YEUX');
  PERFORM pg_temp.cab4_attendre('D, chef comptable valide la saisie du comptable', chef,
    format(val, 'valide', d, 'CAB4-D-CPT'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('D, comptable valide la saisie du chef', cpt,
    format(val, 'valide', d, 'CAB4-D-CHEF'), 'ok:1');

  -- Exercice clos : réouverture et suppression refusées.
  res := pg_temp.cab4_executer(cpt, format(
    'UPDATE public.exercices SET statut = %L WHERE societe_id = %L AND annee = 2024', 'ouvert', d));
  ASSERT res = 'ok:0' OR res LIKE '42501 EXERCICE_REOUVERTURE%',
    format('D, comptable rouvre : obtenu %s', res);
  PERFORM pg_temp.cab4_attendre('D, chef comptable rouvre', chef, format(
    'UPDATE public.exercices SET statut = %L WHERE societe_id = %L AND annee = 2024', 'ouvert', d),
    '42501 EXERCICE_REOUVERTURE');
  res := pg_temp.cab4_executer(cpt, format(
    'DELETE FROM public.exercices WHERE societe_id = %L AND annee = 2024', d));
  ASSERT res = 'ok:0' OR res LIKE '42501 %',
    format('D, comptable supprime un exercice clos : obtenu %s', res);
  PERFORM pg_temp.cab4_attendre('D, chef comptable supprime un exercice clos', chef, format(
    'DELETE FROM public.exercices WHERE societe_id = %L AND annee = 2024', d),
    '42501 EXERCICE_CLOTURE');

  -- Re-clôture par upsert (definirStatut) et affectation : acceptées.
  PERFORM pg_temp.cab4_attendre('D, chef comptable re-clôture par upsert', chef, format(
    'INSERT INTO public.exercices (societe_id, annee, statut, date_cloture, affectation) VALUES (%L, 2024, %L, now(), %L::jsonb) '
    'ON CONFLICT (societe_id, annee) DO UPDATE SET statut = excluded.statut, date_cloture = excluded.date_cloture, affectation = excluded.affectation',
    d, 'cloture', '{}'), 'ok:1');
  PERFORM pg_temp.cab4_attendre('D, chef comptable modifie l''affectation', chef, format(
    'UPDATE public.exercices SET affectation = %L::jsonb WHERE societe_id = %L AND annee = 2024',
    '{"report_a_nouveau": 1}', d), 'ok:1');

  ASSERT (SELECT statut = 'cloture' AND affectation = '{"report_a_nouveau": 1}'::jsonb
          FROM public.exercices WHERE societe_id = d AND annee = 2024),
    'D : exercice 2024 attendu clos, avec l''affectation modifiée';
END $$;

RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN RAISE NOTICE 'OK cabinet_validation_audit'; END $$;
-- fin test
ROLLBACK;
