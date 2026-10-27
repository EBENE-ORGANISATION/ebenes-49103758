BEGIN;
-- debut test
-- Test de la tâche 2 (espace cabinet) : niveau_mission, agit_comme_cabinet,
-- cabinet_niveau, cabinet_societes, cabinet_societes_agit ; est_personnel inchangée.
-- Suppose appliquées juste avant les migrations 20261027120000_cabinet_schema.sql
-- et 20261027121000_cabinet_droits.sql.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-cab0-) :
--   utilisateurs  …-0000-0000000000NN
--     01 responsable cabinet 1 (a aussi une attribution lecture sur A)
--     02 collaborateur cabinet 1 : lecture sur A, lecture sur le lien terminé de I
--     03 stagiaire cabinet 1 : tenue_complete sur A et sur E (depart_demande)
--     04 collaborateur cabinet 1, non attribué
--     05 responsable cabinet 2
--     06 collaborateur cabinet 2 : tenue_complete sur C
--     07 collaborateur cabinet 1 : tenue_complete sur B (vigilance 2)
--     08 collaborateur cabinet 1 : tenue_complete sur A (vigilance 4, membre)
--     09 responsable cabinet 3 (vigilance 4, cabinet)
--     10 collaborateur cabinet 1 : tenue_complete sur A, ET rattaché directement
--        à A avec le rôle comptable (vigilance 1)
--     11 comptable rattaché à D (société sans cabinet)
--     12 employé seul rattaché à D (rôle employe)
--     13 super-admin (admin_general), collaborateur cabinet 1 : tenue_complete sur A
--     14 super-admin (rôle super_admin, si la valeur existe dans app_role),
--        collaborateur cabinet 1 : tenue_complete sur A
--   sociétés      …-0001-0000000000NN :
--     01 A  02 B  03 C  04 D (sans lien)  05 E  06 F  07 G  08 H  09 I
--   cabinets      …-0002-0000000000NN : 01 cabinet 1, 02 cabinet 2, 03 cabinet 3
--   liens         …-0003-0000000000NN (mission, état) :
--     01 A–cab 1 tenue_complete actif         02 B–cab 1 tenue_complete actif
--     03 C–cab 2 compta_fiscalite actif       04 E–cab 1 tenue_complete depart_demande
--     05 F–cab 1 tenue_complete termine       06 G–cab 1 tenue_complete invitation
--     07 H–cab 3 tenue_complete actif
--     08 I–cab 1 tenue_complete termine       09 I–cab 2 tenue_complete actif

-- ─── Structure des fonctions ────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  -- Fonctions exposées, SECURITY DEFINER.
  FOREACH f IN ARRAY ARRAY[
    'public.agit_comme_cabinet(uuid, uuid)',
    'public.cabinet_niveau(uuid, uuid, text)',
    'public.cabinet_societes(text, int)',
    'public.cabinet_societes_agit()'
  ] LOOP
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), f || ' : pas SECURITY DEFINER';
    ASSERT (SELECT provolatile = 's' FROM pg_proc WHERE oid = f::regprocedure), f || ' : pas STABLE';
    ASSERT (SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure),
      f || ' : search_path non fixé';
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : exécutable par anon';
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : non exécutable par authenticated';
    ASSERT has_function_privilege('service_role', f, 'EXECUTE'), f || ' : non exécutable par service_role';
  END LOOP;

  -- niveau_mission : exception documentée (pure).
  f := 'public.niveau_mission(public.mission_cabinet, text)';
  ASSERT (SELECT NOT prosecdef AND provolatile = 'i' AND proparallel = 's'
          FROM pg_proc WHERE oid = f::regprocedure),
    'niveau_mission : attendu SECURITY INVOKER, IMMUTABLE, PARALLEL SAFE';
  ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'niveau_mission exécutable par anon';
  ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), 'niveau_mission non exécutable par authenticated';

  -- Fonctions internes : propriétaire seulement.
  FOREACH f IN ARRAY ARRAY[
    'public.cabinet_liens_internes(uuid, uuid)',
    'public.cabinet_niveau_effectif(public.mission_cabinet, public.mission_cabinet, public.role_cabinet, public.etat_dossier_cabinet, text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : exécutable par anon';
    ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : exécutable par authenticated';
    ASSERT NOT has_function_privilege('service_role', f, 'EXECUTE'), f || ' : exécutable par service_role';
  END LOOP;

  -- est_personnel n'est pas touchée par cette migration.
  ASSERT pg_get_functiondef('public.est_personnel(uuid, uuid)'::regprocedure) NOT LIKE '%cabinet%',
    'est_personnel a été modifiée';
END $$;

-- ─── Matrice des missions (§ 5), en dur ─────────────────────────────────────
DO $$
DECLARE
  r record;
  n int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('tenue_complete',   'compta', 3), ('tenue_complete',   'fiscalite', 3),
      ('tenue_complete',   'grh',    3), ('tenue_complete',   'factures',  3),
      ('tenue_complete',   'stock',  3), ('tenue_complete',   'immobilisations', 3),
      ('tenue_complete',   'parametres', 1), ('tenue_complete', 'dashboard', 1),

      ('compta_fiscalite', 'compta', 3), ('compta_fiscalite', 'fiscalite', 3),
      ('compta_fiscalite', 'grh',    1), ('compta_fiscalite', 'factures',  1),
      ('compta_fiscalite', 'stock',  1), ('compta_fiscalite', 'immobilisations', 3),
      ('compta_fiscalite', 'parametres', 1), ('compta_fiscalite', 'dashboard', 1),

      ('paie_social',      'compta', 1), ('paie_social',      'fiscalite', 1),
      ('paie_social',      'grh',    3), ('paie_social',      'factures',  0),
      ('paie_social',      'stock',  0), ('paie_social',      'immobilisations', 0),
      ('paie_social',      'parametres', 1), ('paie_social',    'dashboard', 1),

      ('declarations',     'compta', 1), ('declarations',     'fiscalite', 3),
      ('declarations',     'grh',    1), ('declarations',     'factures',  1),
      ('declarations',     'stock',  1), ('declarations',     'immobilisations', 1),
      ('declarations',     'parametres', 1), ('declarations',   'dashboard', 1),

      ('lecture',          'compta', 1), ('lecture',          'fiscalite', 1),
      ('lecture',          'grh',    1), ('lecture',          'factures',  1),
      ('lecture',          'stock',  1), ('lecture',          'immobilisations', 1),
      ('lecture',          'parametres', 1), ('lecture',        'dashboard', 1)
    ) AS t(mission, module, attendu)
  LOOP
    n := public.niveau_mission(r.mission::public.mission_cabinet, r.module);
    ASSERT n = r.attendu, format('niveau_mission(%s, %s) = %s, attendu %s', r.mission, r.module, n, r.attendu);
  END LOOP;

  -- 5 missions × 8 modules = 40 cas : aucune mission oubliée dans l'enum.
  ASSERT (SELECT count(*) FROM unnest(enum_range(NULL::public.mission_cabinet))) = 5, 'nombre de missions';

  -- Paramètres sociaux = paie ; module inconnu ou NULL, mission NULL : 0.
  ASSERT (SELECT bool_and(public.niveau_mission(m, 'parametres_sociaux') = public.niveau_mission(m, 'grh'))
          FROM unnest(enum_range(NULL::public.mission_cabinet)) AS m), 'parametres_sociaux <> grh';
  ASSERT (SELECT bool_and(public.niveau_mission(m, x) = 0)
          FROM unnest(enum_range(NULL::public.mission_cabinet)) AS m,
               unnest(ARRAY['utilisateurs', 'Compta', '', 'inconnu']) AS x), 'module inconnu <> 0';
  ASSERT public.niveau_mission('tenue_complete', NULL) = 0, 'module NULL <> 0';
  ASSERT public.niveau_mission(NULL, 'compta') = 0, 'mission NULL <> 0';
END $$;

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
-- auth.uid() lit d'abord request.jwt.claim.sub : on le vide pour que seul
-- request.jwt.claims compte.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Le trigger on_auth_user_created crée les profils.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-cab0-0000-0000-000000000001', 'cab0-resp1@exemple.invalid',      'Responsable 1'),
  ('00000000-cab0-0000-0000-000000000002', 'cab0-coll-lect@exemple.invalid',  'Collaborateur lecture'),
  ('00000000-cab0-0000-0000-000000000003', 'cab0-stag1@exemple.invalid',      'Stagiaire 1'),
  ('00000000-cab0-0000-0000-000000000004', 'cab0-coll-na@exemple.invalid',    'Collaborateur non attribué'),
  ('00000000-cab0-0000-0000-000000000005', 'cab0-resp2@exemple.invalid',      'Responsable 2'),
  ('00000000-cab0-0000-0000-000000000006', 'cab0-coll2@exemple.invalid',      'Collaborateur cabinet 2'),
  ('00000000-cab0-0000-0000-000000000007', 'cab0-coll-b@exemple.invalid',     'Collaborateur B'),
  ('00000000-cab0-0000-0000-000000000008', 'cab0-coll-desac@exemple.invalid', 'Collaborateur désactivé'),
  ('00000000-cab0-0000-0000-000000000009', 'cab0-resp3@exemple.invalid',      'Responsable 3'),
  ('00000000-cab0-0000-0000-000000000010', 'cab0-double@exemple.invalid',     'Double accès'),
  ('00000000-cab0-0000-0000-000000000011', 'cab0-compta-d@exemple.invalid',   'Comptable D'),
  ('00000000-cab0-0000-0000-000000000012', 'cab0-employe-d@exemple.invalid',  'Employé D'),
  ('00000000-cab0-0000-0000-000000000013', 'cab0-super@exemple.invalid',      'Super admin membre'),
  ('00000000-cab0-0000-0000-000000000014', 'cab0-super2@exemple.invalid',     'Super admin (super_admin) membre')
) AS u(id, email, nom);

-- Le trigger handle_new_societe crée societe_config et les services intégrés.
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-cab0-0000-0001-000000000001', 'CAB0 TEST A'),
  ('00000000-cab0-0000-0001-000000000002', 'CAB0 TEST B'),
  ('00000000-cab0-0000-0001-000000000003', 'CAB0 TEST C'),
  ('00000000-cab0-0000-0001-000000000004', 'CAB0 TEST D'),
  ('00000000-cab0-0000-0001-000000000005', 'CAB0 TEST E'),
  ('00000000-cab0-0000-0001-000000000006', 'CAB0 TEST F'),
  ('00000000-cab0-0000-0001-000000000007', 'CAB0 TEST G'),
  ('00000000-cab0-0000-0001-000000000008', 'CAB0 TEST H'),
  ('00000000-cab0-0000-0001-000000000009', 'CAB0 TEST I');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-cab0-0000-0000-000000000010', '00000000-cab0-0000-0001-000000000001'),
  ('00000000-cab0-0000-0000-000000000011', '00000000-cab0-0000-0001-000000000004'),
  ('00000000-cab0-0000-0000-000000000012', '00000000-cab0-0000-0001-000000000004');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026 ;
-- trg_bloquer_role_super_admin refuse admin_general hors service_role).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-cab0-0000-0000-000000000010', 'comptable'::public.app_role),
  ('00000000-cab0-0000-0000-000000000011', 'comptable'::public.app_role),
  ('00000000-cab0-0000-0000-000000000012', 'employe'::public.app_role),
  ('00000000-cab0-0000-0000-000000000013', 'admin_general'::public.app_role);
-- Rôle super_admin : seulement si la valeur existe dans l'enum app_role.
DO $$
BEGIN
  IF 'super_admin' = ANY (enum_range(NULL::public.app_role)::text[]) THEN
    EXECUTE 'INSERT INTO public.user_roles (user_id, role) VALUES (''00000000-cab0-0000-0000-000000000014'', ''super_admin'')';
  ELSE
    RAISE NOTICE 'app_role sans valeur super_admin : cas 14 non vérifié';
  END IF;
END $$;
RESET role;

INSERT INTO public.cabinets (id, nom) VALUES
  ('00000000-cab0-0000-0002-000000000001', 'CAB0 Cabinet 1'),
  ('00000000-cab0-0000-0002-000000000002', 'CAB0 Cabinet 2'),
  ('00000000-cab0-0000-0002-000000000003', 'CAB0 Cabinet 3');

INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif) VALUES
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000001', 'responsable',   true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000002', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000003', 'stagiaire',     true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000004', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0000-000000000005', 'responsable',   true),
  ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0000-000000000006', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000007', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000008', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000003', '00000000-cab0-0000-0000-000000000009', 'responsable',   true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000010', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000013', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000014', 'collaborateur', true);

INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine, termine_le) VALUES
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000001', 'tenue_complete',   'actif',          'cabinet',     NULL),
  ('00000000-cab0-0000-0003-000000000002', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000002', 'tenue_complete',   'actif',          'cabinet',     NULL),
  ('00000000-cab0-0000-0003-000000000003', '00000000-cab0-0000-0002-000000000002',
   '00000000-cab0-0000-0001-000000000003', 'compta_fiscalite', 'actif',          'client',      NULL),
  ('00000000-cab0-0000-0003-000000000004', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000005', 'tenue_complete',   'depart_demande', 'cabinet',     NULL),
  ('00000000-cab0-0000-0003-000000000005', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000006', 'tenue_complete',   'termine',        'cabinet',     now()),
  ('00000000-cab0-0000-0003-000000000006', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000007', 'tenue_complete',   'invitation',     'client',      NULL),
  ('00000000-cab0-0000-0003-000000000007', '00000000-cab0-0000-0002-000000000003',
   '00000000-cab0-0000-0001-000000000008', 'tenue_complete',   'actif',          'super_admin', NULL),
  ('00000000-cab0-0000-0003-000000000008', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000009', 'tenue_complete',   'termine',        'cabinet',     now()),
  ('00000000-cab0-0000-0003-000000000009', '00000000-cab0-0000-0002-000000000002',
   '00000000-cab0-0000-0001-000000000009', 'tenue_complete',   'actif',          'client',      NULL);

INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission) VALUES
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000001', 'lecture'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000002', 'lecture'),
  ('00000000-cab0-0000-0003-000000000008', '00000000-cab0-0000-0000-000000000002', 'lecture'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000003', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000004', '00000000-cab0-0000-0000-000000000003', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000003', '00000000-cab0-0000-0000-000000000006', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000002', '00000000-cab0-0000-0000-000000000007', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000008', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000010', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000013', 'tenue_complete'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000014', 'tenue_complete');

-- ─── Cas, chacun dans la session de l'intéressé ─────────────────────────────
-- Les tableaux de sociétés sont comparés triés (uuid croissants : A < B < C < E < I).
SET LOCAL role authenticated;

-- Responsable 1 : mission du dossier sur tous les dossiers en cours du cabinet,
-- même avec une attribution lecture sur A.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000001';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
  b constant uuid := '00000000-cab0-0000-0001-000000000002';
  e constant uuid := '00000000-cab0-0000-0001-000000000005';
BEGIN
  ASSERT public.agit_comme_cabinet(u, a), 'responsable, A : agit_comme_cabinet faux';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 3, 'responsable (attribution lecture), A tenue_complete, compta <> 3';
  ASSERT public.cabinet_niveau(u, a, 'parametres') = 1, 'responsable, A, parametres <> 1';
  ASSERT public.cabinet_niveau(u, a, 'dashboard') = 1, 'responsable, A, dashboard <> 1';
  ASSERT public.cabinet_niveau(u, a, 'utilisateurs') = 0, 'responsable, A, module inconnu <> 0';
  ASSERT public.cabinet_niveau(u, b, 'compta') = 3, 'responsable, B (sans attribution), compta <> 3';
  -- Autre cabinet, société sans lien.
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000003', 'compta') = 0, 'responsable 1, C <> 0';
  ASSERT NOT public.agit_comme_cabinet(u, '00000000-cab0-0000-0001-000000000004'), 'responsable 1, D : agit';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000004', 'dashboard') = 0, 'responsable 1, D <> 0';

  -- Lien depart_demande : tout en lecture.
  ASSERT public.agit_comme_cabinet(u, e), 'depart_demande : agit faux';
  ASSERT public.cabinet_niveau(u, e, 'compta') = 1, 'depart_demande, compta <> 1';
  ASSERT public.cabinet_niveau(u, e, 'factures') = 1, 'depart_demande, factures <> 1';
  ASSERT public.cabinet_niveau(u, e, 'dashboard') = 1, 'depart_demande, dashboard <> 1';

  -- Lien terminé, invitation : aucun accès.
  ASSERT NOT public.agit_comme_cabinet(u, '00000000-cab0-0000-0001-000000000006'), 'termine : agit vrai';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000006', 'compta') = 0, 'termine <> 0';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000006', 'dashboard') = 0, 'termine, dashboard <> 0';
  ASSERT NOT public.agit_comme_cabinet(u, '00000000-cab0-0000-0001-000000000007'), 'invitation : agit vrai';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000007', 'compta') = 0, 'invitation <> 0';

  -- I : lien terminé du cabinet 1, lien actif du cabinet 2.
  ASSERT NOT public.agit_comme_cabinet(u, '00000000-cab0-0000-0001-000000000009'), 'I, cabinet 1 terminé : agit vrai';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000009', 'compta') = 0, 'I, cabinet 1 terminé <> 0';

  -- Listes de sociétés.
  ASSERT (SELECT array_agg(s ORDER BY s) FROM unnest(public.cabinet_societes_agit()) s) = ARRAY[a, b, e],
    'responsable 1 : cabinet_societes_agit';
  ASSERT (SELECT array_agg(s ORDER BY s) FROM unnest(public.cabinet_societes('compta', 3)) s) = ARRAY[a, b],
    'responsable 1 : cabinet_societes(compta, 3)';
  ASSERT (SELECT array_agg(s ORDER BY s) FROM unnest(public.cabinet_societes('compta', 1)) s) = ARRAY[a, b, e],
    'responsable 1 : cabinet_societes(compta, 1)';
  ASSERT public.cabinet_societes('parametres', 2) = '{}'::uuid[], 'responsable 1 : cabinet_societes(parametres, 2)';
  ASSERT public.cabinet_societes('inconnu', 1) = '{}'::uuid[], 'responsable 1 : module inconnu';

  -- Pas de sondage des droits d'autrui depuis sa session.
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000003', a, 'compta') = 0,
    'cabinet_niveau renseigne sur un autre utilisateur';
  ASSERT NOT public.agit_comme_cabinet('00000000-cab0-0000-0000-000000000002', a),
    'agit_comme_cabinet renseigne sur un autre utilisateur';
END $$;

-- Collaborateur attribué en lecture sur un dossier tenue_complete : 1.
-- est_personnel reste fausse pour lui (inchangée, pas de user_societes).
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000002';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT public.cabinet_niveau(u, a, 'compta') = 1, 'collaborateur lecture, compta <> 1';
  ASSERT public.cabinet_niveau(u, a, 'grh') = 1, 'collaborateur lecture, grh <> 1';
  ASSERT public.cabinet_niveau(u, a, 'factures') = 1, 'collaborateur lecture, factures <> 1';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000002', 'compta') = 0,
    'collaborateur lecture, B non attribué <> 0';
  -- Attribution sur le lien terminé de I : rien.
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000009', 'compta') = 0,
    'collaborateur, attribution sur lien terminé <> 0';
  ASSERT public.cabinet_societes_agit() = ARRAY[a], 'collaborateur lecture : cabinet_societes_agit';
  ASSERT public.cabinet_societes('compta', 1) = ARRAY[a], 'collaborateur lecture : cabinet_societes(compta, 1)';
  ASSERT public.cabinet_societes('compta', 2) = '{}'::uuid[], 'collaborateur lecture : cabinet_societes(compta, 2)';
  ASSERT NOT public.est_personnel(u, a), 'est_personnel modifiée : vraie pour un collaborateur de cabinet';
END $$;

-- Stagiaire : plafonné à 2 ; sur un lien depart_demande, 1.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000003';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
  e constant uuid := '00000000-cab0-0000-0001-000000000005';
BEGIN
  ASSERT public.cabinet_niveau(u, a, 'compta') = 2, 'stagiaire, compta <> 2';
  ASSERT public.cabinet_niveau(u, a, 'grh') = 2, 'stagiaire, grh <> 2';
  ASSERT public.cabinet_niveau(u, a, 'parametres') = 1, 'stagiaire, parametres <> 1';
  ASSERT public.cabinet_niveau(u, a, 'dashboard') = 1, 'stagiaire, dashboard <> 1';
  ASSERT public.cabinet_niveau(u, e, 'compta') = 1, 'stagiaire, depart_demande, compta <> 1';
  ASSERT (SELECT array_agg(s ORDER BY s) FROM unnest(public.cabinet_societes_agit()) s) = ARRAY[a, e],
    'stagiaire : cabinet_societes_agit';
  ASSERT public.cabinet_societes('compta', 2) = ARRAY[a], 'stagiaire : cabinet_societes(compta, 2)';
  ASSERT public.cabinet_societes('compta', 3) = '{}'::uuid[], 'stagiaire : cabinet_societes(compta, 3)';
END $$;

-- Collaborateur non attribué : 0.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000004","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000004';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(u, a), 'non attribué : agit vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'non attribué, compta <> 0';
  ASSERT public.cabinet_niveau(u, a, 'dashboard') = 0, 'non attribué, dashboard <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'non attribué : cabinet_societes_agit';
  ASSERT public.cabinet_societes('dashboard', 1) = '{}'::uuid[], 'non attribué : cabinet_societes';

  -- Sonder le responsable 1 sur A : 0 / faux.
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000001', a, 'compta') = 0,
    'cabinet_niveau d''un autre utilisateur <> 0';
  ASSERT NOT public.agit_comme_cabinet('00000000-cab0-0000-0000-000000000001', a),
    'agit_comme_cabinet d''un autre utilisateur vrai';
END $$;

-- Responsable du cabinet 2 : rien sur A ; I (lien actif du cabinet 2) et C.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000005","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000005';
  c constant uuid := '00000000-cab0-0000-0001-000000000003';
  i constant uuid := '00000000-cab0-0000-0001-000000000009';
BEGIN
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000001', 'compta') = 0,
    'responsable d''un autre cabinet, A <> 0';
  ASSERT public.cabinet_niveau(u, i, 'compta') = 3, 'cabinet 2, I (actif, terminé pour cabinet 1), compta <> 3';
  ASSERT (SELECT array_agg(s ORDER BY s) FROM unnest(public.cabinet_societes_agit()) s) = ARRAY[c, i],
    'responsable 2 : cabinet_societes_agit';
  ASSERT public.cabinet_societes('grh', 3) = ARRAY[i], 'responsable 2 : cabinet_societes(grh, 3)';
END $$;

-- Collaborateur du cabinet 2.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000006","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000006';
BEGIN
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000001', 'compta') = 0,
    'collaborateur d''un autre cabinet, A <> 0';
  ASSERT NOT public.agit_comme_cabinet(u, '00000000-cab0-0000-0001-000000000001'),
    'collaborateur d''un autre cabinet, A : agit vrai';
  -- Sur C (compta_fiscalite, attribution tenue_complete) : le dossier plafonne.
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000003', 'compta') = 3, 'cab 2, C, compta <> 3';
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000003', 'grh') = 1, 'cab 2, C, grh <> 1';
  -- Non attribué sur I.
  ASSERT public.cabinet_niveau(u, '00000000-cab0-0000-0001-000000000009', 'compta') = 0, 'cab 2, I non attribué <> 0';
END $$;

-- ─── Vigilance 2 : la mission du dossier baisse, les attributions restent ──
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000007","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000007',
                               '00000000-cab0-0000-0001-000000000002', 'compta') = 3,
    'collaborateur B avant baisse, compta <> 3';
END $$;

RESET role;
UPDATE public.cabinet_dossiers SET mission = 'paie_social' WHERE id = '00000000-cab0-0000-0003-000000000002';
SET LOCAL role authenticated;

-- Minimum module par module : paie_social (dossier) ∩ tenue_complete (attribution).
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000007';
  b constant uuid := '00000000-cab0-0000-0001-000000000002';
BEGIN
  ASSERT public.cabinet_niveau(u, b, 'compta') = 1, 'B en paie_social, compta <> 1';
  ASSERT public.cabinet_niveau(u, b, 'grh') = 3, 'B en paie_social, grh <> 3';
  ASSERT public.cabinet_niveau(u, b, 'factures') = 0, 'B en paie_social, factures <> 0';
  ASSERT public.cabinet_niveau(u, b, 'fiscalite') = 1, 'B en paie_social, fiscalite <> 1';
  ASSERT public.cabinet_societes('factures', 1) = '{}'::uuid[], 'B en paie_social : cabinet_societes(factures, 1)';
  ASSERT public.cabinet_societes('grh', 3) = ARRAY[b], 'B en paie_social : cabinet_societes(grh, 3)';
  ASSERT public.cabinet_societes_agit() = ARRAY[b], 'B en paie_social : cabinet_societes_agit';
END $$;

RESET role;
UPDATE public.cabinet_dossiers SET mission = 'lecture' WHERE id = '00000000-cab0-0000-0003-000000000002';
DO $$
BEGIN
  ASSERT (SELECT mission FROM public.cabinet_attributions
          WHERE dossier_id = '00000000-cab0-0000-0003-000000000002'
            AND user_id = '00000000-cab0-0000-0000-000000000007') = 'tenue_complete',
    'l''attribution a été réécrite';
END $$;
SET LOCAL role authenticated;

DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000007';
  b constant uuid := '00000000-cab0-0000-0001-000000000002';
BEGIN
  ASSERT public.cabinet_niveau(u, b, 'compta') = 1, 'B abaissé en lecture, compta <> 1';
  ASSERT public.cabinet_niveau(u, b, 'grh') = 1, 'B abaissé en lecture, grh <> 1';
  ASSERT public.cabinet_niveau(u, b, 'factures') = 1, 'B abaissé en lecture, factures <> 1';
  ASSERT public.cabinet_societes('compta', 2) = '{}'::uuid[], 'B abaissé : cabinet_societes(compta, 2)';
END $$;

-- Le responsable suit aussi la mission abaissée.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000001',
                               '00000000-cab0-0000-0001-000000000002', 'compta') = 1,
    'responsable, B abaissé en lecture, compta <> 1';
END $$;

-- ─── Vigilance 4 : membre ou cabinet désactivé, effet immédiat ─────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000008","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000008',
                               '00000000-cab0-0000-0001-000000000001', 'compta') = 3,
    'membre avant désactivation, compta <> 3';
END $$;

RESET role;
UPDATE public.cabinet_membres SET actif = false WHERE user_id = '00000000-cab0-0000-0000-000000000008';
SET LOCAL role authenticated;

DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000008';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(u, a), 'membre désactivé : agit vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'membre désactivé, compta <> 0';
  ASSERT public.cabinet_niveau(u, a, 'dashboard') = 0, 'membre désactivé, dashboard <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'membre désactivé : cabinet_societes_agit';
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000009","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000009',
                               '00000000-cab0-0000-0001-000000000008', 'compta') = 3,
    'cabinet 3 avant désactivation, compta <> 3';
END $$;

RESET role;
UPDATE public.cabinets SET actif = false WHERE id = '00000000-cab0-0000-0002-000000000003';
SET LOCAL role authenticated;

DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000009';
  h constant uuid := '00000000-cab0-0000-0001-000000000008';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(u, h), 'cabinet désactivé : agit vrai';
  ASSERT public.cabinet_niveau(u, h, 'compta') = 0, 'cabinet désactivé, compta <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'cabinet désactivé : cabinet_societes_agit';
END $$;

-- ─── Vigilance 1 : accès direct et lien cabinet sur la même société ────────
-- L'accès direct prime : pas d'action comme cabinet ; est_personnel vraie par
-- le rôle habituel (comptable).
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000010","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000010';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(u, a), 'double accès : agit_comme_cabinet vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'double accès : cabinet_niveau <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'double accès : cabinet_societes_agit';
  ASSERT public.est_personnel(u, a), 'double accès : est_personnel faux';
END $$;

-- ─── Super-admin membre d'un cabinet : n'agit pas comme cabinet ────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000013","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000013';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT public.is_admin_general(u), 'fixture : super-admin attendu en aal2';
  ASSERT NOT public.agit_comme_cabinet(u, a), 'super-admin aal2 : agit_comme_cabinet vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'super-admin aal2 : cabinet_niveau <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'super-admin aal2 : cabinet_societes_agit';
  ASSERT public.cabinet_societes('compta', 1) = '{}'::uuid[], 'super-admin aal2 : cabinet_societes';
END $$;

-- Même compte sans 2FA (aal1) : n'agit pas non plus comme cabinet.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000013","role":"authenticated","aal":"aal1"}', true);
DO $$
BEGIN
  ASSERT NOT public.agit_comme_cabinet('00000000-cab0-0000-0000-000000000013',
                                       '00000000-cab0-0000-0001-000000000001'),
    'super-admin aal1 : agit_comme_cabinet vrai';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'super-admin aal1 : cabinet_societes_agit';
END $$;

-- Rôle super_admin (texte), en aal1 comme en aal2 : n'agit pas comme cabinet.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000014","role":"authenticated","aal":"aal1"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000014';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  IF 'super_admin' = ANY (enum_range(NULL::public.app_role)::text[]) THEN
    ASSERT NOT public.agit_comme_cabinet(u, a), 'super_admin aal1 : agit_comme_cabinet vrai';
    ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'super_admin aal1 : cabinet_niveau <> 0';
    ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'super_admin aal1 : cabinet_societes_agit';
    ASSERT public.cabinet_societes('compta', 1) = '{}'::uuid[], 'super_admin aal1 : cabinet_societes';
  ELSE
    -- Sans la valeur, le membre agit comme cabinet : la règle porte sur le rôle seul.
    ASSERT public.agit_comme_cabinet(u, a), 'membre sans rôle super-admin : agit faux';
  END IF;
END $$;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000014","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  IF 'super_admin' = ANY (enum_range(NULL::public.app_role)::text[]) THEN
    ASSERT NOT public.agit_comme_cabinet('00000000-cab0-0000-0000-000000000014',
                                         '00000000-cab0-0000-0001-000000000001'),
      'super_admin aal2 : agit_comme_cabinet vrai';
    ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'super_admin aal2 : cabinet_societes_agit';
  END IF;
END $$;

-- ─── Retrait d'une attribution : effet immédiat ────────────────────────────
RESET role;
DELETE FROM public.cabinet_attributions
WHERE dossier_id = '00000000-cab0-0000-0003-000000000001'
  AND user_id = '00000000-cab0-0000-0000-000000000002';
SET LOCAL role authenticated;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000002';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT NOT public.agit_comme_cabinet(u, a), 'attribution retirée : agit vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'attribution retirée, compta <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'attribution retirée : cabinet_societes_agit';
END $$;

-- ─── Société sans cabinet : est_personnel inchangée ─────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000011","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000011';
  d constant uuid := '00000000-cab0-0000-0001-000000000004';
BEGIN
  ASSERT public.est_personnel(u, d), 'comptable rattaché, sans cabinet : est_personnel faux';
  ASSERT NOT public.agit_comme_cabinet(u, d), 'comptable rattaché : agit vrai';
  ASSERT public.cabinet_niveau(u, d, 'compta') = 0, 'comptable rattaché : cabinet_niveau <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'comptable rattaché : cabinet_societes_agit';
  ASSERT public.cabinet_societes('compta', 1) = '{}'::uuid[], 'comptable rattaché : cabinet_societes';
END $$;

-- Employé seul (rôle employe) : pas du personnel.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000012","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT NOT public.est_personnel('00000000-cab0-0000-0000-000000000012',
                                  '00000000-cab0-0000-0001-000000000004'),
    'employé seul, sans cabinet : est_personnel vrai';
END $$;

-- ─── Rôle authenticated sans sub : traité comme un utilisateur inconnu ─────
SELECT set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  u constant uuid := '00000000-cab0-0000-0000-000000000001';
  a constant uuid := '00000000-cab0-0000-0001-000000000001';
BEGIN
  ASSERT auth.uid() IS NULL, 'fixture : auth.uid() attendu nul';
  ASSERT NOT public.agit_comme_cabinet(u, a), 'authenticated sans sub : agit vrai';
  ASSERT public.cabinet_niveau(u, a, 'compta') = 0, 'authenticated sans sub : cabinet_niveau <> 0';
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'authenticated sans sub : cabinet_societes_agit';
  ASSERT public.cabinet_societes('compta', 1) = '{}'::uuid[], 'authenticated sans sub : cabinet_societes';
END $$;

-- ─── Appel sans utilisateur (rôle postgres) : réponse réelle ───────────────
RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$
BEGIN
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000001',
                               '00000000-cab0-0000-0001-000000000001', 'compta') = 3,
    'appel service : responsable, A, compta <> 3';
  ASSERT public.cabinet_niveau('00000000-cab0-0000-0000-000000000003',
                               '00000000-cab0-0000-0001-000000000001', 'compta') = 2,
    'appel service : stagiaire, A, compta <> 2';
  ASSERT public.agit_comme_cabinet('00000000-cab0-0000-0000-000000000003',
                                   '00000000-cab0-0000-0001-000000000001'),
    'appel service : stagiaire attribué, A : agit faux';
  -- Sans utilisateur, les listes de l'appelant sont vides.
  ASSERT public.cabinet_societes_agit() = '{}'::uuid[], 'appel service : cabinet_societes_agit';
END $$;

DO $$ BEGIN RAISE NOTICE 'OK cabinet_droits'; END $$;
-- fin test
ROLLBACK;
