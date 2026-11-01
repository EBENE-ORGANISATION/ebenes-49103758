BEGIN;
-- debut test
-- À concaténer après la migration 20261101120000, dans la même transaction.
DO $$
BEGIN
  ASSERT (SELECT prosecdef AND proconfig::text LIKE '%search_path=public%'
    FROM pg_proc WHERE oid = 'public.cabinet_equipe(uuid)'::regprocedure), 'Fonction non sécurisée';
  ASSERT NOT has_function_privilege('anon', 'public.cabinet_equipe(uuid)', 'EXECUTE'), 'Accès anon';
  ASSERT has_function_privilege('authenticated', 'public.cabinet_equipe(uuid)', 'EXECUTE'), 'Accès authenticated manquant';
  ASSERT has_function_privilege('service_role', 'public.cabinet_equipe(uuid)', 'EXECUTE'), 'Accès service_role manquant';
END $$;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('00000000-cab9-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 'cab9-' || i || '@exemple.invalid', '{}', jsonb_build_object('nom', 'Équipier ' || i), now(), now(), now()
FROM generate_series(1,7) i;
UPDATE auth.users SET last_sign_in_at = now() WHERE id = '00000000-cab9-0000-0000-000000000003';
INSERT INTO public.user_roles(user_id, role) VALUES ('00000000-cab9-0000-0000-000000000001','admin_general');
INSERT INTO public.cabinets(id,nom) VALUES
 ('00000000-cab9-0002-0000-000000000001','Cabinet équipe TEST'),
 ('00000000-cab9-0002-0000-000000000002','Autre cabinet TEST');
INSERT INTO public.cabinet_membres(cabinet_id,user_id,role,actif) VALUES
 ('00000000-cab9-0002-0000-000000000001','00000000-cab9-0000-0000-000000000002','responsable',true),
 ('00000000-cab9-0002-0000-000000000001','00000000-cab9-0000-0000-000000000003','collaborateur',true),
 ('00000000-cab9-0002-0000-000000000001','00000000-cab9-0000-0000-000000000004','stagiaire',true),
 ('00000000-cab9-0002-0000-000000000001','00000000-cab9-0000-0000-000000000005','collaborateur',false),
 ('00000000-cab9-0002-0000-000000000002','00000000-cab9-0000-0000-000000000006','responsable',true);

CREATE FUNCTION pg_temp.cab9_verifier(_numero int, _aal text, _cabinet uuid, _mode text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE lignes jsonb; refus boolean := false;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',
    '00000000-cab9-0000-0000-' || lpad(_numero::text,12,'0'), 'role','authenticated','aal',_aal)::text, true);
  BEGIN
    SELECT jsonb_agg(to_jsonb(e)) INTO lignes FROM public.cabinet_equipe(_cabinet) e;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'CABINET_INTERDIT:%' THEN RAISE; END IF;
    refus := true;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  IF _mode = 'refus' THEN
    ASSERT refus, 'Appel interdit accepté';
  ELSE
    ASSERT NOT refus, 'Lecture autorisée refusée';
    ASSERT jsonb_array_length(lignes) = 4, 'Équipe incomplète ou autre cabinet visible';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(lignes) e WHERE e->>'nom' IS NULL OR e->>'nom' = ''), 'Nom absent';
    IF _mode = 'complet' THEN
      ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(lignes) e WHERE e->>'email' IS NULL OR e->>'deja_connecte' IS NULL), 'Champs de gestion absents';
      ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(lignes) e WHERE e->>'user_id' = '00000000-cab9-0000-0000-000000000003' AND (e->>'deja_connecte')::boolean), 'Connexion non détectée';
    ELSE
      ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(lignes) e WHERE e->>'email' IS NOT NULL OR e->>'deja_connecte' IS NOT NULL), 'Données privées révélées';
    END IF;
  END IF;
END $$;
SELECT pg_temp.cab9_verifier(1,'aal2','00000000-cab9-0002-0000-000000000001','complet');
SELECT pg_temp.cab9_verifier(1,'aal1','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(2,'aal1','00000000-cab9-0002-0000-000000000001','complet');
SELECT pg_temp.cab9_verifier(3,'aal1','00000000-cab9-0002-0000-000000000001','limite');
SELECT pg_temp.cab9_verifier(4,'aal1','00000000-cab9-0002-0000-000000000001','limite');
SELECT pg_temp.cab9_verifier(5,'aal2','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(6,'aal2','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(7,'aal2','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(2,'aal2','00000000-cab9-0002-0000-000000000099','refus');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE refus boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.cabinet_equipe('00000000-cab9-0002-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN refus := true;
  END;
  ASSERT refus, 'Appel sans utilisateur accepté';
END $$;
SET LOCAL ROLE NONE;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinets SET actif = false WHERE id = '00000000-cab9-0002-0000-000000000001';
SELECT pg_temp.cab9_verifier(2,'aal2','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(3,'aal2','00000000-cab9-0002-0000-000000000001','refus');
SELECT pg_temp.cab9_verifier(1,'aal2','00000000-cab9-0002-0000-000000000001','complet');
DO $$ BEGIN RAISE NOTICE 'OK cabinet_equipe'; END $$;
-- fin test
ROLLBACK;
