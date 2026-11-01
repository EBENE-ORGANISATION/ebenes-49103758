BEGIN;
-- debut test
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('00000000-ca21-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 'ca21-' || i || '@exemple.invalid', '{}', jsonb_build_object('nom', 'Déclarant TEST ' || i), now(), now(), now()
FROM generate_series(1,7) i;
INSERT INTO public.user_roles(user_id,role) VALUES
 ('00000000-ca21-0000-0000-000000000001','admin'),
 ('00000000-ca21-0000-0000-000000000002','membre_compta'),
 ('00000000-ca21-0000-0000-000000000003','employe'),
 ('00000000-ca21-0000-0000-000000000007','membre_grh');
INSERT INTO public.societes(id,nom,slug)
SELECT ('00000000-ca21-0001-0000-' || lpad(i::text,12,'0'))::uuid, 'Déclarations TEST ' || i, 'ca21-' || i
FROM generate_series(1,3) i;
INSERT INTO public.user_societes(user_id,societe_id)
SELECT ('00000000-ca21-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 '00000000-ca21-0001-0000-000000000001'::uuid FROM unnest(ARRAY[1,2,3,7]) i;
INSERT INTO public.cabinets(id,nom) VALUES ('00000000-ca21-0002-0000-000000000001','Cabinet déclarations TEST');
INSERT INTO public.cabinet_membres(cabinet_id,user_id,role)
SELECT '00000000-ca21-0002-0000-000000000001'::uuid,
 ('00000000-ca21-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 CASE WHEN i=6 THEN 'stagiaire' ELSE 'collaborateur' END::public.role_cabinet
FROM generate_series(4,6) i;
INSERT INTO public.cabinet_dossiers(id,cabinet_id,societe_id,mission,etat,origine) VALUES
 ('00000000-ca21-0003-0000-000000000001','00000000-ca21-0002-0000-000000000001','00000000-ca21-0001-0000-000000000001','tenue_complete','actif','super_admin'),
 ('00000000-ca21-0003-0000-000000000003','00000000-ca21-0002-0000-000000000001','00000000-ca21-0001-0000-000000000003','tenue_complete','termine','super_admin');
INSERT INTO public.cabinet_attributions(dossier_id,user_id,mission)
SELECT d, ('00000000-ca21-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 CASE i WHEN 4 THEN 'tenue_complete' WHEN 5 THEN 'paie_social' ELSE 'compta_fiscalite' END::public.mission_cabinet
FROM unnest(ARRAY['00000000-ca21-0003-0000-000000000001'::uuid,'00000000-ca21-0003-0000-000000000003'::uuid]) d
CROSS JOIN generate_series(4,6) i;

-- Cette fonction ne capte que les refus RLS, jamais les échecs d'assertion.
CREATE FUNCTION pg_temp.ca21_session(_numero int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',
    '00000000-ca21-0000-0000-' || lpad(_numero::text,12,'0'), 'role','authenticated','aal','aal2')::text, true);
END $$;
CREATE FUNCTION pg_temp.ca21_ecrire(_numero int, _societe int, _autorise boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE refus boolean := false; ligne public.suivi_declarations;
BEGIN
  PERFORM pg_temp.ca21_session(_numero);
  BEGIN
    INSERT INTO public.suivi_declarations(societe_id,annee,mois,type,statut,par)
    VALUES (('00000000-ca21-0001-0000-' || lpad(_societe::text,12,'0'))::uuid,
      2026,_numero,'TVA','deposee','00000000-ca21-0000-0000-000000000001') RETURNING * INTO ligne;
  EXCEPTION WHEN insufficient_privilege THEN refus := true;
  END;
  ASSERT refus = NOT _autorise, 'Droit INSERT incorrect';
  IF _autorise THEN
    ASSERT ligne.par = auth.uid(), 'Auteur INSERT falsifiable';
    UPDATE public.suivi_declarations SET statut='payee', par='00000000-ca21-0000-0000-000000000003'
      WHERE id=ligne.id RETURNING * INTO ligne;
    ASSERT ligne.statut='payee' AND ligne.par=auth.uid(), 'UPDATE ou auteur incorrect';
  END IF;
  EXECUTE 'SET LOCAL ROLE NONE';
END $$;
SELECT pg_temp.ca21_ecrire(1,1,true);
SELECT pg_temp.ca21_ecrire(2,1,true);
SELECT pg_temp.ca21_ecrire(3,1,false);
SELECT pg_temp.ca21_ecrire(4,1,true);
SELECT pg_temp.ca21_ecrire(5,1,false);
SELECT pg_temp.ca21_ecrire(6,1,true);
SELECT pg_temp.ca21_ecrire(7,1,false);
SELECT pg_temp.ca21_ecrire(1,2,false);
SELECT pg_temp.ca21_ecrire(2,2,false);
SELECT pg_temp.ca21_ecrire(4,2,false);
SELECT pg_temp.ca21_ecrire(5,2,false);
SELECT pg_temp.ca21_ecrire(6,2,false);
SELECT pg_temp.ca21_ecrire(4,3,false);
SELECT pg_temp.ca21_ecrire(5,3,false);
SELECT pg_temp.ca21_ecrire(6,3,false);

SELECT pg_temp.ca21_session(5);
DO $$ DECLARE n int; BEGIN
  ASSERT (SELECT count(*)=4 FROM public.suivi_declarations), 'Mission paie_social : lecture absente';
  UPDATE public.suivi_declarations SET note='interdit'; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'Mission paie_social : UPDATE permis';
  DELETE FROM public.suivi_declarations; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'Mission paie_social : DELETE permis';
END $$;
SET LOCAL ROLE NONE;
SELECT pg_temp.ca21_session(7);
DO $$ BEGIN
  ASSERT (SELECT count(*)=4 FROM public.suivi_declarations), 'Personnel hors comptabilité : lecture absente';
END $$;
SET LOCAL ROLE NONE;
SELECT pg_temp.ca21_session(3);
DO $$ DECLARE n int; BEGIN
  -- Contradiction du plan : est_personnel exclut un rôle employe sans habilitation.
  ASSERT NOT EXISTS (SELECT 1 FROM public.suivi_declarations), 'Droits historiques employe élargis';
  UPDATE public.suivi_declarations SET note='interdit'; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'Employé : UPDATE permis';
  DELETE FROM public.suivi_declarations; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'Employé : DELETE permis';
END $$;
SET LOCAL ROLE NONE;

SELECT pg_temp.ca21_session(1);
DO $$ DECLARE refus boolean := false; n int; BEGIN
  BEGIN
    INSERT INTO public.suivi_declarations(societe_id,annee,mois,type,statut)
    VALUES ('00000000-ca21-0001-0000-000000000001',2026,1,'TVA','deposee');
  EXCEPTION WHEN unique_violation THEN refus := true; END;
  ASSERT refus, 'Doublon accepté';
  refus := false;
  BEGIN
    INSERT INTO public.suivi_declarations(societe_id,annee,mois,type,statut)
    VALUES ('00000000-ca21-0001-0000-000000000001',2026,4,'patente','deposee');
  EXCEPTION WHEN check_violation THEN refus := true; END;
  ASSERT refus, 'Patente hors trimestre acceptée';
  refus := false;
  BEGIN
    UPDATE public.suivi_declarations SET societe_id='00000000-ca21-0001-0000-000000000002'
    WHERE mois=1;
  EXCEPTION WHEN insufficient_privilege THEN refus := true; END;
  ASSERT refus, 'Société modifiable';
  DELETE FROM public.suivi_declarations WHERE mois=1; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=1, 'Administrateur : DELETE refusé';
END $$;
SET LOCAL ROLE NONE;
SELECT pg_temp.ca21_session(6);
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.suivi_declarations WHERE mois=6; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n=0, 'Stagiaire : suppression de niveau 3 permise';
END $$;
SET LOCAL ROLE NONE;
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name='suivi_declarations'
    AND user_id='00000000-ca21-0000-0000-000000000004'
    AND cabinet_id='00000000-ca21-0002-0000-000000000001' AND action='INSERT'), 'Audit cabinet absent';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.suivi_declarations'::regclass), 'RLS absente';
END $$;
-- La même attribution devient lecture seule puis perd tout accès au départ.
UPDATE public.cabinet_attributions SET mission='lecture'
WHERE user_id='00000000-ca21-0000-0000-000000000006';
SELECT pg_temp.ca21_ecrire(6,1,false);
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinet_dossiers SET etat='depart_demande' WHERE id='00000000-ca21-0003-0000-000000000001';
SELECT pg_temp.ca21_ecrire(4,1,false);
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinet_dossiers SET etat='termine' WHERE id='00000000-ca21-0003-0000-000000000001';
SELECT pg_temp.ca21_ecrire(4,1,false);
DO $$ BEGIN RAISE NOTICE 'OK suivi_declarations'; END $$;
ROLLBACK;
