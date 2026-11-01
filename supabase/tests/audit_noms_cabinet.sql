BEGIN;
-- debut test
-- À concaténer après 20261101131000, dans la même transaction.
DO $$
BEGIN
  ASSERT (SELECT prosecdef AND proconfig::text LIKE '%search_path=public%'
    FROM pg_proc WHERE oid = 'public.audit_noms_cabinet(uuid)'::regprocedure), 'Fonction non sécurisée';
  ASSERT NOT has_function_privilege('anon', 'public.audit_noms_cabinet(uuid)', 'EXECUTE'), 'Accès anon';
  ASSERT has_function_privilege('authenticated', 'public.audit_noms_cabinet(uuid)', 'EXECUTE'), 'Accès authenticated manquant';
END $$;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('00000000-ca10-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 'ca10-' || i || '@exemple.invalid', '{}', jsonb_build_object('nom', 'Auteur TEST ' || i), now(), now(), now()
FROM generate_series(1,6) i;
UPDATE public.profiles SET nom = 'Ancien collaborateur TEST'
WHERE user_id = '00000000-ca10-0000-0000-000000000004';
INSERT INTO public.user_roles(user_id,role) VALUES
 ('00000000-ca10-0000-0000-000000000001','admin'),
 ('00000000-ca10-0000-0000-000000000003','admin'),
 ('00000000-ca10-0000-0000-000000000006','admin_general');
INSERT INTO public.societes(id,nom,slug) VALUES
 ('00000000-ca10-0001-0000-000000000001','Audit cabinet TEST','ca10-audit-1'),
 ('00000000-ca10-0001-0000-000000000002','Audit autre TEST','ca10-audit-2');
INSERT INTO public.user_societes(user_id,societe_id) VALUES
 ('00000000-ca10-0000-0000-000000000001','00000000-ca10-0001-0000-000000000001'),
 ('00000000-ca10-0000-0000-000000000002','00000000-ca10-0001-0000-000000000001'),
 ('00000000-ca10-0000-0000-000000000003','00000000-ca10-0001-0000-000000000002');
INSERT INTO public.cabinets(id,nom,actif) VALUES
 ('00000000-ca10-0002-0000-000000000001','Cabinet historique TEST',false),
 ('00000000-ca10-0002-0000-000000000002','Cabinet invisible TEST',true),
 ('00000000-ca10-0002-0000-000000000003','Cabinet sans audit TEST',true);
-- Signature déjà enregistrée : cabinet inactif, auteur sans appartenance
-- actuelle. Le réglage interne est réservé ici aux fixtures privilégiées.
SELECT set_config('ebene.audit_interne', '1', true);
INSERT INTO public.audit_log(user_id,cabinet_id,societe_id,action,table_name) VALUES
 ('00000000-ca10-0000-0000-000000000004','00000000-ca10-0002-0000-000000000001','00000000-ca10-0001-0000-000000000001','INSERT','transactions'),
 ('00000000-ca10-0000-0000-000000000004','00000000-ca10-0002-0000-000000000001','00000000-ca10-0001-0000-000000000001','UPDATE','transactions'),
 ('00000000-ca10-0000-0000-000000000005','00000000-ca10-0002-0000-000000000002','00000000-ca10-0001-0000-000000000002','INSERT','transactions'),
 ('00000000-ca10-0000-0000-000000000005',NULL,'00000000-ca10-0001-0000-000000000001','INSERT','transactions');
SELECT set_config('ebene.audit_interne', '', true);

CREATE FUNCTION pg_temp.ca10_verifier(_numero int, _aal text, _societe uuid, _nombre int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE lignes jsonb;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',
    '00000000-ca10-0000-0000-' || lpad(_numero::text,12,'0'), 'role','authenticated','aal',_aal)::text, true);
  SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]') INTO lignes FROM public.audit_noms_cabinet(_societe) n;
  EXECUTE 'SET LOCAL ROLE NONE';
  ASSERT jsonb_array_length(lignes) = _nombre, 'Nombre de signatures incorrect ou fuite de noms';
  IF _nombre = 1 AND _societe = '00000000-ca10-0001-0000-000000000001' THEN
    ASSERT lignes->0->>'cabinet_nom' = 'Cabinet historique TEST', 'Cabinet historique absent';
    ASSERT lignes->0->>'auteur_nom' = 'Ancien collaborateur TEST', 'Auteur historique absent';
    ASSERT lignes->0->>'user_id' = '00000000-ca10-0000-0000-000000000004', 'Autre auteur exposé';
    ASSERT (SELECT count(*) FROM jsonb_object_keys(lignes->0)) = 4, 'Colonnes privées exposées';
  END IF;
END $$;
-- Administrateur client : uniquement sa société, signatures dédupliquées.
SELECT pg_temp.ca10_verifier(1,'aal1','00000000-ca10-0001-0000-000000000001',1);
SELECT pg_temp.ca10_verifier(1,'aal2','00000000-ca10-0001-0000-000000000002',0);
SELECT pg_temp.ca10_verifier(1,'aal2',NULL,0);
-- Rattachement sans rôle admin, administrateur extérieur et auteur seul.
SELECT pg_temp.ca10_verifier(2,'aal2','00000000-ca10-0001-0000-000000000001',0);
SELECT pg_temp.ca10_verifier(3,'aal2','00000000-ca10-0001-0000-000000000001',0);
SELECT pg_temp.ca10_verifier(4,'aal2','00000000-ca10-0001-0000-000000000001',0);
SELECT pg_temp.ca10_verifier(6,'aal1','00000000-ca10-0001-0000-000000000001',0);
SELECT pg_temp.ca10_verifier(6,'aal2','00000000-ca10-0001-0000-000000000001',1);
SELECT pg_temp.ca10_verifier(6,'aal2','00000000-ca10-0001-0000-000000000002',1);
-- Un nom absent reste NULL : aucune adresse de profil n’est renvoyée.
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET nom = '  ' WHERE user_id = '00000000-ca10-0000-0000-000000000004';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-ca10-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 AND bool_and(auteur_nom IS NULL)
    FROM public.audit_noms_cabinet('00000000-ca10-0001-0000-000000000001')), 'Repli sur une donnée privée';
END $$;
SET LOCAL ROLE NONE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.audit_noms_cabinet('00000000-ca10-0001-0000-000000000001')), 'Session sans utilisateur acceptée';
END $$;
SET LOCAL ROLE NONE;
DO $$ BEGIN RAISE NOTICE 'OK audit_noms_cabinet'; END $$;
-- fin test
ROLLBACK;
