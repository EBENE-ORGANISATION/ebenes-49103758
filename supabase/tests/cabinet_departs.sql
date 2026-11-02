BEGIN;
-- Tests de la tâche 3 : départs. Suppose le socle cabinet déjà appliqué
-- et 20261102122000_cabinet_departs.sql appliquée juste avant ce corps.
-- Sessions simulées ; transaction annulée ; aucun envoi réel.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cabinet_demander_depart(uuid, text)',
    'public.cabinet_valider_depart(uuid)',
    'public.cabinet_annuler_depart(uuid)'
  ] LOOP
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), f || ' : SECURITY DEFINER absent';
    ASSERT (SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = f::regprocedure), f || ' : search_path';
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : accès anon';
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : accès authenticated absent';
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = f::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ), f || ' : accès public';
  END LOOP;
END $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT format('00000000-ca3c-0000-0000-%s', lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 format('ca3c-%s@exemple.invalid', i), '{}'::jsonb,
 jsonb_build_object('nom', 'CA3C utilisateur ' || i), now(), now(), now()
FROM generate_series(1,7) g(i);
INSERT INTO public.societes (id, nom)
SELECT format('00000000-ca3c-0000-0001-%s', lpad(i::text,12,'0'))::uuid, 'CA3C société ' || i
FROM generate_series(1,3) g(i);
INSERT INTO public.user_societes (user_id, societe_id)
SELECT '00000000-ca3c-0000-0000-000000000006', id FROM public.societes
WHERE id IN ('00000000-ca3c-0000-0001-000000000001', '00000000-ca3c-0000-0001-000000000002', '00000000-ca3c-0000-0001-000000000003');
INSERT INTO public.user_societes (user_id, societe_id)
VALUES ('00000000-ca3c-0000-0000-000000000007','00000000-ca3c-0000-0001-000000000001');
SET LOCAL ROLE service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
 ('00000000-ca3c-0000-0000-000000000001', 'admin_general'),
 ('00000000-ca3c-0000-0000-000000000006', 'admin');
RESET ROLE;
INSERT INTO public.cabinets (id, nom, actif, max_dossiers, societe_propre_id) VALUES
 ('00000000-ca3c-0000-0002-000000000001','CA3C A',true,0,'00000000-ca3c-0000-0001-000000000003'),
 ('00000000-ca3c-0000-0002-000000000002','CA3C B',false,10,NULL),
 ('00000000-ca3c-0000-0002-000000000003','CA3C C',true,10,NULL);
INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
 ('00000000-ca3c-0000-0002-000000000001','00000000-ca3c-0000-0000-000000000002','responsable'),
 ('00000000-ca3c-0000-0002-000000000001','00000000-ca3c-0000-0000-000000000003','collaborateur'),
 ('00000000-ca3c-0000-0002-000000000001','00000000-ca3c-0000-0000-000000000004','stagiaire'),
 ('00000000-ca3c-0000-0002-000000000003','00000000-ca3c-0000-0000-000000000005','responsable');
INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description)
VALUES ('00000000-ca3c-0000-0001-000000000001',2026,1,'2026-01-15','d',1000,'CA3C sonde');

CREATE FUNCTION pg_temp.ca3c_executer(_uid uuid, _aal text, _sql text)
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
CREATE FUNCTION pg_temp.ca3c_attendre(_cas text, _uid uuid, _aal text, _sql text, _attendu text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  res text := pg_temp.ca3c_executer(_uid, _aal, _sql);
BEGIN
  IF res IS NULL OR left(res, length(_attendu)) <> _attendu THEN
    RAISE EXCEPTION '% : attendu %…, obtenu %', _cas, _attendu, res;
  END IF;
  RETURN res;
END
$f$;

DO $$
DECLARE
  admin_client uuid := '00000000-ca3c-0000-0000-000000000006';
  responsable uuid := '00000000-ca3c-0000-0000-000000000002';
  collaborateur uuid := '00000000-ca3c-0000-0000-000000000003';
  super_admin uuid := '00000000-ca3c-0000-0000-000000000001';
  societe uuid := '00000000-ca3c-0000-0001-000000000001';
  lien uuid := '00000000-ca3c-0000-0003-000000000001';
  inconnu uuid := '00000000-ca3c-0000-0003-000000000099';
  appelant uuid;
  fonction text;
  lecture text;
  ecriture text;
  erreur_etat text := 'P0001 CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.';
BEGIN
  INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine)
  VALUES (lien,'00000000-ca3c-0000-0002-000000000001',societe,'tenue_complete','actif','client');
  INSERT INTO public.cabinet_attributions (dossier_id,user_id,mission)
  VALUES (lien,collaborateur,'tenue_complete');
  lecture := format('SELECT count(*) FROM public.transactions WHERE societe_id=%L AND description=''CA3C sonde''',societe);
  -- Une saisie du collaborateur reste en attente des quatre yeux.
  ecriture := format('INSERT INTO public.transactions (societe_id,annee,mois,date,type,montant,description,statut) VALUES (%L,2026,3,''2026-03-15'',''d'',1000,''CA3C écriture'',''en_validation'') RETURNING statut',societe);
  PERFORM pg_temp.ca3c_attendre('lecture initiale',collaborateur,'aal1',lecture,'ok:1');

  FOREACH fonction IN ARRAY ARRAY['cabinet_demander_depart','cabinet_valider_depart','cabinet_annuler_depart'] LOOP
    PERFORM pg_temp.ca3c_attendre('dossier inconnu',super_admin,'aal2',
      format('SELECT public.%I(%L)',fonction,inconnu),'P0001 CABINET_INTROUVABLE:');
  END LOOP;
  FOREACH appelant IN ARRAY ARRAY[collaborateur,
    '00000000-ca3c-0000-0000-000000000004'::uuid,
    '00000000-ca3c-0000-0000-000000000005'::uuid,
    '00000000-ca3c-0000-0000-000000000007'::uuid,super_admin] LOOP
    PERFORM pg_temp.ca3c_attendre('demande interdite',appelant,'aal2',
      format('SELECT public.cabinet_demander_depart(%L)',lien),'42501 CABINET_INTERDIT:');
  END LOOP;
  UPDATE public.cabinets SET actif=false WHERE id='00000000-ca3c-0000-0002-000000000001';
  PERFORM pg_temp.ca3c_attendre('cabinet inactif',responsable,'aal1',
    format('SELECT public.cabinet_demander_depart(%L)',lien),'42501 CABINET_INTERDIT:');
  UPDATE public.cabinets SET actif=true WHERE id='00000000-ca3c-0000-0002-000000000001';
  UPDATE public.cabinet_membres SET actif=false WHERE user_id=responsable;
  PERFORM pg_temp.ca3c_attendre('responsable inactif',responsable,'aal1',
    format('SELECT public.cabinet_demander_depart(%L)',lien),'42501 CABINET_INTERDIT:');
  UPDATE public.cabinet_membres SET actif=true WHERE user_id=responsable;

  FOREACH fonction IN ARRAY ARRAY['cabinet_valider_depart','cabinet_annuler_depart'] LOOP
    PERFORM pg_temp.ca3c_attendre('état actif',super_admin,'aal2',format('SELECT public.%I(%L)',fonction,lien),erreur_etat);
  END LOOP;
  PERFORM pg_temp.ca3c_attendre('motif trop long',admin_client,'aal1',
    format('SELECT public.cabinet_demander_depart(%L,%L)',lien,repeat('é',501)),'P0001 CABINET_PARAMETRE:');
  ASSERT (SELECT etat='actif' AND depart_demande_par IS NULL FROM public.cabinet_dossiers WHERE id=lien), 'refus sans modification';
  PERFORM pg_temp.ca3c_attendre('demande client',admin_client,'aal1',
    format('SELECT public.cabinet_demander_depart(%L,''  Changement de cabinet  '')',lien),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND etat='depart_demande'
    AND depart_demande_par=admin_client AND depart_demande_le=now() AND depart_motif='Changement de cabinet'), 'demande datée et motif nettoyé';
  PERFORM pg_temp.ca3c_attendre('lecture pendant attente',collaborateur,'aal1',lecture,'ok:1');
  PERFORM pg_temp.ca3c_attendre('écriture pendant attente',collaborateur,'aal1',ecriture,'42501');
  PERFORM pg_temp.ca3c_attendre('seconde demande',admin_client,'aal1',
    format('SELECT public.cabinet_demander_depart(%L)',lien),erreur_etat);
  FOREACH fonction IN ARRAY ARRAY['cabinet_valider_depart','cabinet_annuler_depart'] LOOP
    FOREACH appelant IN ARRAY ARRAY[admin_client,responsable,collaborateur] LOOP
      PERFORM pg_temp.ca3c_attendre('décision interdite',appelant,'aal2',
        format('SELECT public.%I(%L)',fonction,lien),'42501 CABINET_INTERDIT:');
    END LOOP;
    PERFORM pg_temp.ca3c_attendre('super-admin sans aal2',super_admin,'aal1',
      format('SELECT public.%I(%L)',fonction,lien),'42501 CABINET_INTERDIT:');
  END LOOP;
  PERFORM pg_temp.ca3c_attendre('annulation',super_admin,'aal2',format('SELECT public.cabinet_annuler_depart(%L)',lien),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND etat='actif'
    AND depart_demande_par IS NULL AND depart_demande_le IS NULL AND depart_motif IS NULL), 'annulation nettoyée';
  PERFORM pg_temp.ca3c_attendre('écriture rétablie',collaborateur,'aal1',ecriture,'ok:en_validation');

  -- Limite en caractères après trim, motif vide et motif omis.
  PERFORM pg_temp.ca3c_attendre('500 caractères',responsable,'aal1',
    format('SELECT public.cabinet_demander_depart(%L,%L)',lien,'  ' || repeat('é',500) || '  '),'ok:');
  ASSERT (SELECT char_length(depart_motif)=500 FROM public.cabinet_dossiers WHERE id=lien), 'limite après trim';
  PERFORM pg_temp.ca3c_attendre('annuler limite',super_admin,'aal2',format('SELECT public.cabinet_annuler_depart(%L)',lien),'ok:');
  PERFORM pg_temp.ca3c_attendre('motif vide',responsable,'aal1',format('SELECT public.cabinet_demander_depart(%L,''   '')',lien),'ok:');
  ASSERT (SELECT depart_motif IS NULL FROM public.cabinet_dossiers WHERE id=lien), 'vide devient NULL';
  PERFORM pg_temp.ca3c_attendre('annuler vide',super_admin,'aal2',format('SELECT public.cabinet_annuler_depart(%L)',lien),'ok:');
  PERFORM pg_temp.ca3c_attendre('demande responsable sans motif',responsable,'aal1',format('SELECT public.cabinet_demander_depart(%L)',lien),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND etat='depart_demande'
    AND depart_demande_par=responsable AND depart_demande_le=now() AND depart_motif IS NULL), 'demande responsable';
  PERFORM pg_temp.ca3c_attendre('validation',super_admin,'aal2',format('SELECT public.cabinet_valider_depart(%L)',lien),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND etat='termine'
    AND valide_par=super_admin AND termine_le=now() AND depart_demande_par=responsable AND depart_demande_le=now()), 'départ validé et historique';
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_attributions WHERE dossier_id=lien AND user_id=collaborateur AND mission='tenue_complete'), 'attribution conservée';
  PERFORM pg_temp.ca3c_attendre('collaborateur sans lecture',collaborateur,'aal1',lecture,'ok:0');
  PERFORM pg_temp.ca3c_attendre('responsable sans lecture',responsable,'aal1',lecture,'ok:0');
  PERFORM pg_temp.ca3c_attendre('client conserve lecture',admin_client,'aal1',
    format('SELECT count(*) FROM public.transactions WHERE societe_id=%L',societe),'ok:2');
  FOREACH fonction IN ARRAY ARRAY['cabinet_demander_depart','cabinet_valider_depart','cabinet_annuler_depart'] LOOP
    appelant := CASE WHEN fonction='cabinet_demander_depart' THEN admin_client ELSE super_admin END;
    PERFORM pg_temp.ca3c_attendre('lien terminé',appelant,'aal2',format('SELECT public.%I(%L)',fonction,lien),erreur_etat);
  END LOOP;
  RAISE NOTICE 'OK cabinet_departs';
END $$;
ROLLBACK;
