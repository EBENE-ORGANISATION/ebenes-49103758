BEGIN;
-- debut test
-- Test de la tâche 1 (espace cabinet) : types, contraintes, lecture des tables cabinet.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-cab0-) :
--   utilisateurs  …-0000-0000000000NN
--     01 responsable cabinet 1            02 collaborateur cabinet 1 (attribué sur A)
--     03 stagiaire cabinet 1 (attribué sur B)
--     04 collaborateur INACTIF cabinet 1 (attribué sur A)
--     05 responsable cabinet 2 (attribué sur le lien terminé A–cabinet 2)
--     06 administrateur de A              07 administrateur de C
--     08 super-admin (admin_general)      09 comptable de A (non admin)
--     10 responsable INACTIF cabinet 1    11 deuxième collaborateur cabinet 1 (attribué sur A)
--   sociétés      …-0001-0000000000NN : 01 A, 02 B, 03 C, 04 D (sans lien)
--   cabinets      …-0002-0000000000NN : 01 cabinet 1, 02 cabinet 2
--   liens         …-0003-0000000000NN :
--     01 A–cabinet 1 actif   02 B–cabinet 1 actif   03 C–cabinet 2 actif
--     04 A–cabinet 2 terminé (historique)
--   attributions : (01, 02) (01, 04) (01, 11) (02, 03) (04, 05)
--
-- Nombres attendus (cabinets / membres / dossiers / attributions) :
--   responsable 1        1 / 6 / 2 / 4     collaborateur 02   1 / 6 / 1 / 1
--   collaborateur 11     1 / 6 / 1 / 1     stagiaire 03       1 / 6 / 1 / 1
--   collaborateur inactif 04 : 0 / 1 / 0 / 0
--   responsable inactif 10   : 0 / 1 / 0 / 0
--   responsable 2        1 / 1 / 2 / 1     admin A            2 / 3 / 2 / 3
--   admin C              1 / 1 / 1 / 0     comptable A        0 / 0 / 0 / 0
--   super-admin aal2     2 / 7 / 4 / 5     super-admin aal1   0 / 0 / 0 / 0
--   cabinet 1 désactivé : responsable 1   0 / 1 / 0 / 0 ; admin A voit toujours le lien A

-- ─── Structure ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT enum_range(NULL::public.mission_cabinet)::text
    = '{tenue_complete,compta_fiscalite,paie_social,declarations,lecture}', 'mission_cabinet';
  ASSERT enum_range(NULL::public.role_cabinet)::text
    = '{responsable,collaborateur,stagiaire}', 'role_cabinet';
  ASSERT enum_range(NULL::public.etat_dossier_cabinet)::text
    = '{invitation,actif,depart_demande,termine}', 'etat_dossier_cabinet';
  ASSERT enum_range(NULL::public.origine_dossier_cabinet)::text
    = '{cabinet,client,super_admin}', 'origine_dossier_cabinet';

  ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class
          WHERE oid IN ('public.cabinets'::regclass, 'public.cabinet_membres'::regclass,
                        'public.cabinet_dossiers'::regclass, 'public.cabinet_attributions'::regclass)),
    'RLS non activée';
  ASSERT (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename IN ('cabinets', 'cabinet_membres', 'cabinet_dossiers', 'cabinet_attributions')
            AND cmd <> 'SELECT') = 0, 'règle d''écriture présente';

  -- has_table_privilege avec plusieurs droits répond « au moins un » : un appel par droit.
  ASSERT (SELECT bool_and(has_table_privilege('authenticated', t, p))
          FROM unnest(ARRAY['public.cabinets', 'public.cabinet_membres',
                            'public.cabinet_dossiers', 'public.cabinet_attributions']) AS t,
               unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p),
    'GRANT authenticated manquant';
  ASSERT NOT (SELECT bool_or(has_table_privilege('authenticated', t, p))
              FROM unnest(ARRAY['public.cabinets', 'public.cabinet_membres',
                                'public.cabinet_dossiers', 'public.cabinet_attributions']) AS t,
                   unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p),
    'authenticated a TRUNCATE, REFERENCES ou TRIGGER';
  ASSERT NOT (SELECT bool_or(has_table_privilege('anon', t, p))
              FROM unnest(ARRAY['public.cabinets', 'public.cabinet_membres',
                                'public.cabinet_dossiers', 'public.cabinet_attributions']) AS t,
                   unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p),
    'anon a un droit sur une table cabinet';
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
  ('00000000-cab0-0000-0000-000000000001', 'cab0-resp1@exemple.invalid',   'Responsable 1'),
  ('00000000-cab0-0000-0000-000000000002', 'cab0-coll1@exemple.invalid',   'Collaborateur 1'),
  ('00000000-cab0-0000-0000-000000000003', 'cab0-stag1@exemple.invalid',   'Stagiaire 1'),
  ('00000000-cab0-0000-0000-000000000004', 'cab0-inact1@exemple.invalid',  'Inactif 1'),
  ('00000000-cab0-0000-0000-000000000005', 'cab0-resp2@exemple.invalid',   'Responsable 2'),
  ('00000000-cab0-0000-0000-000000000006', 'cab0-adma@exemple.invalid',    'Admin A'),
  ('00000000-cab0-0000-0000-000000000007', 'cab0-admc@exemple.invalid',    'Admin C'),
  ('00000000-cab0-0000-0000-000000000008', 'cab0-super@exemple.invalid',   'Super admin'),
  ('00000000-cab0-0000-0000-000000000009', 'cab0-compta@exemple.invalid',  'Comptable A'),
  ('00000000-cab0-0000-0000-000000000010', 'cab0-respin1@exemple.invalid', 'Responsable inactif 1'),
  ('00000000-cab0-0000-0000-000000000011', 'cab0-coll2@exemple.invalid',   'Collaborateur 2')
) AS u(id, email, nom);

-- Le trigger handle_new_societe crée societe_config et les services intégrés.
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-cab0-0000-0001-000000000001', 'CAB0 TEST A'),
  ('00000000-cab0-0000-0001-000000000002', 'CAB0 TEST B'),
  ('00000000-cab0-0000-0001-000000000003', 'CAB0 TEST C'),
  ('00000000-cab0-0000-0001-000000000004', 'CAB0 TEST D');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-cab0-0000-0000-000000000006', '00000000-cab0-0000-0001-000000000001'),
  ('00000000-cab0-0000-0000-000000000007', '00000000-cab0-0000-0001-000000000003'),
  ('00000000-cab0-0000-0000-000000000009', '00000000-cab0-0000-0001-000000000001');

-- user_roles : le trigger trg_bloquer_role_super_admin refuse admin_general
-- hors service_role / postgres / supabase_admin. On passe explicitement par
-- service_role le temps de l'insertion (postgres passerait aussi).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-cab0-0000-0000-000000000006', 'admin'::public.app_role),
  ('00000000-cab0-0000-0000-000000000007', 'admin'::public.app_role),
  ('00000000-cab0-0000-0000-000000000008', 'admin_general'::public.app_role),
  ('00000000-cab0-0000-0000-000000000009', 'comptable'::public.app_role);
RESET role;

INSERT INTO public.cabinets (id, nom) VALUES
  ('00000000-cab0-0000-0002-000000000001', 'CAB0 Cabinet 1'),
  ('00000000-cab0-0000-0002-000000000002', 'CAB0 Cabinet 2');

INSERT INTO public.cabinet_membres (cabinet_id, user_id, role, actif) VALUES
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000001', 'responsable',   true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000002', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000003', 'stagiaire',     true),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000004', 'collaborateur', false),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000010', 'responsable',   false),
  ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0000-000000000011', 'collaborateur', true),
  ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0000-000000000005', 'responsable',   true);

INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine, termine_le) VALUES
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000001', 'tenue_complete',   'actif',   'cabinet',     NULL),
  ('00000000-cab0-0000-0003-000000000002', '00000000-cab0-0000-0002-000000000001',
   '00000000-cab0-0000-0001-000000000002', 'compta_fiscalite', 'actif',   'super_admin', NULL),
  ('00000000-cab0-0000-0003-000000000003', '00000000-cab0-0000-0002-000000000002',
   '00000000-cab0-0000-0001-000000000003', 'paie_social',      'actif',   'client',      NULL),
  ('00000000-cab0-0000-0003-000000000004', '00000000-cab0-0000-0002-000000000002',
   '00000000-cab0-0000-0001-000000000001', 'lecture',          'termine', 'client',      now());

INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission) VALUES
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000002', 'compta_fiscalite'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000004', 'lecture'),
  ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000011', 'lecture'),
  ('00000000-cab0-0000-0003-000000000002', '00000000-cab0-0000-0000-000000000003', 'lecture'),
  ('00000000-cab0-0000-0003-000000000004', '00000000-cab0-0000-0000-000000000005', 'lecture');

DO $$
BEGIN
  ASSERT (SELECT max_dossiers FROM public.cabinets WHERE id = '00000000-cab0-0000-0002-000000000001') = 10,
    'max_dossiers par défaut';
END $$;

-- ─── Lectures en sessions simulées ──────────────────────────────────────────
-- Pour les utilisateurs de test, on compte toutes les lignes visibles (sans
-- filtre) : ils n'ont aucun lien avec des données réelles, donc tout
-- dépassement signale une fuite hors de leur périmètre.
SET LOCAL role authenticated;

-- Responsable 1 : son cabinet, toute l'équipe (6), ses 2 dossiers, leurs 4 attributions.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 6, 2, 4), format('responsable 1 : %s %s %s %s', c, m, d, a);
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_dossiers
                     WHERE cabinet_id <> '00000000-cab0-0000-0002-000000000001'),
    'responsable 1 voit un dossier d''un autre cabinet';

  -- Les fonctions d'aide ne portent que sur l'appelant.
  ASSERT public.cabinet_du_membre('00000000-cab0-0000-0000-000000000001')
         = '00000000-cab0-0000-0002-000000000001', 'cabinet_du_membre sur soi';
  ASSERT public.cabinet_du_membre('00000000-cab0-0000-0000-000000000005') IS NULL,
    'cabinet_du_membre renseigne sur un autre utilisateur';
  ASSERT NOT public.cabinet_lit_dossier('00000000-cab0-0000-0000-000000000008',
                                        '00000000-cab0-0000-0003-000000000001'),
    'cabinet_lit_dossier renseigne sur un autre utilisateur';
END $$;

-- Collaborateur 02 : son cabinet et son équipe, seulement le dossier A et sa
-- propre attribution (pas celles de 04 et 11 sur A) ; ni B ni C.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 6, 1, 1), format('collaborateur 02 : %s %s %s %s', c, m, d, a);
  ASSERT (SELECT id FROM public.cabinet_dossiers) = '00000000-cab0-0000-0003-000000000001',
    'collaborateur 02 : mauvais dossier';
  ASSERT (SELECT user_id FROM public.cabinet_attributions) = '00000000-cab0-0000-0000-000000000002',
    'collaborateur 02 voit l''attribution d''un autre';
END $$;

-- Collaborateur 11 : même périmètre, sa propre attribution seulement.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000011","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 6, 1, 1), format('collaborateur 11 : %s %s %s %s', c, m, d, a);
  ASSERT (SELECT user_id FROM public.cabinet_attributions) = '00000000-cab0-0000-0000-000000000011',
    'collaborateur 11 voit l''attribution d''un autre';
END $$;

-- Stagiaire 03 : le dossier B seulement, son attribution.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 6, 1, 1), format('stagiaire 03 : %s %s %s %s', c, m, d, a);
  ASSERT (SELECT id FROM public.cabinet_dossiers) = '00000000-cab0-0000-0003-000000000002',
    'stagiaire 03 : mauvais dossier';
END $$;

-- Collaborateur inactif 04 (attribué sur A) : sa propre ligne seulement.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000004","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (0, 1, 0, 0), format('collaborateur inactif 04 : %s %s %s %s', c, m, d, a);
END $$;

-- Responsable inactif 10 : sa propre ligne seulement.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000010","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (0, 1, 0, 0), format('responsable inactif 10 : %s %s %s %s', c, m, d, a);
END $$;

-- Responsable 2 : cabinet 2, son équipe, C et le lien terminé sur A, avec
-- l'attribution de ce lien terminé.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000005","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 1, 2, 1), format('responsable 2 : %s %s %s %s', c, m, d, a);
  ASSERT (SELECT dossier_id FROM public.cabinet_attributions) = '00000000-cab0-0000-0003-000000000004',
    'responsable 2 : attribution du lien terminé absente';
END $$;

-- Administrateur de A : les liens de A (en cours et terminé), les deux
-- cabinets concernés ; les membres ACTIFS ayant accès au lien en cours
-- (responsable 01, collaborateurs 02 et 11) ; les 3 attributions du lien en
-- cours, pas celle du lien terminé. Rien sur B ni C.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000006","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (2, 3, 2, 3), format('admin A : %s %s %s %s', c, m, d, a);
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_dossiers
                     WHERE societe_id <> '00000000-cab0-0000-0001-000000000001'),
    'admin A voit le lien d''une autre société';
  ASSERT NOT EXISTS (SELECT 1 FROM public.cabinet_attributions
                     WHERE dossier_id = '00000000-cab0-0000-0003-000000000004'),
    'admin A voit une attribution du lien terminé';
END $$;

-- Administrateur de C : le lien de C, le cabinet 2 et son responsable.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000007","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (1, 1, 1, 0), format('admin C : %s %s %s %s', c, m, d, a);
END $$;

-- Comptable de A (non administrateur) : rien.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000009","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (0, 0, 0, 0), format('comptable A : %s %s %s %s', c, m, d, a);
END $$;

-- Super-admin en aal2 : toutes les fixtures (filtre sur le préfixe, la
-- production pouvant contenir d'autres cabinets).
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000008","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets WHERE id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO m FROM public.cabinet_membres WHERE cabinet_id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO d FROM public.cabinet_dossiers WHERE id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO a FROM public.cabinet_attributions WHERE dossier_id::text LIKE '00000000-cab0-%';
  ASSERT (c, m, d, a) = (2, 7, 4, 5), format('super-admin aal2 : %s %s %s %s', c, m, d, a);
END $$;

-- Super-admin sans 2FA (aal1) : is_admin_general est faux, il ne voit rien.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000008","role":"authenticated","aal":"aal1"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets WHERE id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO m FROM public.cabinet_membres WHERE cabinet_id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO d FROM public.cabinet_dossiers WHERE id::text LIKE '00000000-cab0-%';
  SELECT count(*) INTO a FROM public.cabinet_attributions WHERE dossier_id::text LIKE '00000000-cab0-%';
  ASSERT (c, m, d, a) = (0, 0, 0, 0), format('super-admin aal1 : %s %s %s %s', c, m, d, a);
END $$;

-- ─── Écriture directe refusée ───────────────────────────────────────────────
-- Responsable 1 : INSERT refusé par RLS (et non par absence de GRANT),
-- UPDATE et DELETE sans effet.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
    VALUES ('00000000-cab0-0000-0002-000000000001', '00000000-cab0-0000-0001-000000000004',
            'lecture', 'actif', 'cabinet');
    RAISE EXCEPTION 'ECHEC : INSERT direct accepté dans cabinet_dossiers';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE '%row-level security%', 'refus inattendu : ' || SQLERRM;
  END;

  BEGIN
    INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission)
    VALUES ('00000000-cab0-0000-0003-000000000002', '00000000-cab0-0000-0000-000000000002', 'lecture');
    RAISE EXCEPTION 'ECHEC : INSERT direct accepté dans cabinet_attributions';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE '%row-level security%', 'refus inattendu : ' || SQLERRM;
  END;

  UPDATE public.cabinets SET max_dossiers = 99 WHERE id = '00000000-cab0-0000-0002-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'UPDATE direct de cabinets accepté';

  DELETE FROM public.cabinet_membres WHERE user_id = '00000000-cab0-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'DELETE direct de cabinet_membres accepté';
END $$;

-- Super-admin : pas d'écriture directe non plus (tout passe par les fonctions).
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000008","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.cabinets (nom) VALUES ('CAB0 direct');
    RAISE EXCEPTION 'ECHEC : INSERT direct accepté dans cabinets (super-admin)';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE '%row-level security%', 'refus inattendu : ' || SQLERRM;
  END;

  UPDATE public.cabinet_dossiers SET etat = 'termine' WHERE id = '00000000-cab0-0000-0003-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'UPDATE direct de cabinet_dossiers accepté (super-admin)';
END $$;

-- ─── Cabinet désactivé (cas placé en fin : le cabinet 1 reste inactif) ─────
RESET role;
UPDATE public.cabinets SET actif = false WHERE id = '00000000-cab0-0000-0002-000000000001';
SET LOCAL role authenticated;

-- Responsable 1 : plus rien, sauf sa propre ligne de membre.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE c int; m int; d int; a int;
BEGIN
  SELECT count(*) INTO c FROM public.cabinets;
  SELECT count(*) INTO m FROM public.cabinet_membres;
  SELECT count(*) INTO d FROM public.cabinet_dossiers;
  SELECT count(*) INTO a FROM public.cabinet_attributions;
  ASSERT (c, m, d, a) = (0, 1, 0, 0), format('responsable 1, cabinet désactivé : %s %s %s %s', c, m, d, a);
  ASSERT (SELECT user_id FROM public.cabinet_membres) = '00000000-cab0-0000-0000-000000000001',
    'responsable 1, cabinet désactivé : mauvaise ligne de membre';
END $$;

-- Administrateur de A : voit toujours le lien de A.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab0-0000-0000-000000000006","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers
                 WHERE id = '00000000-cab0-0000-0003-000000000001'),
    'admin A ne voit plus le lien de A après désactivation du cabinet';
END $$;

RESET role;
SELECT set_config('request.jwt.claims', '', true);

-- ─── Contraintes d'unicité (en postgres) ────────────────────────────────────
DO $$
BEGIN
  -- Deuxième lien non terminé sur A (actif) : refusé.
  BEGIN
    INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
    VALUES ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0001-000000000001',
            'lecture', 'actif', 'client');
    RAISE EXCEPTION 'ECHEC : deux liens actifs sur la même société';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Une invitation compte aussi comme lien en cours : refusée.
  BEGIN
    INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine)
    VALUES ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0001-000000000001',
            'lecture', 'invitation', 'client');
    RAISE EXCEPTION 'ECHEC : invitation acceptée malgré un lien actif';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Un deuxième lien terminé reste permis (historique).
  INSERT INTO public.cabinet_dossiers (cabinet_id, societe_id, mission, etat, origine, termine_le)
  VALUES ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0001-000000000001',
          'lecture', 'termine', 'client', now());

  -- Un utilisateur dans deux cabinets : refusé.
  BEGIN
    INSERT INTO public.cabinet_membres (cabinet_id, user_id, role)
    VALUES ('00000000-cab0-0000-0002-000000000002', '00000000-cab0-0000-0000-000000000002', 'collaborateur');
    RAISE EXCEPTION 'ECHEC : un utilisateur dans deux cabinets';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Deux attributions pour le même couple (dossier, utilisateur) : refusé.
  BEGIN
    INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission)
    VALUES ('00000000-cab0-0000-0003-000000000001', '00000000-cab0-0000-0000-000000000002', 'lecture');
    RAISE EXCEPTION 'ECHEC : attribution en double';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

DO $$ BEGIN RAISE NOTICE 'OK cabinet_schema'; END $$;
-- fin test
ROLLBACK;
