BEGIN;
-- debut test
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  ASSERT (SELECT prosecdef AND proconfig::text LIKE '%search_path=public%'
    FROM pg_proc WHERE oid='public.tableau_cabinet(integer,integer,date)'::regprocedure), 'RPC non sécurisée';
  ASSERT NOT has_function_privilege('anon','public.tableau_cabinet(integer,integer,date)','EXECUTE'), 'RPC ouverte à anon';
  ASSERT has_function_privilege('authenticated','public.tableau_cabinet(integer,integer,date)','EXECUTE'), 'RPC inaccessible';
  ASSERT NOT has_function_privilege('authenticated','private.tva_liquidee(uuid,integer,integer)','EXECUTE'), 'Calcul privé TVA exposé';
  ASSERT NOT has_function_privilege('authenticated','private.du_social(uuid,text[],date)','EXECUTE'), 'Calcul privé social exposé';
END $$;
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('00000000-ca22-0000-0000-' || lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 'ca22-' || i || '@exemple.invalid', '{}', jsonb_build_object('nom', 'Équipier tableau TEST ' || i), now(), now(), now()
FROM generate_series(1,5) i;
INSERT INTO public.societes(id,nom,slug)
SELECT ('00000000-ca22-0001-0000-' || lpad(i::text,12,'0'))::uuid, 'Tableau TEST ' || i, 'ca22-' || i
FROM generate_series(1,4) i;
INSERT INTO public.cabinets(id,nom) VALUES
 ('00000000-ca22-0002-0000-000000000001','Cabinet tableau TEST'),
 ('00000000-ca22-0002-0000-000000000002','Autre cabinet tableau TEST');
INSERT INTO public.cabinet_membres(cabinet_id,user_id,role) VALUES
 ('00000000-ca22-0002-0000-000000000001','00000000-ca22-0000-0000-000000000001','responsable'),
 ('00000000-ca22-0002-0000-000000000001','00000000-ca22-0000-0000-000000000002','collaborateur'),
 ('00000000-ca22-0002-0000-000000000001','00000000-ca22-0000-0000-000000000003','stagiaire'),
 ('00000000-ca22-0002-0000-000000000002','00000000-ca22-0000-0000-000000000005','responsable');
INSERT INTO public.cabinet_dossiers(id,cabinet_id,societe_id,mission,etat,origine)
SELECT ('00000000-ca22-0003-0000-' || lpad(i::text,12,'0'))::uuid,
 ('00000000-ca22-0002-0000-' || lpad(CASE WHEN i=4 THEN '2' ELSE '1' END,12,'0'))::uuid,
 ('00000000-ca22-0001-0000-' || lpad(i::text,12,'0'))::uuid, 'tenue_complete',
 CASE WHEN i=3 THEN 'termine' ELSE 'actif' END::public.etat_dossier_cabinet, 'super_admin'
FROM generate_series(1,4) i;
INSERT INTO public.cabinet_attributions(dossier_id,user_id,mission) VALUES
 ('00000000-ca22-0003-0000-000000000001','00000000-ca22-0000-0000-000000000002','tenue_complete'),
 ('00000000-ca22-0003-0000-000000000001','00000000-ca22-0000-0000-000000000003','compta_fiscalite'),
 ('00000000-ca22-0003-0000-000000000003','00000000-ca22-0000-0000-000000000002','tenue_complete');
-- Hors session utilisateur : les triggers de validation restent actifs, sans
-- exiger une validation par un second utilisateur pour ces seules fixtures.
INSERT INTO public.ecritures_comptables(societe_id,annee,mois,date,journal,numero_piece,libelle,statut,lignes) VALUES
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-31','OD','CA22-01','Liquidation TEST','valide',
  '[{"compte":"4431","debit":18000,"credit":0},{"compte":"4441","debit":0,"credit":18000}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-31','OD','CA22-02','Salaires TEST','valide',
  '[{"compte":"661","debit":16000,"credit":0},{"compte":"4311","debit":0,"credit":10000},{"compte":"4331","debit":0,"credit":2000},{"compte":"4471","debit":0,"credit":4000}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,11,'2026-11-05','BQ','CA22-03','CNSS réglée TEST','valide',
  '[{"compte":"4311","debit":10000,"credit":0},{"compte":"4331","debit":2000,"credit":0},{"compte":"521","debit":0,"credit":12000}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,11,'2026-11-30','OD','CA22-04','Dette future TEST','valide',
  '[{"compte":"661","debit":5000,"credit":0},{"compte":"4471","debit":0,"credit":5000}]'),
 ('00000000-ca22-0001-0000-000000000001',2027,1,'2027-01-01','OD','CA22-05','Brouillon TEST','brouillon',
  '[{"compte":"4311","debit":90000,"credit":0},{"compte":"521","debit":0,"credit":90000}]');
INSERT INTO public.transactions(societe_id,annee,mois,date,type,statut,piece_jointe,auto,deleted_at) VALUES
 ('00000000-ca22-0001-0000-000000000001',2025,9,'2025-09-01','recette','en_validation','fixture',false,NULL),
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-01','recette','en_validation','fixture',false,NULL),
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-02','depense','valide',NULL,false,NULL),
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-03','depense','valide',NULL,true,NULL),
 ('00000000-ca22-0001-0000-000000000001',2025,10,'2025-10-03','depense','valide',NULL,false,NULL),
 ('00000000-ca22-0001-0000-000000000001',2026,10,'2026-10-04','depense','en_validation',NULL,false,now());
INSERT INTO public.factures(societe_id,annee,mois,date,numero,client,statut_validation) VALUES
 ('00000000-ca22-0001-0000-000000000001',2025,9,'2025-09-01','CA22-TEST','Client TEST','en_validation');
-- Identifiants bigint alloués par la base : aucune séquence n'est réinitialisée.
INSERT INTO public.employes(societe_id,nom,date_embauche,date_fin_contrat,deleted_at) VALUES
 ('00000000-ca22-0001-0000-000000000001','Salarié TEST 1','2026-01-01',NULL,NULL),
 ('00000000-ca22-0001-0000-000000000001','Salarié TEST 2','2026-10-31',NULL,NULL),
 ('00000000-ca22-0001-0000-000000000001','Salarié TEST 3','2026-01-01','2026-10-01',NULL),
 ('00000000-ca22-0001-0000-000000000001','Futur TEST','2026-11-01',NULL,NULL),
 ('00000000-ca22-0001-0000-000000000001','Parti TEST','2026-01-01','2026-09-30',NULL),
 ('00000000-ca22-0001-0000-000000000001','Supprimé TEST','2026-01-01',NULL,now());
INSERT INTO public.bulletins_paie(id,employe_id,employe_nom,societe_id,annee,mois)
SELECT ('00000000-ca22-0004-0000-' || lpad(row_number() OVER (ORDER BY nom)::text,12,'0'))::uuid,
 id,nom,societe_id,2026,10 FROM public.employes
WHERE societe_id='00000000-ca22-0001-0000-000000000001' AND nom IN ('Salarié TEST 1','Salarié TEST 2');
INSERT INTO public.exercices(societe_id,annee,statut) VALUES ('00000000-ca22-0001-0000-000000000001',2025,'cloture');

CREATE FUNCTION pg_temp.ca22_appeler(_numero int, _mois int DEFAULT 10, _date date DEFAULT '2026-11-20')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE resultat jsonb;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',
    '00000000-ca22-0000-0000-' || lpad(_numero::text,12,'0'), 'role','authenticated','aal','aal2')::text, true);
  resultat := public.tableau_cabinet(2026,_mois,_date);
  EXECUTE 'SET LOCAL ROLE NONE';
  RETURN resultat;
END $$;
CREATE FUNCTION pg_temp.ca22_refus(_numero int, _mois int, _code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE refus boolean := false;
BEGIN
  BEGIN PERFORM pg_temp.ca22_appeler(_numero,_mois);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE _code || ':%' THEN RAISE; END IF;
    IF _code='CABINET_INTERDIT' AND SQLSTATE <> '42501' THEN RAISE; END IF;
    refus := true;
  END;
  EXECUTE 'SET LOCAL ROLE NONE';
  ASSERT refus, 'Appel interdit accepté';
END $$;
DO $$ DECLARE r jsonb; a jsonb; b jsonb; BEGIN
  r := pg_temp.ca22_appeler(1);
  ASSERT r->>'cabinet_id'='00000000-ca22-0002-0000-000000000001' AND (r->>'responsable')::boolean, 'Identité du cabinet';
  ASSERT jsonb_array_length(r->'dossiers')=2, 'Responsable : dossiers terminés ou extérieurs visibles';
  SELECT d INTO a FROM jsonb_array_elements(r->'dossiers') d WHERE d->>'societe_id'='00000000-ca22-0001-0000-000000000001';
  SELECT d INTO b FROM jsonb_array_elements(r->'dossiers') d WHERE d->>'societe_id'='00000000-ca22-0001-0000-000000000002';
  ASSERT a IS NOT NULL AND b IS NOT NULL, 'Dossiers A et B absents';
  ASSERT a->>'mission'='tenue_complete' AND a->>'etat'='actif' AND a->>'societe_nom'='Tableau TEST 1', 'Identité dossier incorrecte';
  ASSERT jsonb_array_length(a->'echeances')=4, 'Quatre échéances attendues';
  ASSERT a#>>'{echeances,0,type}'='TVA' AND a#>>'{echeances,1,type}'='CNSS'
    AND a#>>'{echeances,2,type}'='IRPP' AND a#>>'{echeances,3,type}'='patente', 'Ordre échéances';
  ASSERT a#>>'{echeances,0,etat}'='faite', 'Liquidation TVA non reconnue';
  ASSERT a#>>'{echeances,1,etat}'='faite', 'Paiement CNSS de novembre ignoré';
  ASSERT a#>>'{echeances,2,etat}'='en_retard', 'IRPP non réglé';
  ASSERT a#>>'{echeances,3,etat}'='sans_objet' AND a#>'{echeances,3,echeance}'='null'::jsonb, 'Patente octobre';
  ASSERT a#>>'{echeances,2,echeance}'='2026-11-15' AND a#>>'{echeances,2,annee}'='2026'
    AND a#>>'{echeances,2,mois}'='10' AND a#>'{echeances,2,marquee}'='null'::jsonb, 'Période ou marquage';
  ASSERT a->'pieces'='{"transactions":2,"factures":1,"ecritures_brouillon":1,"sans_justificatif":1}'::jsonb, 'Compteurs pièces';
  ASSERT a->'avancement'='{"dernier_mois":"2026-11","bulletins_faits":2,"bulletins_attendus":3,"exercice_precedent_cloture":true}'::jsonb, 'Avancement A';
  ASSERT b#>'{avancement,dernier_mois}'='null'::jsonb AND b#>>'{avancement,bulletins_attendus}'='0'
    AND b#>>'{avancement,exercice_precedent_cloture}'='false', 'Avancement dossier neuf';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b->'echeances') e WHERE e->>'etat'<>'sans_objet'), 'Échéance dossier neuf';
  ASSERT jsonb_array_length(r->'charge')=3, 'Charge équipe absente';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'charge') c
    WHERE c->>'user_id'='00000000-ca22-0000-0000-000000000002' AND c->>'dossiers'='1'
      AND c->>'pieces'='5' AND c->>'role'='collaborateur' AND c->>'nom' IS NOT NULL), 'Charge collaborateur';
  r := pg_temp.ca22_appeler(1,10,'2026-11-10');
  ASSERT r#>>'{dossiers,0,echeances,2,etat}'='a_faire', 'IRPP avant échéance';
  r := pg_temp.ca22_appeler(1,10,'2026-11-15');
  ASSERT r#>>'{dossiers,0,echeances,2,etat}'='a_faire', 'Échéance incluse';
  r := pg_temp.ca22_appeler(1,12,'2026-12-20');
  ASSERT r#>>'{dossiers,0,echeances,3,etat}'='en_retard'
    AND r#>>'{dossiers,0,echeances,3,echeance}'='2026-12-15'
    AND r#>>'{dossiers,0,echeances,0,echeance}'='2027-01-15', 'Patente ou changement année';
  r := pg_temp.ca22_appeler(2);
  ASSERT jsonb_array_length(r->'dossiers')=1 AND r#>>'{dossiers,0,societe_id}'='00000000-ca22-0001-0000-000000000001'
    AND r->'charge'='null'::jsonb AND r->>'responsable'='false', 'Collaborateur : fuite dossiers ou charge';
  r := pg_temp.ca22_appeler(3);
  ASSERT jsonb_array_length(r->'dossiers')=1 AND r->'charge'='null'::jsonb, 'Stagiaire : fuite';
  r := pg_temp.ca22_appeler(5);
  ASSERT jsonb_array_length(r->'dossiers')=1 AND r#>>'{dossiers,0,societe_id}'='00000000-ca22-0001-0000-000000000004', 'Autre cabinet';
END $$;
SELECT pg_temp.ca22_refus(4,10,'CABINET_INTERDIT');
SELECT pg_temp.ca22_refus(1,13,'CABINET_PARAMETRE');
SELECT pg_temp.ca22_refus(1,0,'CABINET_PARAMETRE');

-- Contrôles directs des calculs : le crédit futur n'augmente pas le dû d'octobre.
DO $$ BEGIN
  ASSERT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,10), 'TVA interne';
  ASSERT private.du_social('00000000-ca22-0001-0000-000000000001',ARRAY['431','433'],'2026-11-01')=0, 'Dû social ou brouillon';
  ASSERT private.du_social('00000000-ca22-0001-0000-000000000001',ARRAY['447'],'2026-11-01')=4000, 'Crédit futur pris en compte';
END $$;
-- Cas limites du prédicat de liquidation, isolés des assertions du tableau.
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.ecritures_comptables(societe_id,annee,mois,date,journal,numero_piece,statut,lignes) VALUES
 ('00000000-ca22-0001-0000-000000000001',2026,1,'2026-01-31','OD','CA22-06','valide',
  '[{"compte":"4438","debit":100,"credit":0},{"compte":"4441","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,2,'2026-02-28','OD','CA22-07','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"701","debit":0,"credit":100},{"compte":"4449","debit":0,"credit":0}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,3,'2026-03-31','OD','CA22-08','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"591","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,4,'2026-04-30','OD','CA22-09','brouillon',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"4449","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,5,'2026-05-31','OD','CA22-10','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"4451","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,6,'2026-06-30','OD','CA22-11','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"581","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,7,'2026-07-31','OD','CA22-12','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"4449","debit":0,"credit":100}]'),
 ('00000000-ca22-0001-0000-000000000001',2026,8,'2026-08-31','OD','CA22-13','valide',
  '[{"compte":"4431","debit":100,"credit":0},{"compte":"601","debit":0,"credit":100},{"compte":"4449","debit":0,"credit":0}]');
DO $$ BEGIN
  ASSERT NOT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,1), '4438 pris pour une liquidation';
  ASSERT NOT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,2), 'Produit accepté dans une liquidation';
  ASSERT NOT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,3), 'Compte 59 accepté';
  ASSERT NOT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,4), 'Liquidation brouillon acceptée';
  ASSERT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,5), 'Contrepartie 445 crédit ignorée';
  ASSERT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,6), 'Contrepartie 58 ignorée';
  ASSERT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,7), 'Contrepartie 4449 ignorée';
  ASSERT NOT private.tva_liquidee('00000000-ca22-0001-0000-000000000001',2026,8), 'Charge acceptée dans une liquidation';
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-ca22-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
INSERT INTO public.suivi_declarations(societe_id,annee,mois,type,statut,date)
VALUES ('00000000-ca22-0001-0000-000000000001',2026,10,'IRPP','payee','2026-11-19');
SET LOCAL ROLE NONE;
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.ca22_appeler(2);
  ASSERT r#>>'{dossiers,0,echeances,2,etat}'='faite'
    AND r#>'{dossiers,0,echeances,2,marquee}'=
      '{"statut":"payee","date":"2026-11-19","par_nom":"Équipier tableau TEST 2"}'::jsonb, 'Marquage IRPP';
END $$;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinet_dossiers SET etat='depart_demande' WHERE id='00000000-ca22-0003-0000-000000000001';
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.ca22_appeler(2);
  ASSERT jsonb_array_length(r->'dossiers')=1 AND r#>>'{dossiers,0,etat}'='depart_demande', 'Départ demandé invisible';
END $$;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinet_membres SET actif=false WHERE user_id='00000000-ca22-0000-0000-000000000002';
SELECT pg_temp.ca22_refus(2,10,'CABINET_INTERDIT');
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.ca22_appeler(1);
  ASSERT jsonb_array_length(r->'charge')=2, 'Membre désactivé dans la charge';
END $$;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinet_membres SET actif=true WHERE user_id='00000000-ca22-0000-0000-000000000002';
UPDATE public.cabinet_dossiers SET etat='termine' WHERE id='00000000-ca22-0003-0000-000000000001';
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.ca22_appeler(2);
  ASSERT r->'dossiers'='[]'::jsonb AND r->'charge'='null'::jsonb, 'Dossier terminé encore visible';
  r := pg_temp.ca22_appeler(1);
  ASSERT jsonb_array_length(r->'dossiers')=1, 'Responsable : dossier terminé encore visible';
END $$;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cabinets SET actif=false WHERE id='00000000-ca22-0002-0000-000000000001';
SELECT pg_temp.ca22_refus(1,10,'CABINET_INTERDIT');
SELECT pg_temp.ca22_refus(2,10,'CABINET_INTERDIT');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
DO $$ DECLARE refus boolean := false; BEGIN
  BEGIN PERFORM public.tableau_cabinet(2026,10);
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'CABINET_INTERDIT:%' THEN RAISE; END IF;
    refus := true;
  END;
  ASSERT refus, 'Session sans utilisateur acceptée';
END $$;
SET LOCAL ROLE NONE;
DO $$ BEGIN RAISE NOTICE 'OK tableau_cabinet'; END $$;
ROLLBACK;
