BEGIN;
-- Propriétaire uniquement ; interception des notifications pour éviter tout HTTP.
CREATE OR REPLACE FUNCTION private.appeler_fonction_interne(_fonction text, _corps jsonb DEFAULT '{}')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN 0; END $$;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
SELECT format('00000000-ca3e-0000-0000-%s', lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 format('ca3e-%s@exemple.invalid', i), '{}', jsonb_build_object('nom', 'CA3E personne ' || i), now(), now(), now()
FROM generate_series(1,2) g(i);
UPDATE public.profiles SET nom = 'CA3E personne 1' WHERE user_id = '00000000-ca3e-0000-0000-000000000001';
UPDATE public.profiles SET nom = NULL, email = 'ca3e-2@exemple.invalid' WHERE user_id = '00000000-ca3e-0000-0000-000000000002';
INSERT INTO public.societes (id, nom) VALUES
 ('00000000-ca3e-0000-0001-000000000001', 'CA3E client'),
 ('00000000-ca3e-0000-0001-000000000002', 'CA3E vide');
INSERT INTO public.cabinets (id, nom, actif) VALUES
 ('00000000-ca3e-0000-0002-000000000001', 'CA3E A', true),
 ('00000000-ca3e-0000-0002-000000000002', 'CA3E B', true);
INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, etat, mission, origine) VALUES
 ('00000000-ca3e-0000-0003-000000000001','00000000-ca3e-0000-0002-000000000001','00000000-ca3e-0000-0001-000000000001','actif','tenue_complete','super_admin'),
 ('00000000-ca3e-0000-0003-000000000002','00000000-ca3e-0000-0002-000000000001','00000000-ca3e-0000-0001-000000000002','actif','tenue_complete','super_admin');
INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description, statut)
SELECT '00000000-ca3e-0000-0001-000000000001',2026,11,'2026-11-03','d',1000,'CA3E attente','en_validation'
FROM generate_series(1,2);
INSERT INTO public.factures (societe_id, annee, mois, date, numero, client, statut_validation, deleted_at) VALUES
 ('00000000-ca3e-0000-0001-000000000001',2026,11,'2026-11-03','CA3E-1','Client','en_validation',NULL),
 ('00000000-ca3e-0000-0001-000000000001',2026,11,'2026-11-03','CA3E-2','Client','en_validation',now());
-- Les éventuels audits des fixtures sont exclus du jeu contrôlé ci-dessous.
-- Le trigger d'audit recalcule cabinet_id ; les lignes de test gardent le leur.
SELECT set_config('ebene.audit_interne', '1', true);
DELETE FROM public.audit_log WHERE societe_id IN ('00000000-ca3e-0000-0001-000000000001','00000000-ca3e-0000-0001-000000000002');
INSERT INTO public.audit_log (societe_id, cabinet_id, user_id, user_email, action, table_name, old_data, new_data, created_at)
SELECT '00000000-ca3e-0000-0001-000000000001', '00000000-ca3e-0000-0002-000000000001',
 '00000000-ca3e-0000-0000-000000000001','ca3e-1@exemple.invalid','INSERT','transactions',NULL,'{}','2026-11-02 07:00+00'
FROM generate_series(1,3);
INSERT INTO public.audit_log (societe_id, cabinet_id, user_id, user_email, action, table_name, old_data, new_data, created_at)
SELECT '00000000-ca3e-0000-0001-000000000001','00000000-ca3e-0000-0002-000000000001',
 '00000000-ca3e-0000-0000-000000000002','ca3e-2@exemple.invalid',action,table_name,ancien::jsonb,nouveau::jsonb,'2026-11-08 12:00+00'
FROM (VALUES
 ('VALIDER_FACTURE','factures','{}','{}'),
 ('UPDATE','transactions','{"statut":"en_validation"}','{"statut":"valide"}'),
 ('INSERT','suivi_declarations','{}','{"type":"TVA","annee":2026,"mois":10,"statut":"deposee"}')
) AS v(action,table_name,ancien,nouveau);
-- Huit jours avant, accès direct, autre cabinet et borne supérieure exclue.
INSERT INTO public.audit_log (societe_id, cabinet_id, action, table_name, created_at)
SELECT '00000000-ca3e-0000-0001-000000000001',cabinet::uuid,'INSERT','transactions',date_action::timestamptz
FROM (VALUES
 ('00000000-ca3e-0000-0002-000000000001','2026-11-01 07:00+00'),
 ('00000000-ca3e-0000-0002-000000000001','2026-11-01 08:00+00'),
 (NULL,'2026-11-05 07:00+00'),(NULL,'2026-11-05 08:00+00'),
 ('00000000-ca3e-0000-0002-000000000002','2026-11-05 07:00+00'),
 ('00000000-ca3e-0000-0002-000000000001','2026-11-09 07:00+00')
) AS v(cabinet,date_action);
DO $$
DECLARE r jsonb; f text;
BEGIN
 r := private.recap_cabinet('00000000-ca3e-0000-0003-000000000001','2026-11-09 07:00+00');
 ASSERT r->'actions' = '{"transactions":4,"factures":1,"ecritures":0,"bulletins":0,"suivi_declarations":1,"autres":0}'::jsonb, 'Actions incorrectes';
 ASSERT (r->>'total')::integer = 6, 'Total incorrect';
 ASSERT (r->>'validations')::integer = 2, 'Validations incorrectes';
 ASSERT r->'declarations' = '[{"type":"TVA","annee":2026,"mois":10,"statut":"deposee"}]'::jsonb, 'Déclaration incorrecte';
 ASSERT r->'personnes' = '[{"nom":"CA3E personne 1","actions":3},{"nom":"ca3e-2@exemple.invalid","actions":3}]'::jsonb, 'Personnes incorrectes';
 ASSERT r->'en_attente_client' = '{"transactions":2,"factures":1}'::jsonb, 'Pièces en attente incorrectes';
 ASSERT r = public.recap_cabinet_service('00000000-ca3e-0000-0003-000000000001','2026-11-09 07:00+00'), 'Enveloppe différente';
 r := private.recap_cabinet('00000000-ca3e-0000-0003-000000000002','2026-11-09 07:00+00');
 ASSERT (r->>'total')::integer = 0 AND r->'personnes' = '[]'::jsonb AND r->'declarations' = '[]'::jsonb, 'Dossier vide incorrect';
 BEGIN
   PERFORM private.recap_cabinet('00000000-ca3e-0000-0003-000000000099','2026-11-09 07:00+00');
   RAISE EXCEPTION 'Un lien inconnu doit échouer';
 EXCEPTION WHEN OTHERS THEN
   ASSERT SQLERRM LIKE 'RECAP_INTROUVABLE:%', 'Erreur attendue RECAP_INTROUVABLE';
 END;
 FOREACH f IN ARRAY ARRAY['private.recap_cabinet(uuid,timestamptz)','public.recap_cabinet_service(uuid,timestamptz)'] LOOP
   ASSERT NOT has_function_privilege('anon',f,'EXECUTE'), 'Accès anon interdit';
   ASSERT NOT has_function_privilege('authenticated',f,'EXECUTE'), 'Accès authenticated interdit';
   ASSERT has_function_privilege('service_role',f,'EXECUTE'), 'Accès service requis';
   ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid=f::regprocedure), 'Propriétés de sécurité';
 END LOOP;
 ASSERT (SELECT count(*) = 1 FROM cron.job WHERE jobname='recap-cabinet-hebdo'), 'Une seule tâche cron';
 ASSERT (SELECT schedule='0 7 * * 1' AND command LIKE '%private.appeler_fonction_interne(''recap-cabinet-hebdo'')%'
   AND command NOT LIKE '%eyJ%' AND command NOT LIKE '%nmeyylvltlvvcvbhvxpz%'
   FROM cron.job WHERE jobname='recap-cabinet-hebdo'), 'Commande cron incorrecte';
 -- Doublons de déclaration, statut facture prioritaire, autres tables et tri.
 INSERT INTO public.audit_log (societe_id, cabinet_id, user_id, action, table_name, old_data, new_data, created_at)
 SELECT '00000000-ca3e-0000-0001-000000000001','00000000-ca3e-0000-0002-000000000001',
   '00000000-ca3e-0000-0000-000000000001', action, table_name, ancien::jsonb, nouveau::jsonb,'2026-11-08 13:00+00'
 FROM (VALUES
   ('UPDATE','suivi_declarations','{}','{"type":"TVA","annee":2026,"mois":10,"statut":"deposee"}'),
   ('UPDATE','suivi_declarations','{}','{"type":"TVA","annee":2026,"mois":10,"statut":"payee"}'),
   ('UPDATE','factures','{"statut_validation":"en_validation","statut":"brouillon"}','{"statut_validation":"valide","statut":"brouillon"}'),
   ('VALIDER_TRANSACTION','transactions','{}','{}'),
   ('VALIDERXFAUX','autre_table','{}','{}')
 ) AS v(action,table_name,ancien,nouveau);
 r := private.recap_cabinet('00000000-ca3e-0000-0003-000000000001','2026-11-09 07:00+00');
 ASSERT (r->>'validations')::integer = 4, 'Validations explicites et statut_validation';
 ASSERT (r->'actions'->>'autres')::integer = 1, 'Autres tables';
 ASSERT r->'declarations' = '[{"type":"TVA","annee":2026,"mois":10,"statut":"deposee"},{"type":"TVA","annee":2026,"mois":10,"statut":"payee"}]'::jsonb, 'Déclarations uniques et triées';
 ASSERT (r->'personnes'->0->>'actions')::integer = 8, 'Personnes triées par activité';
 RAISE NOTICE 'OK recap_cabinet';
END $$;
ROLLBACK;
