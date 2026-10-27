BEGIN;
-- debut test
-- Test de la migration 20261027130000_securite_rls_admin_societe.sql
-- (relecture sécurité du 27/10/2026, trois défauts antérieurs au chantier cabinet) :
--   1. custom_services, custom_postes, user_custom_postes : écriture réservée
--      aux administrateurs de la société (avant : tout membre, employé compris) ;
--   2. audit_log : insertion limitée à soi-même, avec son e-mail, pour une
--      société à laquelle on a accès (avant : n'importe quelle société) ;
--   3. alertes_lues : un administrateur ne lit que les alertes de ses sociétés
--      (avant : toutes les sociétés, le rôle admin étant global).
-- Avant la migration, le test échoue et affiche la mesure (les défauts) ;
-- après, il passe.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-5ec0-) :
--   utilisateurs  …-0000-0000000000NN
--     01 ADA administrateur de A
--     02 EMP employé seul de A (rôle employe)
--     03 ADB administrateur de B seulement
--     04 CPT membre comptable de A (rôle membre_compta)
--     05 employé de B seulement (cible d'une affectation hors société)
--   sociétés      …-0001-0000000000NN : 01 A, 02 B
--   services perso …-0005-0000000000NN : 01 de A, 02 de B
--   postes perso   …-0006-0000000000NN : 01 de A, 02 de B
--   user_custom_postes : EMP sur le poste de A
--   alertes_lues : EMP dans A, 05 dans B
--
-- Mesure, une ligne par cas : utilisateur|cas|résultat, où résultat est un
-- nombre de lignes (lecture, UPDATE neutre, DELETE), « ok » pour un INSERT
-- accepté, ou le SQLSTATE de l'erreur. Toutes les sondes d'écriture sont
-- annulées aussitôt (sous-transaction).

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-5ec0-0000-0000-000000000001', 'secrls-adm-a@exemple.invalid', 'Administrateur A'),
  ('00000000-5ec0-0000-0000-000000000002', 'secrls-emp-a@exemple.invalid', 'Employé A'),
  ('00000000-5ec0-0000-0000-000000000003', 'secrls-adm-b@exemple.invalid', 'Administrateur B'),
  ('00000000-5ec0-0000-0000-000000000004', 'secrls-cpt-a@exemple.invalid', 'Comptable A'),
  ('00000000-5ec0-0000-0000-000000000005', 'secrls-emp-b@exemple.invalid', 'Employé B')
) AS u(id, email, nom);

INSERT INTO public.societes (id, nom) VALUES
  ('00000000-5ec0-0000-0001-000000000001', 'SECRLS TEST A'),
  ('00000000-5ec0-0000-0001-000000000002', 'SECRLS TEST B');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-5ec0-0000-0000-000000000001', '00000000-5ec0-0000-0001-000000000001'),
  ('00000000-5ec0-0000-0000-000000000002', '00000000-5ec0-0000-0001-000000000001'),
  ('00000000-5ec0-0000-0000-000000000003', '00000000-5ec0-0000-0001-000000000002'),
  ('00000000-5ec0-0000-0000-000000000004', '00000000-5ec0-0000-0001-000000000001'),
  ('00000000-5ec0-0000-0000-000000000005', '00000000-5ec0-0000-0001-000000000002');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-5ec0-0000-0000-000000000001', 'admin'::public.app_role),
  ('00000000-5ec0-0000-0000-000000000002', 'employe'::public.app_role),
  ('00000000-5ec0-0000-0000-000000000003', 'admin'::public.app_role),
  ('00000000-5ec0-0000-0000-000000000004', 'membre_compta'::public.app_role),
  ('00000000-5ec0-0000-0000-000000000005', 'employe'::public.app_role);
RESET role;

INSERT INTO public.custom_services (id, societe_id, code, nom) VALUES
  ('00000000-5ec0-0000-0005-000000000001', '00000000-5ec0-0000-0001-000000000001', 'secrls', 'SECRLS service A'),
  ('00000000-5ec0-0000-0005-000000000002', '00000000-5ec0-0000-0001-000000000002', 'secrls', 'SECRLS service B');
INSERT INTO public.custom_postes (id, service_id, nom, niveau) VALUES
  ('00000000-5ec0-0000-0006-000000000001', '00000000-5ec0-0000-0005-000000000001', 'SECRLS poste A', 'membre'),
  ('00000000-5ec0-0000-0006-000000000002', '00000000-5ec0-0000-0005-000000000002', 'SECRLS poste B', 'membre');
INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES
  ('00000000-5ec0-0000-0000-000000000002', '00000000-5ec0-0000-0006-000000000001', '00000000-5ec0-0000-0001-000000000001');
INSERT INTO public.alertes_lues (user_id, societe_id, alerte_id) VALUES
  ('00000000-5ec0-0000-0000-000000000002', '00000000-5ec0-0000-0001-000000000001', 'secrls-alerte'),
  ('00000000-5ec0-0000-0000-000000000005', '00000000-5ec0-0000-0001-000000000002', 'secrls-alerte');

-- ─── Mesure ─────────────────────────────────────────────────────────────────
-- Fonction temporaire (disparaît avec la transaction), appelée en postgres :
-- elle prend la session de chaque utilisateur (SET LOCAL ROLE authenticated
-- et request.jwt.claims), puis revient en postgres.
CREATE FUNCTION pg_temp.secrls_mesure()
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  a  constant text := '00000000-5ec0-0000-0001-000000000001';
  b  constant text := '00000000-5ec0-0000-0001-000000000002';
  sa constant text := '00000000-5ec0-0000-0005-000000000001';
  pa constant text := '00000000-5ec0-0000-0006-000000000001';
  pb constant text := '00000000-5ec0-0000-0006-000000000002';
  u record;
  p record;
  n bigint;
  v text;
  res text := '';
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('ADA', '00000000-5ec0-0000-0000-000000000001', 'secrls-adm-a@exemple.invalid'),
      ('EMP', '00000000-5ec0-0000-0000-000000000002', 'secrls-emp-a@exemple.invalid'),
      ('ADB', '00000000-5ec0-0000-0000-000000000003', 'secrls-adm-b@exemple.invalid'),
      ('CPT', '00000000-5ec0-0000-0000-000000000004', 'secrls-cpt-a@exemple.invalid')
    ) AS t(lib, id, email)
  LOOP
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated","aal":"aal2","email":"%s"}', u.id, u.email), true);

    -- (cas, requête) ; une requête SELECT count(*) renvoie un nombre.
    FOR p IN
      SELECT * FROM (VALUES
        -- 1. Postes personnalisés de A.
        ('cs_lire',   format('SELECT count(*) FROM public.custom_services WHERE id = %L', sa)),
        ('cs_maj',    format('UPDATE public.custom_services SET nom = nom WHERE id = %L', sa)),
        ('cs_ajout',  format('INSERT INTO public.custom_services (societe_id, code, nom) VALUES (%L, ''secrls2'', ''SECRLS sonde'')', a)),
        ('cs_suppr',  format('DELETE FROM public.custom_services WHERE id = %L', sa)),
        ('cp_lire',   format('SELECT count(*) FROM public.custom_postes WHERE id = %L', pa)),
        ('cp_maj',    format('UPDATE public.custom_postes SET niveau = ''chef'' WHERE id = %L', pa)),
        ('cp_ajout',  format('INSERT INTO public.custom_postes (service_id, nom, niveau) VALUES (%L, ''SECRLS sonde'', ''chef'')', sa)),
        ('cp_suppr',  format('DELETE FROM public.custom_postes WHERE id = %L', pa)),
        ('ucp_lire',  format('SELECT count(*) FROM public.user_custom_postes WHERE societe_id = %L', a)),
        ('ucp_maj',   format('UPDATE public.user_custom_postes SET societe_id = societe_id WHERE societe_id = %L', a)),
        ('ucp_ajout', format('INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES (''00000000-5ec0-0000-0000-000000000004'', %L, %L)', pa, a)),
        ('ucp_suppr', format('DELETE FROM public.user_custom_postes WHERE societe_id = %L', a)),
        -- Affectation incohérente : poste de B dans A, ou utilisateur hors de A.
        ('ucp_poste_autre_soc', format('INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES (''00000000-5ec0-0000-0000-000000000004'', %L, %L)', pb, a)),
        ('ucp_user_hors_soc',   format('INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES (''00000000-5ec0-0000-0000-000000000005'', %L, %L)', pa, a)),
        -- 2. Journal d'audit.
        ('audit_soc_a',    format('INSERT INTO public.audit_log (user_id, user_email, action, table_name, societe_id) VALUES (%L, %L, ''UPDATE'', ''secrls'', %L)', u.id, u.email, a)),
        ('audit_soc_b',    format('INSERT INTO public.audit_log (user_id, user_email, action, table_name, societe_id) VALUES (%L, %L, ''UPDATE'', ''secrls'', %L)', u.id, u.email, b)),
        ('audit_sans_soc', format('INSERT INTO public.audit_log (user_id, user_email, action, table_name) VALUES (%L, %L, ''UPDATE'', ''secrls'')', u.id, u.email)),
        ('audit_autre_user', format('INSERT INTO public.audit_log (user_id, user_email, action, table_name, societe_id) VALUES (''00000000-5ec0-0000-0000-000000000005'', %L, ''UPDATE'', ''secrls'', %L)', u.email, a)),
        ('audit_faux_email', format('INSERT INTO public.audit_log (user_id, user_email, action, table_name, societe_id) VALUES (%L, ''autre@exemple.invalid'', ''UPDATE'', ''secrls'', %L)', u.id, a)),
        -- 3. Alertes lues.
        ('alertes_a', format('SELECT count(*) FROM public.alertes_lues WHERE societe_id = %L AND alerte_id = ''secrls-alerte''', a)),
        ('alertes_b', format('SELECT count(*) FROM public.alertes_lues WHERE societe_id = %L AND alerte_id = ''secrls-alerte''', b))
      ) AS t(cas, sql)
    LOOP
      BEGIN
        BEGIN
          IF p.sql LIKE 'SELECT%' THEN
            EXECUTE p.sql INTO n;
            v := n::text;
          ELSIF p.sql LIKE 'INSERT%' THEN
            EXECUTE p.sql;
            v := 'ok';
          ELSE
            EXECUTE p.sql;
            GET DIAGNOSTICS n = ROW_COUNT;
            v := n::text;
          END IF;
        EXCEPTION WHEN OTHERS THEN v := SQLSTATE;
        END;
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
      EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      END;
      res := res || format('%s|%s|%s', u.lib, p.cas, v) || E'\n';
    END LOOP;

    EXECUTE 'SET LOCAL ROLE NONE';
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;
  RETURN res;
END
$f$;

SELECT set_config('secrls.m', pg_temp.secrls_mesure(), true);

-- ─── Vérifications ──────────────────────────────────────────────────────────
DO $$
DECLARE
  m constant text[] := array_remove(string_to_array(current_setting('secrls.m'), E'\n'), '');
  attendu text[] := '{}';
  lib text;
  ecart text;
BEGIN
  -- Employé et comptable de A : lecture seule des postes personnalisés.
  FOREACH lib IN ARRAY ARRAY['EMP', 'CPT'] LOOP
    attendu := attendu || ARRAY[
      lib || '|cs_lire|1',   lib || '|cs_maj|0',   lib || '|cs_ajout|42501',  lib || '|cs_suppr|0',
      lib || '|cp_lire|1',   lib || '|cp_maj|0',   lib || '|cp_ajout|42501',  lib || '|cp_suppr|0',
      lib || '|ucp_lire|1',  lib || '|ucp_maj|0',  lib || '|ucp_ajout|42501', lib || '|ucp_suppr|0',
      lib || '|ucp_poste_autre_soc|42501', lib || '|ucp_user_hors_soc|42501',
      -- Audit : pour soi, dans sa société, avec son e-mail.
      lib || '|audit_soc_a|ok', lib || '|audit_soc_b|42501', lib || '|audit_sans_soc|42501',
      lib || '|audit_autre_user|42501', lib || '|audit_faux_email|42501',
      -- Alertes : les siennes seulement.
      lib || '|alertes_b|0'
    ];
  END LOOP;
  attendu := attendu || ARRAY['EMP|alertes_a|1', 'CPT|alertes_a|0'];

  attendu := attendu || ARRAY[
    -- Administrateur de A : tout sur A, sauf les affectations incohérentes.
    'ADA|cs_lire|1',   'ADA|cs_maj|1',   'ADA|cs_ajout|ok',  'ADA|cs_suppr|1',
    'ADA|cp_lire|1',   'ADA|cp_maj|1',   'ADA|cp_ajout|ok',  'ADA|cp_suppr|1',
    'ADA|ucp_lire|1',  'ADA|ucp_maj|1',  'ADA|ucp_ajout|ok', 'ADA|ucp_suppr|1',
    'ADA|ucp_poste_autre_soc|42501', 'ADA|ucp_user_hors_soc|42501',
    'ADA|audit_soc_a|ok', 'ADA|audit_soc_b|42501', 'ADA|audit_sans_soc|42501',
    'ADA|audit_autre_user|42501', 'ADA|audit_faux_email|42501',
    'ADA|alertes_a|1', 'ADA|alertes_b|0',
    -- Administrateur de B seulement : rien sur A.
    'ADB|cs_lire|0',   'ADB|cs_maj|0',   'ADB|cs_ajout|42501',  'ADB|cs_suppr|0',
    'ADB|cp_lire|0',   'ADB|cp_maj|0',   'ADB|cp_ajout|42501',  'ADB|cp_suppr|0',
    'ADB|ucp_lire|0',  'ADB|ucp_maj|0',  'ADB|ucp_ajout|42501', 'ADB|ucp_suppr|0',
    'ADB|ucp_poste_autre_soc|42501', 'ADB|ucp_user_hors_soc|42501',
    'ADB|audit_soc_a|42501', 'ADB|audit_soc_b|ok', 'ADB|audit_sans_soc|42501',
    'ADB|audit_autre_user|42501', 'ADB|audit_faux_email|42501',
    'ADB|alertes_a|0', 'ADB|alertes_b|1'
  ];

  SELECT string_agg(l, E'\n' ORDER BY l) INTO ecart FROM (
    (SELECT 'mesuré  ' || x AS l FROM (SELECT unnest(m) AS x EXCEPT SELECT unnest(attendu)) y)
    UNION ALL
    (SELECT 'attendu ' || x FROM (SELECT unnest(attendu) AS x EXCEPT SELECT unnest(m)) y)
  ) z;
  ASSERT ecart IS NULL, E'securite_rls_admin_societe : écart avec les résultats attendus :\n' || ecart;
  ASSERT cardinality(m) = cardinality(attendu), 'securite_rls_admin_societe : nombre de mesures';
END $$;

DO $$ BEGIN RAISE NOTICE 'OK securite_rls_admin_societe'; END $$;
-- fin test
ROLLBACK;
