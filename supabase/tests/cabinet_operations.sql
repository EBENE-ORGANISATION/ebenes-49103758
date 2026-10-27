BEGIN;
-- debut test
-- Test de la tâche 5 (espace cabinet) : opérations cabinet_* (création du
-- cabinet, équipe, création de dossier et limite, rattachement, attributions,
-- changement de mission), mes_dossiers_cabinet, cabinet_collaborateurs_dossier
-- (tâche 9, livrée en tâche 5), mission_couvre.
-- Suppose appliquées les migrations 20261027120000 à 20261027123000 (en
-- production) et, juste avant ce corps, 20261027124000_cabinet_operations.sql.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-cab5-) :
--   utilisateurs  …-0000-0000000000NN
--     01 SA    super-admin (admin_general), sessions aal2 et aal1
--     02 R1    futur responsable du cabinet 1 (créé par SA)
--     03 C1    futur collaborateur du cabinet 1
--     04 ST    futur stagiaire du cabinet 1
--     05 R2    responsable du cabinet 2 (fixture)
--     06 C2    collaborateur du cabinet 2 (fixture)
--     07 ADA   administrateur de la société A (rôle admin + user_societes A)
--     08 ADX   administrateur de la société X (rôle admin + user_societes X)
--     09 IN    futur membre inactif du cabinet 1
--     10 SA2   autre super-admin (admin_general), jamais membre
--     11 R1B   futur second responsable du cabinet 1
--     12 U12   compte sans rôle (ajouté par le super-admin)
--   sociétés      …-0001-0000000000NN : 01 A (cliente, a un administrateur),
--                 02 X (autre société)
--   cabinet 2     …-0002-000000000002 (R2, C2), sans dossier
-- Le cabinet 1 et ses dossiers sont créés par les fonctions testées ; leurs
-- id sont rangés dans la table temporaire cab5_ids.
--
-- Les appels passent par pg_temp.cab5_executer(uid, aal, sql), appelée en
-- postgres : elle prend la session de l'utilisateur (SET LOCAL ROLE
-- authenticated et request.jwt.claims avec le niveau aal), exécute la requête
-- (une seule valeur, convertie en texte), revient en postgres et rend
-- « ok:<valeur> » ou « <SQLSTATE> <message> ».

-- ─── Structure ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cabinet_creer(text, uuid, int)',
    'public.cabinet_definir_membre(uuid, uuid, public.role_cabinet, boolean)',
    'public.cabinet_creer_dossier(uuid, text)',
    'public.cabinet_rattacher(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_attribuer(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_retirer_attribution(uuid, uuid)',
    'public.cabinet_changer_mission(uuid, public.mission_cabinet)',
    'public.mes_dossiers_cabinet()',
    'public.cabinet_collaborateurs_dossier(uuid)'
  ] LOOP
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), f || ' : pas SECURITY DEFINER';
    ASSERT (SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure),
      f || ' : search_path non fixé';
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : exécutable par anon';
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : non exécutable par authenticated';
    ASSERT has_function_privilege('service_role', f, 'EXECUTE'), f || ' : non exécutable par service_role';
  END LOOP;

  -- Fonctions internes : fermées aux rôles client.
  FOREACH f IN ARRAY ARRAY[
    'private.cabinet_role_super_admin(uuid)',
    'private.cabinet_responsable_actif(uuid, uuid)',
    'private.cabinet_slug(text, uuid)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : exécutable par anon';
    ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : exécutable par authenticated';
  END LOOP;

  -- mission_couvre : pure, comme niveau_mission.
  f := 'public.mission_couvre(public.mission_cabinet, public.mission_cabinet)';
  ASSERT (SELECT NOT prosecdef AND provolatile = 'i' FROM pg_proc WHERE oid = f::regprocedure),
    'mission_couvre : attendu SECURITY INVOKER, IMMUTABLE';
  ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'mission_couvre exécutable par anon';

  -- Ordre partiel des missions.
  ASSERT public.mission_couvre('tenue_complete', 'compta_fiscalite'), 'T couvre CF';
  ASSERT public.mission_couvre('tenue_complete', 'paie_social'), 'T couvre PS';
  ASSERT public.mission_couvre('compta_fiscalite', 'declarations'), 'CF couvre D';
  ASSERT public.mission_couvre('declarations', 'lecture'), 'D couvre L';
  ASSERT public.mission_couvre('lecture', 'lecture'), 'L couvre L';
  ASSERT NOT public.mission_couvre('compta_fiscalite', 'tenue_complete'), 'CF couvre T';
  ASSERT NOT public.mission_couvre('compta_fiscalite', 'paie_social'), 'CF couvre PS';
  ASSERT NOT public.mission_couvre('paie_social', 'compta_fiscalite'), 'PS couvre CF';
  ASSERT NOT public.mission_couvre('paie_social', 'lecture'), 'PS couvre L (factures)';
  ASSERT public.mission_couvre(NULL, 'lecture') IS NULL, 'mission NULL';
END $$;

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Le trigger on_auth_user_created crée les profils (nom tiré des métadonnées).
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-cab5-0000-0000-000000000001', 'cab5-sa@exemple.invalid',    'Super admin'),
  ('00000000-cab5-0000-0000-000000000002', 'cab5-r1@exemple.invalid',    'Responsable 1'),
  ('00000000-cab5-0000-0000-000000000003', 'cab5-c1@exemple.invalid',    'Collaborateur C1'),
  ('00000000-cab5-0000-0000-000000000004', 'cab5-st@exemple.invalid',    'Stagiaire'),
  ('00000000-cab5-0000-0000-000000000005', 'cab5-r2@exemple.invalid',    'Responsable 2'),
  ('00000000-cab5-0000-0000-000000000006', 'cab5-c2@exemple.invalid',    'Collaborateur C2'),
  ('00000000-cab5-0000-0000-000000000007', 'cab5-ada@exemple.invalid',   'Administrateur A'),
  ('00000000-cab5-0000-0000-000000000008', 'cab5-adx@exemple.invalid',   'Administrateur X'),
  ('00000000-cab5-0000-0000-000000000009', 'cab5-in@exemple.invalid',    'Membre inactif'),
  ('00000000-cab5-0000-0000-000000000010', 'cab5-sa2@exemple.invalid',   'Autre super admin'),
  ('00000000-cab5-0000-0000-000000000011', 'cab5-r1b@exemple.invalid',   'Responsable 1 bis'),
  ('00000000-cab5-0000-0000-000000000012', 'cab5-u12@exemple.invalid',   'Compte sans rôle')
) AS u(id, email, nom);

INSERT INTO public.societes (id, nom) VALUES
  ('00000000-cab5-0000-0001-000000000001', 'CAB5 TEST A'),
  ('00000000-cab5-0000-0001-000000000002', 'CAB5 TEST X');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-cab5-0000-0000-000000000007', '00000000-cab5-0000-0001-000000000001'),
  ('00000000-cab5-0000-0000-000000000008', '00000000-cab5-0000-0001-000000000002');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-cab5-0000-0000-000000000001', 'admin_general'::public.app_role),
  ('00000000-cab5-0000-0000-000000000010', 'admin_general'::public.app_role),
  ('00000000-cab5-0000-0000-000000000007', 'admin'::public.app_role),
  ('00000000-cab5-0000-0000-000000000008', 'admin'::public.app_role);
RESET role;

INSERT INTO public.cabinets (id, nom) VALUES
  ('00000000-cab5-0000-0002-000000000002', 'CAB5 Cabinet 2');
INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
  ('00000000-cab5-0000-0002-000000000002', '00000000-cab5-0000-0000-000000000005', 'responsable'),
  ('00000000-cab5-0000-0002-000000000002', '00000000-cab5-0000-0000-000000000006', 'collaborateur');

-- ─── Outils ─────────────────────────────────────────────────────────────────
CREATE TEMP TABLE cab5_ids (cle text PRIMARY KEY, id uuid NOT NULL);

CREATE FUNCTION pg_temp.cab5_id(_cle text)
RETURNS uuid
LANGUAGE sql
AS $f$ SELECT id FROM cab5_ids WHERE cle = _cle $f$;

CREATE FUNCTION pg_temp.cab5_executer(_uid uuid, _aal text, _sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v text;
  res text;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"%s"}', _uid, _aal), true);
  BEGIN
    EXECUTE _sql INTO v;
    res := 'ok:' || coalesce(v, '');
  EXCEPTION WHEN OTHERS THEN
    res := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN res;
END
$f$;

-- Vérifie le début du résultat (« ok: », « ok:<valeur> », « 42501 CABINET_INTERDIT »…)
-- et le rend.
CREATE FUNCTION pg_temp.cab5_attendre(_cas text, _uid uuid, _aal text, _sql text, _attendu text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  res text := pg_temp.cab5_executer(_uid, _aal, _sql);
BEGIN
  IF res IS NULL OR left(res, length(_attendu)) <> _attendu THEN
    RAISE EXCEPTION '% : attendu %…, obtenu %', _cas, _attendu, res;
  END IF;
  RETURN res;
END
$f$;

-- ═══ 1. cabinet_creer : super-admin en aal2 seulement ══════════════════════
DO $$
DECLARE
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  r2  constant uuid := '00000000-cab5-0000-0000-000000000005';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  sa2 constant uuid := '00000000-cab5-0000-0000-000000000010';
  q text := 'SELECT public.cabinet_creer(%L, %L)::text';
  res text;
  k1 uuid;
BEGIN
  PERFORM pg_temp.cab5_attendre('cabinet_creer, super-admin en aal1', sa, 'aal1',
    format(q, 'CAB5 Cabinet 1', r1), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, administrateur de société', ada, 'aal2',
    format(q, 'CAB5 Cabinet 1', r1), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, futur responsable lui-même', r1, 'aal2',
    format(q, 'CAB5 Cabinet 1', r1), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, responsable super-admin', sa, 'aal2',
    format(q, 'CAB5 Cabinet 1', sa2), 'P0001 CABINET_SUPER_ADMIN');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, responsable déjà dans un cabinet', sa, 'aal2',
    format(q, 'CAB5 Cabinet 1', r2), 'P0001 CABINET_AUTRE_CABINET');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, nom vide', sa, 'aal2',
    format(q, '   ', r1), 'P0001 CABINET_PARAMETRE');
  PERFORM pg_temp.cab5_attendre('cabinet_creer, limite négative', sa, 'aal2',
    format('SELECT public.cabinet_creer(%L, %L, -1)::text', 'CAB5 Cabinet 1', r1), 'P0001 CABINET_PARAMETRE');
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinets WHERE nom = 'CAB5 Cabinet 1'), 'cabinet créé malgré les refus';

  res := pg_temp.cab5_attendre('cabinet_creer, super-admin en aal2', sa, 'aal2',
    format(q, 'CAB5 Cabinet 1', r1), 'ok:');
  k1 := substr(res, 4)::uuid;
  INSERT INTO cab5_ids VALUES ('k1', k1);

  ASSERT (SELECT max_dossiers = 10 AND actif AND created_by = sa AND nom = 'CAB5 Cabinet 1'
          FROM public.cabinets WHERE id = k1), 'cabinet 1 : valeurs inattendues';
  ASSERT (SELECT role = 'responsable' AND actif FROM public.cabinet_membres
          WHERE cabinet_id = k1 AND user_id = r1), 'R1 : pas responsable actif du cabinet 1';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = r1), 'R1 a reçu un rôle global';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_societes WHERE user_id = r1), 'R1 a reçu une ligne user_societes';
END $$;

-- ═══ 2. cabinet_definir_membre ════════════════════════════════════════════
DO $$
DECLARE
  k1  constant uuid := pg_temp.cab5_id('k1');
  k2  constant uuid := '00000000-cab5-0000-0002-000000000002';
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  st  constant uuid := '00000000-cab5-0000-0000-000000000004';
  r2  constant uuid := '00000000-cab5-0000-0000-000000000005';
  c2  constant uuid := '00000000-cab5-0000-0000-000000000006';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  inm constant uuid := '00000000-cab5-0000-0000-000000000009';
  sa2 constant uuid := '00000000-cab5-0000-0000-000000000010';
  r1b constant uuid := '00000000-cab5-0000-0000-000000000011';
  u12 constant uuid := '00000000-cab5-0000-0000-000000000012';
  q text := 'SELECT public.cabinet_definir_membre(%L, %L, %L, %L)::text';
BEGIN
  PERFORM pg_temp.cab5_attendre('R1 ajoute C1', r1, 'aal2', format(q, k1, c1, 'collaborateur', true), 'ok:');
  PERFORM pg_temp.cab5_attendre('R1 ajoute ST', r1, 'aal2', format(q, k1, st, 'stagiaire', true), 'ok:');
  PERFORM pg_temp.cab5_attendre('R1 ajoute un membre inactif', r1, 'aal2', format(q, k1, inm, 'collaborateur', false), 'ok:');

  -- Un super-admin ne devient jamais membre, quel que soit l'appelant.
  PERFORM pg_temp.cab5_attendre('R1 ajoute le super-admin', r1, 'aal2',
    format(q, k1, sa, 'collaborateur', true), 'P0001 CABINET_SUPER_ADMIN');
  PERFORM pg_temp.cab5_attendre('R1 ajoute un autre super-admin', r1, 'aal2',
    format(q, k1, sa2, 'collaborateur', true), 'P0001 CABINET_SUPER_ADMIN');
  PERFORM pg_temp.cab5_attendre('le super-admin s''ajoute lui-même', sa, 'aal2',
    format(q, k1, sa, 'responsable', true), 'P0001 CABINET_SUPER_ADMIN');
  -- Membre d'un autre cabinet.
  PERFORM pg_temp.cab5_attendre('R1 ajoute C2 (cabinet 2)', r1, 'aal2',
    format(q, k1, c2, 'collaborateur', true), 'P0001 CABINET_AUTRE_CABINET');

  -- Appelants refusés.
  PERFORM pg_temp.cab5_attendre('C1 ajoute U12', c1, 'aal2', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('ST ajoute U12', st, 'aal2', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R2 ajoute U12 au cabinet 1', r2, 'aal2', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R1 ajoute U12 au cabinet 2', r1, 'aal2', format(q, k2, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('administrateur A ajoute U12', ada, 'aal2', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin en aal1 ajoute U12', sa, 'aal1', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('membre inactif ajoute U12', inm, 'aal2', format(q, k1, u12, 'collaborateur', true), '42501 CABINET_INTERDIT');
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_membres WHERE user_id = u12), 'U12 ajouté malgré les refus';

  -- Le super-admin en aal2 gère l'équipe.
  PERFORM pg_temp.cab5_attendre('super-admin ajoute U12', sa, 'aal2', format(q, k1, u12, 'collaborateur', true), 'ok:');

  -- Dernier responsable actif.
  PERFORM pg_temp.cab5_attendre('R1 se rétrograde (dernier responsable)', r1, 'aal2',
    format(q, k1, r1, 'collaborateur', true), 'P0001 CABINET_DERNIER_RESPONSABLE');
  PERFORM pg_temp.cab5_attendre('R1 se désactive (dernier responsable)', r1, 'aal2',
    format(q, k1, r1, 'responsable', false), 'P0001 CABINET_DERNIER_RESPONSABLE');
  PERFORM pg_temp.cab5_attendre('super-admin désactive le dernier responsable', sa, 'aal2',
    format(q, k1, r1, 'responsable', false), 'P0001 CABINET_DERNIER_RESPONSABLE');
  PERFORM pg_temp.cab5_attendre('R1 ajoute un second responsable', r1, 'aal2',
    format(q, k1, r1b, 'responsable', true), 'ok:');
  PERFORM pg_temp.cab5_attendre('R1B se désactive (R1 reste)', r1b, 'aal2',
    format(q, k1, r1b, 'responsable', false), 'ok:');
  PERFORM pg_temp.cab5_attendre('R1 se désactive (R1B inactif)', r1, 'aal2',
    format(q, k1, r1, 'responsable', false), 'P0001 CABINET_DERNIER_RESPONSABLE');

  ASSERT (SELECT role = 'responsable' AND actif FROM public.cabinet_membres WHERE user_id = r1),
    'R1 n''est plus responsable actif';
  ASSERT (SELECT role = 'responsable' AND NOT actif FROM public.cabinet_membres WHERE user_id = r1b),
    'R1B : attendu responsable inactif';
  ASSERT (SELECT role = 'collaborateur' AND actif AND cabinet_id = k1 FROM public.cabinet_membres WHERE user_id = c1),
    'C1 : attendu collaborateur actif du cabinet 1';
  ASSERT (SELECT role = 'stagiaire' FROM public.cabinet_membres WHERE user_id = st), 'ST : attendu stagiaire';
  ASSERT (SELECT NOT actif FROM public.cabinet_membres WHERE user_id = inm), 'membre inactif : attendu inactif';
  ASSERT (SELECT cabinet_id = k2 FROM public.cabinet_membres WHERE user_id = c2), 'C2 a changé de cabinet';
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_membres WHERE user_id IN (sa, sa2)), 'un super-admin est membre';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id IN (r1, c1, st, inm, r1b, u12)),
    'un membre a reçu un rôle global';
END $$;

-- ═══ 3. cabinet_creer_dossier : 10 dossiers, le 11ᵉ refusé (vigilance 5) ══
DO $$
DECLARE
  k1  constant uuid := pg_temp.cab5_id('k1');
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  st  constant uuid := '00000000-cab5-0000-0000-000000000004';
  r2  constant uuid := '00000000-cab5-0000-0000-000000000005';
  q text := 'SELECT public.cabinet_creer_dossier(%L, %L)::text';
  res text;
  nom text;
  i int;
  ids uuid[] := '{}';
BEGIN
  PERFORM pg_temp.cab5_attendre('C1 crée un dossier', c1, 'aal2', format(q, k1, 'CAB5 Interdit'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('ST crée un dossier', st, 'aal2', format(q, k1, 'CAB5 Interdit'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin crée un dossier', sa, 'aal2', format(q, k1, 'CAB5 Interdit'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R2 crée un dossier dans le cabinet 1', r2, 'aal2', format(q, k1, 'CAB5 Interdit'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R1, nom vide', r1, 'aal2', format(q, k1, ''), 'P0001 CABINET_PARAMETRE');
  ASSERT NOT EXISTS (SELECT 1 FROM public.societes s WHERE s.nom = 'CAB5 Interdit'), 'société créée malgré les refus';

  -- 10 dossiers ; le 10ᵉ porte le même nom que le 1ᵉʳ (slug distinct).
  FOR i IN 1..10 LOOP
    nom := CASE WHEN i = 10 THEN 'CAB5 Dossier 01' ELSE format('CAB5 Dossier %s', lpad(i::text, 2, '0')) END;
    res := pg_temp.cab5_attendre(format('R1 crée le dossier %s', i), r1, 'aal2', format(q, k1, nom), 'ok:');
    ids := ids || substr(res, 4)::uuid;
    INSERT INTO cab5_ids VALUES (format('s%s', lpad(i::text, 2, '0')), substr(res, 4)::uuid);
  END LOOP;

  res := pg_temp.cab5_executer(r1, 'aal2', format(q, k1, 'CAB5 Dossier 11'));
  ASSERT res = 'P0001 CABINET_LIMITE: Limite de 10 dossiers atteinte pour ce cabinet.',
    format('11e dossier : attendu CABINET_LIMITE, obtenu %s', res);
  ASSERT NOT EXISTS (SELECT 1 FROM public.societes s WHERE s.nom = 'CAB5 Dossier 11'), '11e société créée';

  -- La société : même chemin que CreerSocieteModal.
  ASSERT (SELECT count(*) FROM public.societes
          WHERE id = ANY (ids) AND statut = 'active' AND plan = 'starter' AND created_by = r1
            AND slug IS NOT NULL) = 10, 'sociétés : statut, plan, auteur ou slug inattendus';
  ASSERT (SELECT count(DISTINCT slug) FROM public.societes WHERE id = ANY (ids)) = 10, 'slugs en double';
  ASSERT (SELECT slug FROM public.societes WHERE id = pg_temp.cab5_id('s01')) = 'cab5-dossier-01',
    'slug du dossier 01 inattendu';
  ASSERT (SELECT slug LIKE 'cab5-dossier-01-%' FROM public.societes WHERE id = pg_temp.cab5_id('s10')),
    'slug du dossier 10 (même nom) inattendu';
  ASSERT (SELECT count(*) FROM public.societe_config
          WHERE societe_id = ANY (ids) AND module_grh AND module_fiscalite AND NOT module_stock
            AND NOT module_immobilisations AND NOT module_ia AND NOT module_multi_societes) = 10,
    'societe_config absente ou modules différents du plan starter';
  ASSERT (SELECT count(DISTINCT societe_id) FROM public.services WHERE societe_id = ANY (ids) AND built_in) = 10,
    'services intégrés absents (trigger handle_new_societe)';
  -- Le lien.
  ASSERT (SELECT count(*) FROM public.cabinet_dossiers
          WHERE societe_id = ANY (ids) AND cabinet_id = k1 AND etat = 'actif'
            AND origine = 'cabinet' AND mission = 'tenue_complete') = 10, 'liens inattendus';
  -- Aucun accès direct créé.
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_societes WHERE societe_id = ANY (ids)),
    'une ligne user_societes a été créée';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = r1), 'R1 a reçu un rôle global';
END $$;

-- ═══ 4. cabinet_rattacher : super-admin, sans limite ═══════════════════════
DO $$
DECLARE
  k1  constant uuid := pg_temp.cab5_id('k1');
  k2  constant uuid := '00000000-cab5-0000-0002-000000000002';
  a   constant uuid := '00000000-cab5-0000-0001-000000000001';
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  q text := 'SELECT public.cabinet_rattacher(%L, %L, %L)::text';
  res text;
  da uuid;
BEGIN
  PERFORM pg_temp.cab5_attendre('R1 rattache A', r1, 'aal2', format(q, k1, a, 'compta_fiscalite'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('administrateur A rattache A', ada, 'aal2', format(q, k1, a, 'compta_fiscalite'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin en aal1 rattache A', sa, 'aal1', format(q, k1, a, 'compta_fiscalite'), '42501 CABINET_INTERDIT');

  -- 11ᵉ lien du cabinet 1 : le super-admin passe outre la limite.
  res := pg_temp.cab5_attendre('super-admin rattache A', sa, 'aal2', format(q, k1, a, 'compta_fiscalite'), 'ok:');
  da := substr(res, 4)::uuid;
  INSERT INTO cab5_ids VALUES ('da', da);
  ASSERT (SELECT societe_id = a AND cabinet_id = k1 AND etat = 'actif' AND origine = 'super_admin'
                 AND mission = 'compta_fiscalite'
          FROM public.cabinet_dossiers WHERE id = da), 'lien de A inattendu';

  PERFORM pg_temp.cab5_attendre('A déjà suivie (cabinet 2)', sa, 'aal2', format(q, k2, a, 'lecture'), 'P0001 CABINET_DEJA_LIE');
  PERFORM pg_temp.cab5_attendre('dossier 01 déjà suivi', sa, 'aal2',
    format(q, k2, pg_temp.cab5_id('s01'), 'lecture'), 'P0001 CABINET_DEJA_LIE');
  PERFORM pg_temp.cab5_attendre('cabinet inconnu', sa, 'aal2',
    format(q, '00000000-cab5-0000-0002-0000000000ff', '00000000-cab5-0000-0001-000000000002', 'lecture'),
    'P0001 CABINET_INTROUVABLE');
END $$;

-- ═══ 5. cabinet_attribuer / cabinet_retirer_attribution ═══════════════════
DO $$
DECLARE
  k1  constant uuid := pg_temp.cab5_id('k1');
  da  constant uuid := pg_temp.cab5_id('da');
  d01 constant uuid := (SELECT id FROM public.cabinet_dossiers WHERE societe_id = pg_temp.cab5_id('s01'));
  d02 constant uuid := (SELECT id FROM public.cabinet_dossiers WHERE societe_id = pg_temp.cab5_id('s02'));
  d03 constant uuid := (SELECT id FROM public.cabinet_dossiers WHERE societe_id = pg_temp.cab5_id('s03'));
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  st  constant uuid := '00000000-cab5-0000-0000-000000000004';
  r2  constant uuid := '00000000-cab5-0000-0000-000000000005';
  c2  constant uuid := '00000000-cab5-0000-0000-000000000006';
  inm constant uuid := '00000000-cab5-0000-0000-000000000009';
  r1b constant uuid := '00000000-cab5-0000-0000-000000000011';
  q text := 'SELECT public.cabinet_attribuer(%L, %L, %L)::text';
  qr text := 'SELECT public.cabinet_retirer_attribution(%L, %L)::text';
BEGIN
  INSERT INTO cab5_ids VALUES ('d01', d01), ('d02', d02), ('d03', d03);

  -- Au-dessus de la mission du dossier (A : compta_fiscalite).
  PERFORM pg_temp.cab5_attendre('C1 en tenue_complete sur A (compta_fiscalite)', r1, 'aal2',
    format(q, da, c1, 'tenue_complete'), 'P0001 CABINET_MISSION');
  PERFORM pg_temp.cab5_attendre('C1 en paie_social sur A (non comparable)', r1, 'aal2',
    format(q, da, c1, 'paie_social'), 'P0001 CABINET_MISSION');
  PERFORM pg_temp.cab5_attendre('C1 en lecture sur A', r1, 'aal2', format(q, da, c1, 'lecture'), 'ok:');
  PERFORM pg_temp.cab5_attendre('C1 en declarations sur A (remplace)', r1, 'aal2', format(q, da, c1, 'declarations'), 'ok:');
  ASSERT (SELECT mission FROM public.cabinet_attributions WHERE dossier_id = da AND user_id = c1) = 'declarations',
    'attribution de C1 sur A non remplacée';

  PERFORM pg_temp.cab5_attendre('C1 en compta_fiscalite sur 01', r1, 'aal2', format(q, d01, c1, 'compta_fiscalite'), 'ok:');
  PERFORM pg_temp.cab5_attendre('C1 en tenue_complete sur 02', r1, 'aal2', format(q, d02, c1, 'tenue_complete'), 'ok:');
  PERFORM pg_temp.cab5_attendre('ST en tenue_complete sur 02', r1, 'aal2', format(q, d02, st, 'tenue_complete'), 'ok:');
  PERFORM pg_temp.cab5_attendre('ST en tenue_complete sur 03', r1, 'aal2', format(q, d03, st, 'tenue_complete'), 'ok:');

  -- Membre visé : actif, du même cabinet, pas responsable.
  PERFORM pg_temp.cab5_attendre('membre inactif', r1, 'aal2', format(q, d01, inm, 'lecture'), 'P0001 CABINET_MEMBRE');
  PERFORM pg_temp.cab5_attendre('membre d''un autre cabinet', r1, 'aal2', format(q, d01, c2, 'lecture'), 'P0001 CABINET_MEMBRE');
  PERFORM pg_temp.cab5_attendre('responsable inactif', r1, 'aal2', format(q, d01, r1b, 'lecture'), 'P0001 CABINET_MEMBRE');
  PERFORM pg_temp.cab5_attendre('non-membre (super-admin)', r1, 'aal2', format(q, d01, sa, 'lecture'), 'P0001 CABINET_MEMBRE');
  PERFORM pg_temp.cab5_attendre('responsable visé', r1, 'aal2', format(q, d01, r1, 'lecture'), 'P0001 CABINET_RESPONSABLE');

  -- Appelants refusés.
  PERFORM pg_temp.cab5_attendre('C1 attribue', c1, 'aal2', format(q, d03, c1, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('ST attribue', st, 'aal2', format(q, d03, st, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R2 attribue dans le cabinet 1', r2, 'aal2', format(q, d03, c1, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin attribue', sa, 'aal2', format(q, d03, c1, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('dossier inconnu', r1, 'aal2',
    format(q, '00000000-cab5-0000-0003-0000000000ff', c1, 'lecture'), 'P0001 CABINET_INTROUVABLE');

  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE user_id IN (inm, c2, r1b, sa, r1)),
    'attribution créée malgré les refus';
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE dossier_id = d03 AND user_id = c1),
    'attribution de C1 sur 03 créée malgré les refus';

  -- Retrait.
  PERFORM pg_temp.cab5_attendre('C1 retire une attribution', c1, 'aal2', format(qr, d02, st), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R2 retire une attribution', r2, 'aal2', format(qr, d02, st), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R1 retire ST de 02', r1, 'aal2', format(qr, d02, st), 'ok:');
  PERFORM pg_temp.cab5_attendre('R1 retire ST de 02 (déjà fait)', r1, 'aal2', format(qr, d02, st), 'ok:');
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE dossier_id = d02 AND user_id = st),
    'attribution de ST sur 02 non retirée';
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE dossier_id = d03 AND user_id = st),
    'attribution de ST sur 03 perdue';
END $$;

-- ═══ 6. cabinet_changer_mission ════════════════════════════════════════════
DO $$
DECLARE
  da  constant uuid := pg_temp.cab5_id('da');
  d01 constant uuid := pg_temp.cab5_id('d01');
  d02 constant uuid := pg_temp.cab5_id('d02');
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  adx constant uuid := '00000000-cab5-0000-0000-000000000008';
  q text := 'SELECT public.cabinet_changer_mission(%L, %L)::text';
BEGIN
  -- Dossier A : l'administrateur de A ou le super-admin.
  PERFORM pg_temp.cab5_attendre('administrateur d''une autre société', adx, 'aal2', format(q, da, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('collaborateur', c1, 'aal2', format(q, da, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('responsable du cabinet', r1, 'aal2', format(q, da, 'tenue_complete'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin en aal1', sa, 'aal1', format(q, da, 'lecture'), '42501 CABINET_INTERDIT');
  ASSERT (SELECT mission FROM public.cabinet_dossiers WHERE id = da) = 'compta_fiscalite', 'mission de A changée malgré les refus';

  PERFORM pg_temp.cab5_attendre('administrateur de A baisse en lecture', ada, 'aal2', format(q, da, 'lecture'), 'ok:');
  ASSERT (SELECT mission FROM public.cabinet_dossiers WHERE id = da) = 'lecture', 'mission de A non changée';
  -- Attribution au-dessus (declarations) : abaissée.
  ASSERT (SELECT mission FROM public.cabinet_attributions WHERE dossier_id = da AND user_id = c1) = 'lecture',
    'attribution de C1 sur A non abaissée';
  PERFORM pg_temp.cab5_attendre('super-admin remonte A en compta_fiscalite', sa, 'aal2', format(q, da, 'compta_fiscalite'), 'ok:');
  ASSERT (SELECT mission FROM public.cabinet_attributions WHERE dossier_id = da AND user_id = c1) = 'lecture',
    'attribution de C1 sur A remontée avec le dossier';

  -- Dossier 01, créé par le cabinet, sans administrateur client : super-admin seul.
  PERFORM pg_temp.cab5_attendre('administrateur de A sur 01', ada, 'aal2', format(q, d01, 'lecture'), '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('responsable sur 01', r1, 'aal2', format(q, d01, 'lecture'), '42501 CABINET_INTERDIT');
  -- compta_fiscalite (C1) et paie_social : non comparables, attribution supprimée.
  PERFORM pg_temp.cab5_attendre('super-admin passe 01 en paie_social', sa, 'aal2', format(q, d01, 'paie_social'), 'ok:');
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE dossier_id = d01 AND user_id = c1),
    'attribution non comparable de C1 sur 01 gardée';
  -- tenue_complete (C1) au-dessus de declarations : ramenée à declarations.
  PERFORM pg_temp.cab5_attendre('super-admin passe 02 en declarations', sa, 'aal2', format(q, d02, 'declarations'), 'ok:');
  ASSERT (SELECT mission FROM public.cabinet_attributions WHERE dossier_id = d02 AND user_id = c1) = 'declarations',
    'attribution de C1 sur 02 non abaissée';
END $$;

-- ═══ 7. mes_dossiers_cabinet selon le rôle ═════════════════════════════════
DO $$
DECLARE
  k1  constant uuid := pg_temp.cab5_id('k1');
  da  constant uuid := pg_temp.cab5_id('da');
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  st  constant uuid := '00000000-cab5-0000-0000-000000000004';
  r2  constant uuid := '00000000-cab5-0000-0000-000000000005';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  inm constant uuid := '00000000-cab5-0000-0000-000000000009';
  u12 constant uuid := '00000000-cab5-0000-0000-000000000012';
  liste constant text :=
    'SELECT string_agg(societe_nom || ''|'' || cabinet_nom || ''|'' || mission || ''|'' || etat || ''|'' || mon_role, '';'' '
    'ORDER BY societe_nom, societe_id) FROM public.mes_dossiers_cabinet()';
  compte constant text := 'SELECT count(*)::text FROM public.mes_dossiers_cabinet()';
BEGIN
  -- Responsable : tous les dossiers en cours du cabinet, à la mission du dossier.
  PERFORM pg_temp.cab5_attendre('R1 : 11 dossiers', r1, 'aal2', compte, 'ok:11');
  PERFORM pg_temp.cab5_attendre('R1 : rôle responsable partout', r1, 'aal2',
    'SELECT count(*)::text FROM public.mes_dossiers_cabinet() WHERE mon_role = ''responsable'' AND cabinet_nom = ''CAB5 Cabinet 1''',
    'ok:11');
  PERFORM pg_temp.cab5_attendre('R1 : A en compta_fiscalite', r1, 'aal2',
    'SELECT mission::text FROM public.mes_dossiers_cabinet() WHERE societe_nom = ''CAB5 TEST A''', 'ok:compta_fiscalite');
  PERFORM pg_temp.cab5_attendre('R1 : 01 en paie_social', r1, 'aal2',
    format('SELECT mission::text FROM public.mes_dossiers_cabinet() WHERE societe_id = %L', pg_temp.cab5_id('s01')),
    'ok:paie_social');

  -- Collaborateur : ses dossiers attribués seulement, à la mission de l'attribution.
  PERFORM pg_temp.cab5_attendre('C1 : dossiers attribués', c1, 'aal2', liste,
    'ok:CAB5 Dossier 02|CAB5 Cabinet 1|declarations|actif|collaborateur;'
    'CAB5 TEST A|CAB5 Cabinet 1|lecture|actif|collaborateur');
  -- Stagiaire : son rôle est rendu (le plafond se calcule dans l'application).
  PERFORM pg_temp.cab5_attendre('ST : dossier 03', st, 'aal2', liste,
    'ok:CAB5 Dossier 03|CAB5 Cabinet 1|tenue_complete|actif|stagiaire');
  -- Autres : rien.
  PERFORM pg_temp.cab5_attendre('membre inactif : rien', inm, 'aal2', compte, 'ok:0');
  PERFORM pg_temp.cab5_attendre('U12 non attribué : rien', u12, 'aal2', compte, 'ok:0');
  PERFORM pg_temp.cab5_attendre('R2 (cabinet sans dossier) : rien', r2, 'aal2', compte, 'ok:0');
  PERFORM pg_temp.cab5_attendre('administrateur de A (accès direct) : rien', ada, 'aal2', compte, 'ok:0');
  PERFORM pg_temp.cab5_attendre('super-admin : rien', sa, 'aal2', compte, 'ok:0');

  -- Départ demandé : le dossier reste, avec son état.
  UPDATE public.cabinet_dossiers SET etat = 'depart_demande' WHERE id = da;
  PERFORM pg_temp.cab5_attendre('C1 : A en depart_demande', c1, 'aal2',
    'SELECT etat::text FROM public.mes_dossiers_cabinet() WHERE societe_nom = ''CAB5 TEST A''', 'ok:depart_demande');
  UPDATE public.cabinet_dossiers SET etat = 'actif' WHERE id = da;

  -- Cabinet désactivé : plus rien, et plus de gestion d'équipe.
  UPDATE public.cabinets SET actif = false WHERE id = k1;
  PERFORM pg_temp.cab5_attendre('R1, cabinet désactivé : rien', r1, 'aal2', compte, 'ok:0');
  PERFORM pg_temp.cab5_attendre('R1, cabinet désactivé : équipe', r1, 'aal2',
    format('SELECT public.cabinet_definir_membre(%L, %L, %L, %L)::text', k1, u12, 'stagiaire', true),
    '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('R1, cabinet désactivé : dossier', r1, 'aal2',
    format('SELECT public.cabinet_creer_dossier(%L, %L)::text', k1, 'CAB5 Interdit'), '42501 CABINET_INTERDIT');
  UPDATE public.cabinets SET actif = true WHERE id = k1;
END $$;

-- ═══ 8. cabinet_collaborateurs_dossier (tâche 9) ═══════════════════════════
DO $$
DECLARE
  a   constant uuid := '00000000-cab5-0000-0001-000000000001';
  sa  constant uuid := '00000000-cab5-0000-0000-000000000001';
  r1  constant uuid := '00000000-cab5-0000-0000-000000000002';
  c1  constant uuid := '00000000-cab5-0000-0000-000000000003';
  ada constant uuid := '00000000-cab5-0000-0000-000000000007';
  adx constant uuid := '00000000-cab5-0000-0000-000000000008';
  q text := format(
    'SELECT string_agg(user_id || ''|'' || role || ''|'' || mission, '';'' ORDER BY role, user_id) '
    'FROM public.cabinet_collaborateurs_dossier(%L)', a);
  attendu text := format('ok:%s|responsable|compta_fiscalite;%s|collaborateur|lecture', r1, c1);
BEGIN
  -- R1 responsable, C1 attribué ; R1B (inactif) et U12 (non attribué) absents.
  PERFORM pg_temp.cab5_attendre('administrateur de A', ada, 'aal2', q, attendu);
  PERFORM pg_temp.cab5_attendre('super-admin', sa, 'aal2', q, attendu);
  PERFORM pg_temp.cab5_attendre('noms renseignés', ada, 'aal2',
    format('SELECT string_agg(nom, '';'' ORDER BY role) FROM public.cabinet_collaborateurs_dossier(%L)', a),
    'ok:Responsable 1;Collaborateur C1');

  PERFORM pg_temp.cab5_attendre('administrateur de X', adx, 'aal2', q, '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('collaborateur du cabinet', c1, 'aal2', q, '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('responsable du cabinet', r1, 'aal2', q, '42501 CABINET_INTERDIT');
  PERFORM pg_temp.cab5_attendre('super-admin en aal1', sa, 'aal1', q, '42501 CABINET_INTERDIT');
END $$;

-- ═══ 9. Aucune écriture dans user_roles / user_societes ════════════════════
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.user_societes us
    JOIN public.cabinet_membres m ON m.user_id = us.user_id
    WHERE m.cabinet_id = pg_temp.cab5_id('k1')), 'un membre du cabinet 1 a une ligne user_societes';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.cabinet_membres m ON m.user_id = r.user_id
    WHERE m.cabinet_id = pg_temp.cab5_id('k1')), 'un membre du cabinet 1 a un rôle global';
END $$;

RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN RAISE NOTICE 'OK cabinet_operations'; END $$;
-- fin test
ROLLBACK;
