BEGIN;
-- Tests de la tâche 2 : invitations. Suppose le socle cabinet déjà appliqué
-- et 20261102121000_cabinet_invitations.sql appliquée juste avant ce corps.
-- Sessions simulées ; transaction annulée ; aucun envoi réel.
-- Utilisateurs : 1 super-admin, 2 responsable A, 3 collaborateur A,
-- 4 stagiaire A, 5 responsable C, 6 administrateur client, 7 employé.
-- Sociétés : 1 cliente, 2 refus/retrait, 3 propre société de A.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cabinets_annuaire()',
    'public.cabinet_inviter(uuid, uuid, public.mission_cabinet)',
    'public.cabinet_repondre_invitation(uuid, boolean)',
    'public.cabinet_annuler_invitation(uuid)',
    'public.cabinet_invitations_recues()'
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
  ASSERT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indexrelid = 'public.cabinet_dossiers_societe_en_cours_uniq'::regclass
      AND i.indisunique AND i.indisvalid
      AND pg_get_indexdef(i.indexrelid) LIKE '%(societe_id)%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%etat <>%termine%'
  ), 'index unique des liens en cours absent ou invalide';
END $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT format('00000000-ca3b-0000-0000-%s', lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 format('ca3b-%s@exemple.invalid', i), '{}'::jsonb,
 jsonb_build_object('nom', 'CA3B utilisateur ' || i), now(), now(), now()
FROM generate_series(1,7) g(i);
INSERT INTO public.societes (id, nom)
SELECT format('00000000-ca3b-0000-0001-%s', lpad(i::text,12,'0'))::uuid, 'CA3B société ' || i
FROM generate_series(1,3) g(i);
INSERT INTO public.user_societes (user_id, societe_id)
SELECT '00000000-ca3b-0000-0000-000000000006', id FROM public.societes
WHERE id IN ('00000000-ca3b-0000-0001-000000000001', '00000000-ca3b-0000-0001-000000000002', '00000000-ca3b-0000-0001-000000000003');
INSERT INTO public.user_societes (user_id, societe_id)
VALUES ('00000000-ca3b-0000-0000-000000000007','00000000-ca3b-0000-0001-000000000001');
SET LOCAL ROLE service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
 ('00000000-ca3b-0000-0000-000000000001', 'admin_general'),
 ('00000000-ca3b-0000-0000-000000000006', 'admin');
RESET ROLE;
INSERT INTO public.cabinets (id, nom, actif, max_dossiers, societe_propre_id) VALUES
 ('00000000-ca3b-0000-0002-000000000001','CA3B A',true,0,'00000000-ca3b-0000-0001-000000000003'),
 ('00000000-ca3b-0000-0002-000000000002','CA3B B',false,10,NULL),
 ('00000000-ca3b-0000-0002-000000000003','CA3B C',true,10,NULL);
INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
 ('00000000-ca3b-0000-0002-000000000001','00000000-ca3b-0000-0000-000000000002','responsable'),
 ('00000000-ca3b-0000-0002-000000000001','00000000-ca3b-0000-0000-000000000003','collaborateur'),
 ('00000000-ca3b-0000-0002-000000000001','00000000-ca3b-0000-0000-000000000004','stagiaire'),
 ('00000000-ca3b-0000-0002-000000000003','00000000-ca3b-0000-0000-000000000005','responsable');
INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description)
VALUES ('00000000-ca3b-0000-0001-000000000001',2026,1,'2026-01-15','d',1000,'CA3B sonde');

CREATE FUNCTION pg_temp.ca3b_executer(_uid uuid, _aal text, _sql text)
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
CREATE FUNCTION pg_temp.ca3b_attendre(_cas text, _uid uuid, _aal text, _sql text, _attendu text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  res text := pg_temp.ca3b_executer(_uid, _aal, _sql);
BEGIN
  IF res IS NULL OR left(res, length(_attendu)) <> _attendu THEN
    RAISE EXCEPTION '% : attendu %…, obtenu %', _cas, _attendu, res;
  END IF;
  RETURN res;
END
$f$;

DO $$
DECLARE
  admin_client uuid := '00000000-ca3b-0000-0000-000000000006';
  responsable uuid := '00000000-ca3b-0000-0000-000000000002';
  employe uuid := '00000000-ca3b-0000-0000-000000000007';
  super_admin uuid := '00000000-ca3b-0000-0000-000000000001';
  a uuid := '00000000-ca3b-0000-0002-000000000001';
  b uuid := '00000000-ca3b-0000-0002-000000000002';
  c uuid := '00000000-ca3b-0000-0002-000000000003';
  s1 uuid := '00000000-ca3b-0000-0001-000000000001';
  s2 uuid := '00000000-ca3b-0000-0001-000000000002';
  propre uuid := '00000000-ca3b-0000-0001-000000000003';
  lien uuid;
  autre uuid;
  appelant uuid;
  requete text;
BEGIN
  -- Annuaire : filtre sur nos fixtures pour rester indépendant des vrais cabinets.
  requete := format('SELECT string_agg(nom, '','' ORDER BY nom) FROM public.cabinets_annuaire() WHERE id IN (%L,%L,%L)',a,b,c);
  PERFORM pg_temp.ca3b_attendre('annuaire client',admin_client,'aal1',requete,'ok:CA3B A,CA3B C');
  PERFORM pg_temp.ca3b_attendre('annuaire super-admin aal2',super_admin,'aal2',requete,'ok:CA3B A,CA3B C');
  PERFORM pg_temp.ca3b_attendre('annuaire employé',employe,'aal1',requete,'42501 CABINET_INTERDIT:');
  PERFORM pg_temp.ca3b_attendre('annuaire super-admin aal1',super_admin,'aal1',requete,'42501 CABINET_INTERDIT:');

  -- Aucun rôle de cabinet, ni employé, ni super-admin seul ne peut inviter.
  FOREACH appelant IN ARRAY ARRAY[responsable,
    '00000000-ca3b-0000-0000-000000000003'::uuid,
    '00000000-ca3b-0000-0000-000000000004'::uuid,
    '00000000-ca3b-0000-0000-000000000005'::uuid,employe,super_admin]
  LOOP
    PERFORM pg_temp.ca3b_attendre('invitation interdite',appelant,'aal2',
      format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s1,a),'42501 CABINET_INTERDIT:');
  END LOOP;
  PERFORM pg_temp.ca3b_attendre('mission nulle',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,NULL)',s1,a),'P0001 CABINET_PARAMETRE:');
  PERFORM pg_temp.ca3b_attendre('cabinet inactif',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s1,b),'P0001 CABINET_INACTIF:');
  PERFORM pg_temp.ca3b_attendre('société propre',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',propre,a),'P0001 CABINET_SOCIETE_PROPRE:');
  lien := substring(pg_temp.ca3b_attendre('inviter',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''compta_fiscalite'')',s1,a),'ok:') FROM 4)::uuid;
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND societe_id=s1 AND cabinet_id=a
    AND etat='invitation' AND origine='client' AND mission='compta_fiscalite'), 'contenu invitation';
  PERFORM pg_temp.ca3b_attendre('seconde invitation vers C',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s1,c),'P0001 CABINET_DEJA_LIE:');
  PERFORM pg_temp.ca3b_attendre('aucun accès pendant invitation',responsable,'aal1',
    format('SELECT count(*) FROM public.transactions WHERE societe_id=%L',s1),'ok:0');

  -- Invitations reçues : tous les champs utiles, puis aucun lien clos.
  PERFORM pg_temp.ca3b_attendre('invitation reçue avec société',responsable,'aal1',
    format('SELECT count(*) FROM public.cabinet_invitations_recues() WHERE dossier_id=%L AND societe_id=%L AND societe_nom=''CA3B société 1'' AND mission=''compta_fiscalite'' AND created_at IS NOT NULL',lien,s1),'ok:1');
  FOREACH appelant IN ARRAY ARRAY[
    '00000000-ca3b-0000-0000-000000000003'::uuid,
    '00000000-ca3b-0000-0000-000000000004'::uuid,
    '00000000-ca3b-0000-0000-000000000005'::uuid,employe,admin_client,super_admin]
  LOOP
    PERFORM pg_temp.ca3b_attendre('réponse interdite',appelant,'aal2',
      format('SELECT public.cabinet_repondre_invitation(%L,true)',lien),'42501 CABINET_INTERDIT:');
    PERFORM pg_temp.ca3b_attendre('reçues vide',appelant,'aal2',
      'SELECT count(*) FROM public.cabinet_invitations_recues()','ok:0');
    IF appelant <> admin_client THEN
      PERFORM pg_temp.ca3b_attendre('retrait interdit',appelant,'aal2',
        format('SELECT public.cabinet_annuler_invitation(%L)',lien),'42501 CABINET_INTERDIT:');
    END IF;
  END LOOP;
  UPDATE public.cabinets SET actif=false WHERE id=a;
  PERFORM pg_temp.ca3b_attendre('responsable cabinet inactif',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)',lien),'42501 CABINET_INTERDIT:');
  PERFORM pg_temp.ca3b_attendre('reçues cabinet inactif',responsable,'aal1',
    'SELECT count(*) FROM public.cabinet_invitations_recues()','ok:0');
  UPDATE public.cabinets SET actif=true WHERE id=a;
  UPDATE public.cabinet_membres SET actif=false WHERE user_id=responsable;
  PERFORM pg_temp.ca3b_attendre('responsable inactif',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)',lien),'42501 CABINET_INTERDIT:');
  PERFORM pg_temp.ca3b_attendre('reçues responsable inactif',responsable,'aal1',
    'SELECT count(*) FROM public.cabinet_invitations_recues()','ok:0');
  UPDATE public.cabinet_membres SET actif=true WHERE user_id=responsable;
  PERFORM pg_temp.ca3b_attendre('réponse nulle',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,NULL)',lien),'P0001 CABINET_PARAMETRE:');
  -- max_dossiers vaut déjà zéro : l'acceptation ne doit pas appliquer de quota.
  PERFORM pg_temp.ca3b_attendre('accepter sans quota',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)',lien),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=lien AND etat='actif' AND termine_le IS NULL), 'acceptation';
  PERFORM pg_temp.ca3b_attendre('accès après acceptation',responsable,'aal1',
    format('SELECT count(*) FROM public.transactions WHERE societe_id=%L',s1),'ok:1');
  PERFORM pg_temp.ca3b_attendre('seconde réponse',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,false)',lien),'P0001 CABINET_ETAT: Ce dossier n''est pas dans l''état attendu.');
  PERFORM pg_temp.ca3b_attendre('retrait après acceptation',admin_client,'aal1',
    format('SELECT public.cabinet_annuler_invitation(%L)',lien),'P0001 CABINET_ETAT:');
  PERFORM pg_temp.ca3b_attendre('acceptée absente',responsable,'aal1',
    'SELECT count(*) FROM public.cabinet_invitations_recues()','ok:0');

  autre := substring(pg_temp.ca3b_attendre('nouvelle société',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s2,a),'ok:') FROM 4)::uuid;
  PERFORM pg_temp.ca3b_attendre('refuser',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,false)',autre),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=autre AND etat='termine' AND termine_le=now()), 'refus daté';
  PERFORM pg_temp.ca3b_attendre('refusée absente',responsable,'aal1',
    'SELECT count(*) FROM public.cabinet_invitations_recues()','ok:0');
  autre := substring(pg_temp.ca3b_attendre('réinviter après refus',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s2,a),'ok:') FROM 4)::uuid;
  PERFORM pg_temp.ca3b_attendre('retirer',admin_client,'aal1',
    format('SELECT public.cabinet_annuler_invitation(%L)',autre),'ok:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=autre AND etat='termine' AND termine_le=now()), 'retrait daté';
  PERFORM pg_temp.ca3b_attendre('second retrait',admin_client,'aal1',
    format('SELECT public.cabinet_annuler_invitation(%L)',autre),'P0001 CABINET_ETAT:');
  autre := substring(pg_temp.ca3b_attendre('réinviter après retrait',admin_client,'aal1',
    format('SELECT public.cabinet_inviter(%L,%L,''lecture'')',s2,a),'ok:') FROM 4)::uuid;
  INSERT INTO public.user_societes (user_id,societe_id) VALUES ('00000000-ca3b-0000-0000-000000000003',s2);
  PERFORM pg_temp.ca3b_attendre('double accès',responsable,'aal1',
    format('SELECT public.cabinet_repondre_invitation(%L,true)',autre),'P0001 CABINET_ACCES_DIRECT:');
  ASSERT EXISTS (SELECT 1 FROM public.cabinet_dossiers WHERE id=autre AND etat='invitation'), 'double accès : état conservé';
END $$;

-- Injection déterministe d'un conflit au moment de l'insertion : couvre le
-- rattrapage unique_violation sans prétendre simuler deux sessions concurrentes.
CREATE FUNCTION pg_temp.ca3b_conflit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.societe_id = '00000000-ca3b-0000-0001-000000000003' THEN
    RAISE unique_violation USING MESSAGE = 'Conflit de test', CONSTRAINT = 'cabinet_dossiers_societe_en_cours_uniq';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ca3b_conflit BEFORE INSERT ON public.cabinet_dossiers
FOR EACH ROW EXECUTE FUNCTION pg_temp.ca3b_conflit();
DO $$
BEGIN
  PERFORM pg_temp.ca3b_attendre('conflit insertion rendu métier',
    '00000000-ca3b-0000-0000-000000000006','aal1',
    'SELECT public.cabinet_inviter(''00000000-ca3b-0000-0001-000000000003'',''00000000-ca3b-0000-0002-000000000003'',''lecture'')',
    'P0001 CABINET_DEJA_LIE:');
  RAISE NOTICE 'OK cabinet_invitations';
END $$;
ROLLBACK;
