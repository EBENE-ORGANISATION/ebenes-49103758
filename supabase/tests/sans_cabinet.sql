BEGIN;
-- debut test
-- Test de non-régression de la tâche 3 (espace cabinet) : les règles cabinet
-- ne changent rien pour qui n'agit pas comme cabinet.
-- Suppose appliquées juste avant les migrations 20261027120000_cabinet_schema.sql
-- et 20261027121000_cabinet_droits.sql (les fixtures créent un cabinet). Doit
-- passer AVANT et APRÈS la migration 20261027122000_cabinet_regles_acces.sql.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-5ca0-) :
--   sociétés (rang) …-0001-00000000000N :
--     1 D  société sans cabinet
--     2 A  société cliente, suivie par le cabinet K (lien actif, tenue_complete)
--     3 S  propre société du cabinet K
--   utilisateurs    …-0000-0000000000NN :
--     01 ADM  administrateur de D (rôle admin)
--     02 CPT  membre comptable de D (rôle membre_compta)
--     03 EMP  employé seul de D (rôle employe)
--     04 ADMA administrateur direct de A (rôle admin)
--     05 CPTA membre comptable direct de A (rôle membre_compta)
--     06 RESP responsable du cabinet K, rôle admin, rattaché à S
--     07 CPTS membre comptable de S (cible des fixtures de droits, non mesuré)
--   cabinet K       …-0002-000000000001 ; lien …-0003-000000000001 (A)
--   par société de rang N : activité …-0004-N, service perso …-0005-N,
--   poste …-0006-N, service …-0007-N ; une ligne « SANSCAB » par table métier.
--
-- Mesure, pour chaque population (utilisateur, sa société) et chaque table :
--   R  lignes de la fixture lues ;
--   U  lignes de la fixture modifiées par un UPDATE neutre (SET col = col),
--      ou le SQLSTATE de l'erreur ;
--   I  sonde d'INSERT : ok, ou le SQLSTATE (tables métier ; '-' pour les
--      tables d'administration) ;
--   D  lignes supprimées en effaçant la sonde (si I = ok), ou SQLSTATE, ou '-'.
-- Toutes les sondes (U, I, D) sont annulées aussitôt (sous-transaction) et
-- n'entrent en conflit avec aucune contrainte d'unicité (numéro de pièce,
-- mois, année, date, numéro de facture… distincts des fixtures).
--
-- Vérifications :
--   1. M1 (règles en place) = M2 (même mesure après suppression, dans la
--      transaction, de toute règle cabinet_* des tables métier et
--      d'administration), pour toutes les populations ;
--   2. M1 = résultats attendus, en dur, pour D (relevés sur la base sans la
--      migration le 2026-10-27) ; ADMA et RESP ont les résultats de ADM,
--      CPTA ceux de CPT.

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-5ca0-0000-0000-000000000001', 'sanscab-admin@exemple.invalid',    'Administrateur D'),
  ('00000000-5ca0-0000-0000-000000000002', 'sanscab-compta@exemple.invalid',   'Comptable D'),
  ('00000000-5ca0-0000-0000-000000000003', 'sanscab-employe@exemple.invalid',  'Employé D'),
  ('00000000-5ca0-0000-0000-000000000004', 'sanscab-admin-a@exemple.invalid',  'Administrateur A'),
  ('00000000-5ca0-0000-0000-000000000005', 'sanscab-compta-a@exemple.invalid', 'Comptable A'),
  ('00000000-5ca0-0000-0000-000000000006', 'sanscab-resp@exemple.invalid',     'Responsable K'),
  ('00000000-5ca0-0000-0000-000000000007', 'sanscab-compta-s@exemple.invalid', 'Comptable S')
) AS u(id, email, nom);

-- Le trigger handle_new_societe crée societe_config et les services intégrés.
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-5ca0-0000-0001-000000000001', 'SANSCAB TEST D'),
  ('00000000-5ca0-0000-0001-000000000002', 'SANSCAB TEST A'),
  ('00000000-5ca0-0000-0001-000000000003', 'SANSCAB TEST S');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-5ca0-0000-0000-000000000001', '00000000-5ca0-0000-0001-000000000001'),
  ('00000000-5ca0-0000-0000-000000000002', '00000000-5ca0-0000-0001-000000000001'),
  ('00000000-5ca0-0000-0000-000000000003', '00000000-5ca0-0000-0001-000000000001'),
  ('00000000-5ca0-0000-0000-000000000004', '00000000-5ca0-0000-0001-000000000002'),
  ('00000000-5ca0-0000-0000-000000000005', '00000000-5ca0-0000-0001-000000000002'),
  ('00000000-5ca0-0000-0000-000000000006', '00000000-5ca0-0000-0001-000000000003'),
  ('00000000-5ca0-0000-0000-000000000007', '00000000-5ca0-0000-0001-000000000003');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-5ca0-0000-0000-000000000001', 'admin'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000002', 'membre_compta'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000003', 'employe'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000004', 'admin'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000005', 'membre_compta'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000006', 'admin'::public.app_role),
  ('00000000-5ca0-0000-0000-000000000007', 'membre_compta'::public.app_role);
RESET role;

-- Une ligne par table métier et par table d'administration, sur chaque société.
-- Employé et article retenus dans sans_cabinet.employe_<rang> / article_<rang>.
DO $$
DECLARE
  r record;
  e bigint;
  art bigint;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- rang, société, administrateur, comptable, cible des messages du portail
      (1, '00000000-5ca0-0000-0001-000000000001'::uuid, '00000000-5ca0-0000-0000-000000000001'::uuid,
          '00000000-5ca0-0000-0000-000000000002'::uuid, '00000000-5ca0-0000-0000-000000000003'::uuid),
      (2, '00000000-5ca0-0000-0001-000000000002'::uuid, '00000000-5ca0-0000-0000-000000000004'::uuid,
          '00000000-5ca0-0000-0000-000000000005'::uuid, '00000000-5ca0-0000-0000-000000000004'::uuid),
      (3, '00000000-5ca0-0000-0001-000000000003'::uuid, '00000000-5ca0-0000-0000-000000000006'::uuid,
          '00000000-5ca0-0000-0000-000000000007'::uuid, '00000000-5ca0-0000-0000-000000000007'::uuid)
    ) AS t(rang, s, adm, cpt, portail)
  LOOP
    INSERT INTO public.activites (id, societe_id, nom)
      VALUES (format('00000000-5ca0-0000-0004-%s', lpad(r.rang::text, 12, '0'))::uuid, r.s, 'SANSCAB activité');
    INSERT INTO public.employes (societe_id, nom) VALUES (r.s, 'SANSCAB employé') RETURNING id INTO e;
    INSERT INTO public.articles (societe_id, reference, designation) VALUES (r.s, 'SANSCAB-ART', 'SANSCAB article')
      RETURNING id INTO art;
    PERFORM set_config('sans_cabinet.employe_' || r.rang, e::text, true);
    PERFORM set_config('sans_cabinet.article_' || r.rang, art::text, true);

    INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
      VALUES (r.s, 2026, 1, 'OD', 'SANSCAB écriture', 'SANSCAB-' || r.rang);
    INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description)
      VALUES (r.s, 2026, 1, '2026-01-15', 'd', 1000, 'SANSCAB transaction');
    INSERT INTO public.exercices (societe_id, annee) VALUES (r.s, 2026);
    INSERT INTO public.emprunts (societe_id, preteur, montant, duree_mois, date_deblocage)
      VALUES (r.s, 'SANSCAB banque', 1000000, 12, '2026-01-01');
    INSERT INTO public.informations_fiscales (societe_id, annee) VALUES (r.s, 2026);
    INSERT INTO public.taux_historique (societe_id, date_effet) VALUES (r.s, '2026-01-01');
    INSERT INTO public.params_annuels (societe_id, annee) VALUES (r.s, 2026);
    INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee)
      VALUES (r.s, e, 'SANSCAB employé', 1, 2026);
    INSERT INTO public.primes (societe_id, employe_id, annee, mois) VALUES (r.s, e, 2026, 1);
    INSERT INTO public.heures_sup (societe_id, employe_id, annee, mois) VALUES (r.s, e, 2026, 1);
    INSERT INTO public.retenues (societe_id, employe_id, annee, mois) VALUES (r.s, e, 2026, 1);
    INSERT INTO public.absences (societe_id, employe_id, annee, mois, type, date_debut, date_fin)
      VALUES (r.s, e, 2026, 1, 'conge', '2026-01-05', '2026-01-06');
    INSERT INTO public.sanctions (societe_id, employe_id, date, type) VALUES (r.s, e, '2026-01-10', 'blame');
    INSERT INTO public.factures (societe_id, annee, mois, numero, client, date, statut_validation)
      VALUES (r.s, 2026, 1, 'SANSCAB-F-001', 'SANSCAB client', '2026-01-20', 'brouillon');
    INSERT INTO public.devis (societe_id, annee, mois, numero, client, date)
      VALUES (r.s, 2026, 1, 'SANSCAB-D-001', 'SANSCAB client', '2026-01-20');
    INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur) VALUES (r.s, 'facture', 2026, 1);
    INSERT INTO public.mouvements_stock (societe_id, annee, mois, date, article_id, type, quantite)
      VALUES (r.s, 2026, 1, '2026-01-20', art, 'entree', 1);
    INSERT INTO public.fournisseurs (societe_id, nom) VALUES (r.s, 'SANSCAB fournisseur');
    INSERT INTO public.categories_stock (societe_id, nom) VALUES (r.s, 'SANSCAB catégorie');
    INSERT INTO public.immobilisations (societe_id, libelle, date_acquisition)
      VALUES (r.s, 'SANSCAB immobilisation', '2026-01-01');
    INSERT INTO public.societe_identification (societe_id) VALUES (r.s);

    -- Tables d'administration. Droits d'activité, poste et appartenance au
    -- service posés sur l'administrateur (jamais limité).
    INSERT INTO public.services (id, societe_id, nom)
      VALUES (format('00000000-5ca0-0000-0007-%s', lpad(r.rang::text, 12, '0'))::uuid, r.s, 'SANSCAB service');
    INSERT INTO public.service_membres (service_id, user_id, role)
      VALUES (format('00000000-5ca0-0000-0007-%s', lpad(r.rang::text, 12, '0'))::uuid, r.adm, 'membre');
    INSERT INTO public.custom_services (id, societe_id, code, nom)
      VALUES (format('00000000-5ca0-0000-0005-%s', lpad(r.rang::text, 12, '0'))::uuid, r.s,
              'sanscab' || r.rang, 'SANSCAB service perso');
    INSERT INTO public.custom_postes (id, service_id, nom, niveau)
      VALUES (format('00000000-5ca0-0000-0006-%s', lpad(r.rang::text, 12, '0'))::uuid,
              format('00000000-5ca0-0000-0005-%s', lpad(r.rang::text, 12, '0'))::uuid, 'SANSCAB poste', 'membre');
    INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id)
      VALUES (r.adm, format('00000000-5ca0-0000-0006-%s', lpad(r.rang::text, 12, '0'))::uuid, r.s);
    INSERT INTO public.user_activites (user_id, societe_id, activite_id)
      VALUES (r.adm, r.s, format('00000000-5ca0-0000-0004-%s', lpad(r.rang::text, 12, '0'))::uuid);
    INSERT INTO public.portail_messages (societe_id, employe_user_id, auteur, contenu)
      VALUES (r.s, r.portail, 'admin', 'SANSCAB message');
    INSERT INTO public.permission_overrides (user_id, module, level) VALUES (r.cpt, 'compta', 'write');
    INSERT INTO public.cross_service_grants (user_id, service, level, expires_at)
      VALUES (r.cpt, 'compta', 'membre', now() + interval '1 day');
  END LOOP;
END $$;

-- Cabinet K : S est sa société, A est son client (lien actif).
INSERT INTO public.cabinets (id, nom, societe_propre_id) VALUES
  ('00000000-5ca0-0000-0002-000000000001', 'SANSCAB Cabinet K', '00000000-5ca0-0000-0001-000000000003');
INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
  ('00000000-5ca0-0000-0002-000000000001', '00000000-5ca0-0000-0000-000000000006', 'responsable');
INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine) VALUES
  ('00000000-5ca0-0000-0003-000000000001', '00000000-5ca0-0000-0002-000000000001',
   '00000000-5ca0-0000-0001-000000000002', 'tenue_complete', 'actif', 'cabinet');

-- ─── Mesure ─────────────────────────────────────────────────────────────────
-- Fonction temporaire (disparaît avec la transaction), appelée en postgres :
-- elle prend la session de chaque utilisateur (SET LOCAL ROLE authenticated
-- et request.jwt.claims), puis revient en postgres.
CREATE FUNCTION pg_temp.sans_cabinet_mesure()
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  u record;
  p record;
  d text;
  e text;
  art text;
  cpt text;
  sv text;
  cs text;
  po text;
  n bigint;
  v_r text;
  v_u text;
  v_i text;
  v_d text;
  res text := '';
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('ADM',  '00000000-5ca0-0000-0000-000000000001', 1, '00000000-5ca0-0000-0000-000000000002'),
      ('CPT',  '00000000-5ca0-0000-0000-000000000002', 1, '00000000-5ca0-0000-0000-000000000002'),
      ('EMP',  '00000000-5ca0-0000-0000-000000000003', 1, '00000000-5ca0-0000-0000-000000000002'),
      ('ADMA', '00000000-5ca0-0000-0000-000000000004', 2, '00000000-5ca0-0000-0000-000000000005'),
      ('CPTA', '00000000-5ca0-0000-0000-000000000005', 2, '00000000-5ca0-0000-0000-000000000005'),
      ('RESP', '00000000-5ca0-0000-0000-000000000006', 3, '00000000-5ca0-0000-0000-000000000007')
    ) AS t(lib, id, rang, comptable)
  LOOP
    d   := format('00000000-5ca0-0000-0001-%s', lpad(u.rang::text, 12, '0'));
    e   := current_setting('sans_cabinet.employe_' || u.rang);
    art := current_setting('sans_cabinet.article_' || u.rang);
    cpt := u.comptable;
    sv  := format('00000000-5ca0-0000-0007-%s', lpad(u.rang::text, 12, '0'));
    cs  := format('00000000-5ca0-0000-0005-%s', lpad(u.rang::text, 12, '0'));
    po  := format('00000000-5ca0-0000-0006-%s', lpad(u.rang::text, 12, '0'));

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated","aal":"aal2"}', u.id), true);

    -- (table, filtre de la fixture, colonne de l'UPDATE neutre, sonde d'insert, effacement de la sonde)
    FOR p IN
      SELECT * FROM (VALUES
        ('ecritures_comptables', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES (%L, 2026, 2, ''OD'', ''SANSCAB sonde'', ''SANSCAB-SONDE'')', d),
         format('DELETE FROM public.ecritures_comptables WHERE societe_id = %L AND numero_piece = ''SANSCAB-SONDE''', d)),
        ('transactions', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description) VALUES (%L, 2026, 2, ''2026-02-15'', ''d'', 1000, ''SANSCAB sonde'')', d),
         format('DELETE FROM public.transactions WHERE societe_id = %L AND description = ''SANSCAB sonde''', d)),
        ('exercices', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.exercices (societe_id, annee) VALUES (%L, 2099)', d),
         format('DELETE FROM public.exercices WHERE societe_id = %L AND annee = 2099', d)),
        ('emprunts', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.emprunts (societe_id, preteur, montant, duree_mois, date_deblocage) VALUES (%L, ''SANSCAB sonde'', 1000, 12, ''2026-02-01'')', d),
         format('DELETE FROM public.emprunts WHERE societe_id = %L AND preteur = ''SANSCAB sonde''', d)),
        ('informations_fiscales', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.informations_fiscales (societe_id, annee) VALUES (%L, 2099)', d),
         format('DELETE FROM public.informations_fiscales WHERE societe_id = %L AND annee = 2099', d)),
        ('taux_historique', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.taux_historique (societe_id, date_effet) VALUES (%L, ''2099-01-01'')', d),
         format('DELETE FROM public.taux_historique WHERE societe_id = %L AND date_effet = ''2099-01-01''', d)),
        ('params_annuels', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.params_annuels (societe_id, annee) VALUES (%L, 2099)', d),
         format('DELETE FROM public.params_annuels WHERE societe_id = %L AND annee = 2099', d)),
        ('employes', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.employes (societe_id, nom) VALUES (%L, ''SANSCAB sonde'')', d),
         format('DELETE FROM public.employes WHERE societe_id = %L AND nom = ''SANSCAB sonde''', d)),
        ('bulletins_paie', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee) VALUES (%L, %s, ''SANSCAB employé'', 2, 2026)', d, e),
         format('DELETE FROM public.bulletins_paie WHERE societe_id = %L AND mois = 2', d)),
        ('primes', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.primes (societe_id, employe_id, annee, mois) VALUES (%L, %s, 2026, 2)', d, e),
         format('DELETE FROM public.primes WHERE societe_id = %L AND mois = 2', d)),
        ('heures_sup', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.heures_sup (societe_id, employe_id, annee, mois) VALUES (%L, %s, 2026, 2)', d, e),
         format('DELETE FROM public.heures_sup WHERE societe_id = %L AND mois = 2', d)),
        ('retenues', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.retenues (societe_id, employe_id, annee, mois) VALUES (%L, %s, 2026, 2)', d, e),
         format('DELETE FROM public.retenues WHERE societe_id = %L AND mois = 2', d)),
        ('absences', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.absences (societe_id, employe_id, annee, mois, type, date_debut, date_fin) VALUES (%L, %s, 2026, 2, ''conge'', ''2026-02-05'', ''2026-02-06'')', d, e),
         format('DELETE FROM public.absences WHERE societe_id = %L AND mois = 2', d)),
        ('sanctions', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.sanctions (societe_id, employe_id, date, type) VALUES (%L, %s, ''2026-02-10'', ''blame'')', d, e),
         format('DELETE FROM public.sanctions WHERE societe_id = %L AND date = ''2026-02-10''', d)),
        ('factures', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.factures (societe_id, annee, mois, numero, client, date, statut_validation) VALUES (%L, 2026, 2, ''SANSCAB-F-002'', ''SANSCAB client'', ''2026-02-20'', ''brouillon'')', d),
         format('DELETE FROM public.factures WHERE societe_id = %L AND numero = ''SANSCAB-F-002''', d)),
        ('devis', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.devis (societe_id, annee, mois, numero, client, date) VALUES (%L, 2026, 2, ''SANSCAB-D-002'', ''SANSCAB client'', ''2026-02-20'')', d),
         format('DELETE FROM public.devis WHERE societe_id = %L AND numero = ''SANSCAB-D-002''', d)),
        ('compteurs_numerotation', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur) VALUES (%L, ''devis'', 2026, 1)', d),
         format('DELETE FROM public.compteurs_numerotation WHERE societe_id = %L AND type = ''devis''', d)),
        ('articles', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.articles (societe_id, reference, designation) VALUES (%L, ''SANSCAB-ART-2'', ''SANSCAB sonde'')', d),
         format('DELETE FROM public.articles WHERE societe_id = %L AND reference = ''SANSCAB-ART-2''', d)),
        ('mouvements_stock', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.mouvements_stock (societe_id, annee, mois, date, article_id, type, quantite) VALUES (%L, 2026, 2, ''2026-02-20'', %s, ''entree'', 1)', d, art),
         format('DELETE FROM public.mouvements_stock WHERE societe_id = %L AND mois = 2', d)),
        ('fournisseurs', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.fournisseurs (societe_id, nom) VALUES (%L, ''SANSCAB sonde'')', d),
         format('DELETE FROM public.fournisseurs WHERE societe_id = %L AND nom = ''SANSCAB sonde''', d)),
        ('categories_stock', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.categories_stock (societe_id, nom) VALUES (%L, ''SANSCAB sonde'')', d),
         format('DELETE FROM public.categories_stock WHERE societe_id = %L AND nom = ''SANSCAB sonde''', d)),
        ('immobilisations', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.immobilisations (societe_id, libelle, date_acquisition) VALUES (%L, ''SANSCAB sonde'', ''2026-02-01'')', d),
         format('DELETE FROM public.immobilisations WHERE societe_id = %L AND libelle = ''SANSCAB sonde''', d)),
        ('societes', format('id = %L', d), 'nom',
         format('INSERT INTO public.societes (id, nom) VALUES (''00000000-5ca0-0000-0001-0000000000%s'', ''SANSCAB sonde'')', 90 + u.rang),
         format('DELETE FROM public.societes WHERE id = ''00000000-5ca0-0000-0001-0000000000%s''', 90 + u.rang)),
        ('societe_config', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.societe_config (societe_id) VALUES (%L)', d),
         format('DELETE FROM public.societe_config WHERE societe_id = %L', d)),
        ('societe_identification', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.societe_identification (societe_id) VALUES (%L)', d),
         format('DELETE FROM public.societe_identification WHERE societe_id = %L', d)),
        ('activites', format('societe_id = %L', d), 'societe_id',
         format('INSERT INTO public.activites (societe_id, nom) VALUES (%L, ''SANSCAB sonde'')', d),
         format('DELETE FROM public.activites WHERE societe_id = %L AND nom = ''SANSCAB sonde''', d)),
        -- Tables d'administration : lecture et UPDATE neutre seulement.
        ('services', format('id = %L', sv), 'societe_id', NULL, NULL),
        ('service_membres', format('service_id = %L', sv), 'role', NULL, NULL),
        ('custom_services', format('id = %L', cs), 'societe_id', NULL, NULL),
        ('custom_postes', format('id = %L', po), 'nom', NULL, NULL),
        ('user_custom_postes', format('societe_id = %L', d), 'societe_id', NULL, NULL),
        ('user_activites', format('societe_id = %L', d), 'societe_id', NULL, NULL),
        ('portail_messages', format('societe_id = %L', d), 'contenu', NULL, NULL),
        ('permission_overrides', format('user_id = %L', cpt), 'level', NULL, NULL),
        ('cross_service_grants', format('user_id = %L', cpt), 'level', NULL, NULL)
      ) AS t(tab, filtre, col_maj, ins, sup)
    LOOP
      v_u := NULL; v_i := '-'; v_d := '-';
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', p.tab, p.filtre) INTO n;
      v_r := n::text;

      -- Sondes, toutes annulées à la fin du bloc.
      BEGIN
        BEGIN
          EXECUTE format('UPDATE public.%I SET %I = %I WHERE %s', p.tab, p.col_maj, p.col_maj, p.filtre);
          GET DIAGNOSTICS n = ROW_COUNT;
          v_u := n::text;
        EXCEPTION WHEN OTHERS THEN v_u := SQLSTATE;
        END;
        IF p.ins IS NOT NULL THEN
          BEGIN
            EXECUTE p.ins;
            v_i := 'ok';
          EXCEPTION WHEN OTHERS THEN v_i := SQLSTATE;
          END;
          IF v_i = 'ok' THEN
            BEGIN
              EXECUTE p.sup;
              GET DIAGNOSTICS n = ROW_COUNT;
              v_d := n::text;
            EXCEPTION WHEN OTHERS THEN v_d := SQLSTATE;
            END;
          END IF;
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
      EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      END;

      res := res || format('%s|%s|%s|%s|%s|%s', u.lib, p.tab, v_r, v_u, v_i, v_d) || E'\n';
    END LOOP;

    EXECUTE 'SET LOCAL ROLE NONE';
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;
  RETURN res;
END
$f$;

-- M1 : règles en place (avec ou sans la migration de la tâche 3).
SELECT set_config('sans_cabinet.m1', pg_temp.sans_cabinet_mesure(), true);

-- M2 : mêmes mesures sans aucune règle cabinet_* sur les tables métier et
-- d'administration (les règles des tables cabinet elles-mêmes sont gardées).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'cabinet\_%'
      AND tablename NOT IN ('cabinets', 'cabinet_membres', 'cabinet_dossiers', 'cabinet_attributions')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

SELECT set_config('sans_cabinet.m2', pg_temp.sans_cabinet_mesure(), true);

-- ─── Vérifications ──────────────────────────────────────────────────────────
DO $$
DECLARE
  m1 constant text[] := array_remove(string_to_array(current_setting('sans_cabinet.m1'), E'\n'), '');
  m2 constant text[] := array_remove(string_to_array(current_setting('sans_cabinet.m2'), E'\n'), '');
  ref text[];
  attendu text[];
  ecart text;
BEGIN
  -- 1. Les règles cabinet ne changent rien pour ces populations.
  SELECT string_agg(l, ' ; ' ORDER BY l) INTO ecart FROM (
    (SELECT 'avec ' || x AS l FROM (SELECT unnest(m1) AS x EXCEPT SELECT unnest(m2)) y)
    UNION ALL
    (SELECT 'sans ' || x FROM (SELECT unnest(m2) AS x EXCEPT SELECT unnest(m1)) y)
  ) z;
  ASSERT ecart IS NULL, 'sans_cabinet : les règles cabinet changent les droits : ' || ecart;

  -- 2. Résultats attendus pour D (utilisateur|table|R|U|I|D).
  ref := ARRAY[
    -- Administrateur : tout, sauf ce que seul le super-admin peut faire.
    'ADM|ecritures_comptables|1|1|ok|1',
    'ADM|transactions|1|1|ok|1',
    'ADM|exercices|1|1|ok|1',
    'ADM|emprunts|1|1|ok|1',
    'ADM|informations_fiscales|1|1|ok|1',
    'ADM|taux_historique|1|1|ok|1',
    'ADM|params_annuels|1|1|ok|1',
    'ADM|employes|1|1|ok|1',
    'ADM|bulletins_paie|1|1|ok|1',
    'ADM|primes|1|1|ok|1',
    'ADM|heures_sup|1|1|ok|1',
    'ADM|retenues|1|1|ok|1',
    'ADM|absences|1|1|ok|1',
    'ADM|sanctions|1|1|ok|1',
    'ADM|factures|1|1|ok|1',
    'ADM|devis|1|1|ok|1',
    'ADM|compteurs_numerotation|1|42501|42501|-',
    'ADM|articles|1|1|ok|1',
    'ADM|mouvements_stock|1|1|ok|1',
    'ADM|fournisseurs|1|1|ok|1',
    'ADM|categories_stock|1|1|ok|1',
    'ADM|immobilisations|1|1|ok|1',
    'ADM|societes|1|1|42501|-',
    'ADM|societe_config|1|1|42501|-',
    'ADM|societe_identification|1|1|23505|-',
    'ADM|activites|1|1|ok|1',
    'ADM|services|1|1|-|-',
    'ADM|service_membres|1|1|-|-',
    'ADM|custom_services|1|1|-|-',
    'ADM|custom_postes|1|1|-|-',
    'ADM|user_custom_postes|1|1|-|-',
    'ADM|user_activites|1|1|-|-',
    'ADM|portail_messages|1|1|-|-',
    'ADM|permission_overrides|1|1|-|-',
    'ADM|cross_service_grants|1|1|-|-',
    -- Membre comptable : saisie, sans suppression (réservée à l'administrateur
    -- hors écritures, emprunts et informations fiscales), ni paie, ni clôture,
    -- ni paramètres.
    'CPT|ecritures_comptables|1|1|ok|1',
    'CPT|transactions|1|1|ok|0',
    'CPT|exercices|1|0|42501|-',
    'CPT|emprunts|1|1|ok|1',
    'CPT|informations_fiscales|1|1|ok|1',
    'CPT|taux_historique|1|1|ok|0',
    'CPT|params_annuels|1|1|ok|0',
    'CPT|employes|1|1|ok|0',
    'CPT|bulletins_paie|1|0|42501|-',
    'CPT|primes|1|1|ok|0',
    'CPT|heures_sup|1|1|ok|0',
    'CPT|retenues|1|1|ok|0',
    'CPT|absences|1|1|ok|0',
    'CPT|sanctions|1|1|ok|0',
    'CPT|factures|1|1|ok|0',
    'CPT|devis|1|1|ok|0',
    'CPT|compteurs_numerotation|1|42501|42501|-',
    'CPT|articles|1|1|ok|0',
    'CPT|mouvements_stock|1|1|ok|0',
    'CPT|fournisseurs|1|1|ok|0',
    'CPT|categories_stock|1|1|ok|0',
    'CPT|immobilisations|1|1|ok|0',
    'CPT|societes|1|0|42501|-',
    'CPT|societe_config|1|0|42501|-',
    'CPT|societe_identification|1|0|42501|-',
    'CPT|activites|1|0|42501|-',
    'CPT|services|1|0|-|-',
    'CPT|service_membres|1|0|-|-',
    'CPT|custom_services|1|1|-|-',
    'CPT|custom_postes|1|1|-|-',
    'CPT|user_custom_postes|1|1|-|-',
    'CPT|user_activites|0|0|-|-',
    'CPT|portail_messages|0|0|-|-',
    'CPT|permission_overrides|1|0|-|-',
    'CPT|cross_service_grants|1|0|-|-',
    -- Employé seul : ses restrictions existantes (rien de la gestion, sauf les
    -- tables ouvertes à tout rattaché).
    'EMP|ecritures_comptables|0|0|42501|-',
    'EMP|transactions|0|0|42501|-',
    'EMP|exercices|0|0|42501|-',
    'EMP|emprunts|0|0|42501|-',
    'EMP|informations_fiscales|0|0|42501|-',
    'EMP|taux_historique|1|0|42501|-',
    'EMP|params_annuels|0|0|42501|-',
    'EMP|employes|0|0|42501|-',
    'EMP|bulletins_paie|0|0|42501|-',
    'EMP|primes|0|0|42501|-',
    'EMP|heures_sup|0|0|42501|-',
    'EMP|retenues|0|0|42501|-',
    'EMP|absences|0|0|42501|-',
    'EMP|sanctions|0|0|42501|-',
    'EMP|factures|0|0|42501|-',
    'EMP|devis|0|0|42501|-',
    'EMP|compteurs_numerotation|1|42501|42501|-',
    'EMP|articles|0|0|42501|-',
    'EMP|mouvements_stock|0|0|42501|-',
    'EMP|fournisseurs|0|0|42501|-',
    'EMP|categories_stock|0|0|42501|-',
    'EMP|immobilisations|0|0|42501|-',
    'EMP|societes|1|0|42501|-',
    'EMP|societe_config|1|0|42501|-',
    'EMP|societe_identification|0|0|42501|-',
    'EMP|activites|1|0|42501|-',
    'EMP|services|1|0|-|-',
    'EMP|service_membres|1|0|-|-',
    'EMP|custom_services|1|1|-|-',
    'EMP|custom_postes|1|1|-|-',
    'EMP|user_custom_postes|1|1|-|-',
    'EMP|user_activites|0|0|-|-',
    'EMP|portail_messages|1|1|-|-',
    'EMP|permission_overrides|0|0|-|-',
    'EMP|cross_service_grants|0|0|-|-'
  ];

  -- ADMA (administrateur direct d'un client suivi) et RESP (responsable de
  -- cabinet, admin dans sa propre société) : comme ADM ; CPTA : comme CPT.
  SELECT ref
      || array_agg('ADMA' || substr(l, 4)) FILTER (WHERE l LIKE 'ADM|%')
      || array_agg('RESP' || substr(l, 4)) FILTER (WHERE l LIKE 'ADM|%')
      || array_agg('CPTA' || substr(l, 4)) FILTER (WHERE l LIKE 'CPT|%')
  INTO attendu
  FROM unnest(ref) l;

  -- En cas d'écart, le message donne les lignes mesurées et attendues qui
  -- diffèrent (l'outil d'exécution ne renvoie pas les NOTICE).
  SELECT string_agg(l, ' ; ' ORDER BY l) INTO ecart FROM (
    (SELECT 'mesuré ' || x AS l FROM (SELECT unnest(m1) AS x EXCEPT SELECT unnest(attendu)) y)
    UNION ALL
    (SELECT 'attendu ' || x FROM (SELECT unnest(attendu) AS x EXCEPT SELECT unnest(m1)) y)
  ) z;
  ASSERT ecart IS NULL, 'sans_cabinet : écart avec les résultats attendus : ' || ecart;
  ASSERT cardinality(m1) = cardinality(attendu),
    format('sans_cabinet : %s mesures, %s attendues', cardinality(m1), cardinality(attendu));
END $$;

DO $$ BEGIN RAISE NOTICE 'OK sans_cabinet'; END $$;
-- fin test
ROLLBACK;
