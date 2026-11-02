BEGIN;
-- Interception transactionnelle : aucun appel HTTP, même pendant les fixtures.
CREATE TEMP TABLE appels_cabinet (fonction text, corps jsonb);
CREATE OR REPLACE FUNCTION private.appeler_fonction_interne(
  _fonction text, _corps jsonb DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_setting('test.cabinet_notification_echec', true) = 'oui' THEN
    RAISE EXCEPTION 'Panne simulée de notification';
  END IF;
  INSERT INTO pg_temp.appels_cabinet VALUES (_fonction, _corps);
  RETURN 0;
END;
$$;

CREATE FUNCTION pg_temp.verifier_appel(_lien uuid, _ancien text, _nouveau text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM pg_temp.appels_cabinet), 'Un seul appel attendu';
  ASSERT (SELECT fonction = 'notification-cabinet'
    AND corps = jsonb_build_object('dossier_id', _lien, 'ancien', _ancien, 'nouveau', _nouveau)
    FROM pg_temp.appels_cabinet), 'Corps de notification incorrect';
  TRUNCATE pg_temp.appels_cabinet;
END;
$$;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT format('00000000-ca3d-0000-0000-%s', lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 format('ca3d-%s@exemple.invalid', i), '{}'::jsonb,
 jsonb_build_object('nom', 'CA3D utilisateur ' || i), now(), now(), now()
FROM generate_series(1,7) g(i);
INSERT INTO public.societes (id, nom)
SELECT format('00000000-ca3d-0000-0001-%s', lpad(i::text,12,'0'))::uuid, 'CA3D société ' || i
FROM generate_series(1,3) g(i);
INSERT INTO public.user_societes (user_id, societe_id)
SELECT '00000000-ca3d-0000-0000-000000000006', id FROM public.societes
WHERE id IN ('00000000-ca3d-0000-0001-000000000001', '00000000-ca3d-0000-0001-000000000002', '00000000-ca3d-0000-0001-000000000003');
INSERT INTO public.user_societes (user_id, societe_id)
VALUES ('00000000-ca3d-0000-0000-000000000007','00000000-ca3d-0000-0001-000000000001');
SET LOCAL ROLE service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
 ('00000000-ca3d-0000-0000-000000000001', 'admin_general'),
 ('00000000-ca3d-0000-0000-000000000006', 'admin');
RESET ROLE;
INSERT INTO public.cabinets (id, nom, actif, max_dossiers, societe_propre_id) VALUES
 ('00000000-ca3d-0000-0002-000000000001','CA3D A',true,0,'00000000-ca3d-0000-0001-000000000003'),
 ('00000000-ca3d-0000-0002-000000000002','CA3D B',false,10,NULL),
 ('00000000-ca3d-0000-0002-000000000003','CA3D C',true,10,NULL);
INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
 ('00000000-ca3d-0000-0002-000000000001','00000000-ca3d-0000-0000-000000000002','responsable'),
 ('00000000-ca3d-0000-0002-000000000001','00000000-ca3d-0000-0000-000000000003','collaborateur'),
 ('00000000-ca3d-0000-0002-000000000001','00000000-ca3d-0000-0000-000000000004','stagiaire'),
 ('00000000-ca3d-0000-0002-000000000003','00000000-ca3d-0000-0000-000000000005','responsable');
CREATE FUNCTION pg_temp.ca3d_executer(_uid uuid, _aal text, _sql text)
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
CREATE FUNCTION pg_temp.ca3d_attendre(_cas text, _uid uuid, _aal text, _sql text, _attendu text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  res text := pg_temp.ca3d_executer(_uid, _aal, _sql);
BEGIN
  IF res IS NULL OR left(res, length(_attendu)) <> _attendu THEN
    RAISE EXCEPTION '% : attendu %…, obtenu %', _cas, _attendu, res;
  END IF;
  RETURN res;
END
$f$;

DO $$
DECLARE
  admin_client uuid := '00000000-ca3d-0000-0000-000000000006';
  responsable uuid := '00000000-ca3d-0000-0000-000000000002';
  super_admin uuid := '00000000-ca3d-0000-0000-000000000001';
  societe uuid := '00000000-ca3d-0000-0001-000000000001';
  cabinet uuid := '00000000-ca3d-0000-0002-000000000001';
  lien uuid;
  resultat text;
BEGIN
  ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public']
    FROM pg_proc WHERE oid = 'private.notifier_cabinet()'::regprocedure), 'Propriétés de sécurité';
  ASSERT NOT has_function_privilege('anon', 'private.notifier_cabinet()', 'EXECUTE'), 'Accès anon interdit';
  ASSERT NOT has_function_privilege('authenticated', 'private.notifier_cabinet()', 'EXECUTE'), 'Accès authenticated interdit';

  resultat := pg_temp.ca3d_attendre('invitation', admin_client, 'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''tenue_complete'')', societe, cabinet), 'ok:');
  lien := substring(resultat FROM 4)::uuid;
  PERFORM pg_temp.verifier_appel(lien, NULL, 'invitation');
  PERFORM pg_temp.ca3d_attendre('acceptation', responsable, 'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)', lien), 'ok:');
  PERFORM pg_temp.verifier_appel(lien, 'invitation', 'actif');

  PERFORM pg_temp.ca3d_attendre('demande client', admin_client, 'aal1',
    format('SELECT public.cabinet_demander_depart(%L,''Motif de test'')', lien), 'ok:');
  PERFORM pg_temp.ca3d_attendre('annulation aal2', super_admin, 'aal2',
    format('SELECT public.cabinet_annuler_depart(%L)', lien), 'ok:');
  ASSERT (SELECT count(*) = 2 FROM pg_temp.appels_cabinet), 'Demande et annulation : deux appels';
  ASSERT EXISTS (SELECT 1 FROM pg_temp.appels_cabinet WHERE fonction = 'notification-cabinet' AND corps =
    jsonb_build_object('dossier_id', lien, 'ancien', 'actif', 'nouveau', 'depart_demande')), 'Corps demande';
  DELETE FROM pg_temp.appels_cabinet WHERE corps->>'nouveau' = 'depart_demande';
  PERFORM pg_temp.verifier_appel(lien, 'depart_demande', 'actif');

  PERFORM pg_temp.ca3d_attendre('nouvelle demande', responsable, 'aal1',
    format('SELECT public.cabinet_demander_depart(%L)', lien), 'ok:');
  PERFORM pg_temp.ca3d_attendre('validation aal2', super_admin, 'aal2',
    format('SELECT public.cabinet_valider_depart(%L)', lien), 'ok:');
  ASSERT (SELECT count(*) = 2 FROM pg_temp.appels_cabinet), 'Demande et validation : deux appels';
  ASSERT EXISTS (SELECT 1 FROM pg_temp.appels_cabinet WHERE fonction = 'notification-cabinet' AND corps =
    jsonb_build_object('dossier_id', lien, 'ancien', 'actif', 'nouveau', 'depart_demande')), 'Corps nouvelle demande';
  DELETE FROM pg_temp.appels_cabinet WHERE corps->>'nouveau' = 'depart_demande';
  PERFORM pg_temp.verifier_appel(lien, 'depart_demande', 'termine');

  resultat := pg_temp.ca3d_attendre('rattachement direct', super_admin, 'aal2',
    format('SELECT public.cabinet_rattacher(%L,%L,''tenue_complete'')', cabinet, societe), 'ok:');
  lien := substring(resultat FROM 4)::uuid;
  PERFORM pg_temp.ca3d_attendre('mission', admin_client, 'aal1',
    format('SELECT public.cabinet_changer_mission(%L,''lecture'')', lien), 'ok:');
  ASSERT (SELECT mission = 'lecture' FROM public.cabinet_dossiers WHERE id = lien), 'Mission effectivement changée';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_temp.appels_cabinet), 'Rattachement et mission silencieux';
  UPDATE public.cabinet_dossiers SET etat = etat WHERE id = lien;
  ASSERT NOT EXISTS (SELECT 1 FROM pg_temp.appels_cabinet), 'État identique silencieux';

  societe := '00000000-ca3d-0000-0001-000000000002';
  resultat := pg_temp.ca3d_attendre('invitation à refuser', admin_client, 'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''tenue_complete'')', societe, cabinet), 'ok:');
  lien := substring(resultat FROM 4)::uuid;
  PERFORM pg_temp.verifier_appel(lien, NULL, 'invitation');
  PERFORM pg_temp.ca3d_attendre('refus', responsable, 'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,false)', lien), 'ok:');
  PERFORM pg_temp.verifier_appel(lien, 'invitation', 'termine');

  resultat := pg_temp.ca3d_attendre('invitation à retirer', admin_client, 'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''tenue_complete'')', societe, cabinet), 'ok:');
  lien := substring(resultat FROM 4)::uuid;
  PERFORM pg_temp.verifier_appel(lien, NULL, 'invitation');
  PERFORM pg_temp.ca3d_attendre('retrait', admin_client, 'aal1',
    format('SELECT public.cabinet_annuler_invitation(%L)', lien), 'ok:');
  PERFORM pg_temp.verifier_appel(lien, 'invitation', 'termine');

  resultat := pg_temp.ca3d_attendre('invitation avant panne', admin_client, 'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''tenue_complete'')', societe, cabinet), 'ok:');
  lien := substring(resultat FROM 4)::uuid;
  PERFORM pg_temp.verifier_appel(lien, NULL, 'invitation');
  PERFORM set_config('test.cabinet_notification_echec', 'oui', true);
  PERFORM pg_temp.ca3d_attendre('acceptation malgré la panne', responsable, 'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)', lien), 'ok:');
  ASSERT (SELECT etat = 'actif' FROM public.cabinet_dossiers WHERE id = lien), 'Transition conservée malgré la panne';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_temp.appels_cabinet), 'Aucun appel enregistré pendant la panne';
  RAISE NOTICE 'OK notifications_cabinet';
END $$;
ROLLBACK;
