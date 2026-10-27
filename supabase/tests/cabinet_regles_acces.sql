BEGIN;
-- debut test
-- Test de la tâche 3 (espace cabinet) : règles d'accès des tables métier et
-- des tables d'administration, société immuable.
-- Suppose appliquées juste avant les migrations 20261027120000_cabinet_schema.sql,
-- 20261027121000_cabinet_droits.sql et 20261027122000_cabinet_regles_acces.sql.
-- Tourne sur la production dans une transaction annulée ; rien ne reste en base.
--
-- Fixtures (uuid fixes, préfixe 00000000-cab3-) :
--   utilisateurs  …-0000-0000000000NN
--     01 R1 responsable cabinet 1, rôle global admin, rattaché (user_societes)
--        à S, la propre société du cabinet 1
--     02 C1 collaborateur cabinet 1 : compta_fiscalite sur A
--     03 stagiaire cabinet 1 : tenue_complete sur A
--     04 collaborateur cabinet 1 : lecture sur A
--     05 collaborateur cabinet 1 : paie_social sur A
--     06 responsable cabinet 2
--     07 administrateur direct de A (rôle admin), sans cabinet
--     08 employé de S (rôle employe)
--     09 super-admin (admin_general)
--   sociétés      …-0001-0000000000NN :
--     01 A  02 B  03 C  04 S (propre société du cabinet 1)  05 E  06 F
--   cabinets      …-0002-0000000000NN : 01 cabinet 1 (société propre S), 02 cabinet 2
--   liens         …-0003-0000000000NN :
--     01 A–cab 1 tenue_complete actif      02 B–cab 1 compta_fiscalite actif
--     03 C–cab 2 tenue_complete actif      04 E–cab 1 tenue_complete invitation
--     05 F–cab 1 tenue_complete termine
--   activités     …-0004-0000000000NN : une par société (NN = rang de la société)
--   service perso …-0005-000000000001, poste …-0006-000000000001,
--   service       …-0007-000000000001 : sur A
-- Données métier : une ligne par table de la correspondance sur chaque société
-- (marquées « CAB3 », numéro de pièce CAB3-<rang>).
--
-- Phases :
--   1. règles réelles ;
--   2. règles réelles + une règle permissive « tout ouvert » sur chaque table ;
--   3. le lien de A passe en depart_demande ;
--   4. membre puis cabinet désactivés.
--
-- Les vérifications génériques passent par deux fonctions temporaires,
-- appelées en postgres : elles prennent la session de l'utilisateur
-- (SET LOCAL ROLE authenticated et request.jwt.claims), puis reviennent en
-- postgres. Toutes leurs sondes d'écriture sont annulées (sous-transaction).

-- ─── Correspondance attendue ────────────────────────────────────────────────
-- [table, colonne de société, module, niveau d'écriture, écriture directe
--  ouverte au cabinet, niveau de suppression (null : jamais)]
SELECT set_config('cab3.tables', $json$[
  ["ecritures_comptables",   "societe_id", "compta",          2, true,  3],
  ["transactions",           "societe_id", "compta",          2, true,  3],
  ["exercices",              "societe_id", "compta",          3, true,  null],
  ["emprunts",               "societe_id", "compta",          2, true,  3],
  ["informations_fiscales",  "societe_id", "fiscalite",       2, true,  3],
  ["taux_historique",        "societe_id", "fiscalite",       2, true,  3],
  ["params_annuels",         "societe_id", "fiscalite",       2, true,  3],
  ["employes",               "societe_id", "grh",             2, true,  3],
  ["bulletins_paie",         "societe_id", "grh",             2, true,  3],
  ["primes",                 "societe_id", "grh",             2, true,  3],
  ["heures_sup",             "societe_id", "grh",             2, true,  3],
  ["retenues",               "societe_id", "grh",             2, true,  3],
  ["absences",               "societe_id", "grh",             2, true,  3],
  ["sanctions",              "societe_id", "grh",             2, true,  3],
  ["factures",               "societe_id", "factures",        2, true,  3],
  ["devis",                  "societe_id", "factures",        2, true,  3],
  ["compteurs_numerotation", "societe_id", "factures",        2, false, null],
  ["articles",               "societe_id", "stock",           2, true,  3],
  ["mouvements_stock",       "societe_id", "stock",           2, true,  3],
  ["fournisseurs",           "societe_id", "stock",           2, true,  3],
  ["categories_stock",       "societe_id", "stock",           2, true,  3],
  ["immobilisations",        "societe_id", "immobilisations", 2, true,  3],
  ["societes",               "id",         "parametres",      2, true,  null],
  ["societe_config",         "societe_id", "parametres",      2, true,  null],
  ["societe_identification", "societe_id", "parametres",      2, true,  null],
  ["activites",              "societe_id", "parametres",      2, true,  null]
]$json$, true);

-- Sondes d'INSERT par table : {s} société (littéral), {e} employé, {a} article.
-- Valeurs distinctes des fixtures (aucune contrainte d'unicité heurtée).
SELECT set_config('cab3.sondes', $json${
  "ecritures_comptables":   "INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece) VALUES ({s}, 2026, 3, 'OD', 'CAB3 sonde', 'CAB3-SONDE')",
  "transactions":           "INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description) VALUES ({s}, 2026, 3, '2026-03-15', 'd', 1000, 'CAB3 sonde')",
  "exercices":              "INSERT INTO public.exercices (societe_id, annee) VALUES ({s}, 2099)",
  "emprunts":               "INSERT INTO public.emprunts (societe_id, preteur, montant, duree_mois, date_deblocage) VALUES ({s}, 'CAB3 sonde', 1000, 12, '2026-03-01')",
  "informations_fiscales":  "INSERT INTO public.informations_fiscales (societe_id, annee) VALUES ({s}, 2099)",
  "taux_historique":        "INSERT INTO public.taux_historique (societe_id, date_effet) VALUES ({s}, '2099-01-01')",
  "params_annuels":         "INSERT INTO public.params_annuels (societe_id, annee) VALUES ({s}, 2099)",
  "employes":               "INSERT INTO public.employes (societe_id, nom) VALUES ({s}, 'CAB3 sonde')",
  "bulletins_paie":         "INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee) VALUES ({s}, {e}, 'CAB3 employé', 3, 2026)",
  "primes":                 "INSERT INTO public.primes (societe_id, employe_id, annee, mois) VALUES ({s}, {e}, 2026, 3)",
  "heures_sup":             "INSERT INTO public.heures_sup (societe_id, employe_id, annee, mois) VALUES ({s}, {e}, 2026, 3)",
  "retenues":               "INSERT INTO public.retenues (societe_id, employe_id, annee, mois) VALUES ({s}, {e}, 2026, 3)",
  "absences":               "INSERT INTO public.absences (societe_id, employe_id, annee, mois, type, date_debut, date_fin) VALUES ({s}, {e}, 2026, 3, 'conge', '2026-03-05', '2026-03-06')",
  "sanctions":              "INSERT INTO public.sanctions (societe_id, employe_id, date, type) VALUES ({s}, {e}, '2026-03-10', 'blame')",
  "factures":               "INSERT INTO public.factures (societe_id, annee, mois, numero, client, date, statut_validation) VALUES ({s}, 2026, 3, 'CAB3-F-SONDE', 'CAB3 client', '2026-03-20', 'brouillon')",
  "devis":                  "INSERT INTO public.devis (societe_id, annee, mois, numero, client, date) VALUES ({s}, 2026, 3, 'CAB3-D-SONDE', 'CAB3 client', '2026-03-20')",
  "compteurs_numerotation": "INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur) VALUES ({s}, 'devis', 2026, 1)",
  "articles":               "INSERT INTO public.articles (societe_id, reference, designation) VALUES ({s}, 'CAB3-ART-SONDE', 'CAB3 sonde')",
  "mouvements_stock":       "INSERT INTO public.mouvements_stock (societe_id, annee, mois, date, article_id, type, quantite) VALUES ({s}, 2026, 3, '2026-03-20', {a}, 'entree', 1)",
  "fournisseurs":           "INSERT INTO public.fournisseurs (societe_id, nom) VALUES ({s}, 'CAB3 sonde')",
  "categories_stock":       "INSERT INTO public.categories_stock (societe_id, nom) VALUES ({s}, 'CAB3 sonde')",
  "immobilisations":        "INSERT INTO public.immobilisations (societe_id, libelle, date_acquisition) VALUES ({s}, 'CAB3 sonde', '2026-03-01')",
  "societes":               "INSERT INTO public.societes (id, nom) VALUES ({s}, 'CAB3 sonde')",
  "societe_config":         "INSERT INTO public.societe_config (societe_id) VALUES ({s})",
  "societe_identification": "INSERT INTO public.societe_identification (societe_id) VALUES ({s})",
  "activites":              "INSERT INTO public.activites (societe_id, nom) VALUES ({s}, 'CAB3 sonde')"
}$json$, true);

-- Tables d'administration : [table, colonne, valeur qui désigne A, sonde d'INSERT ({u} : l'appelant)].
SELECT set_config('cab3.admin', $json$[
  ["services",             "societe_id", "00000000-cab3-0000-0001-000000000001",
   "INSERT INTO public.services (societe_id, nom) VALUES ('00000000-cab3-0000-0001-000000000001', 'CAB3 intrus')"],
  ["custom_services",      "societe_id", "00000000-cab3-0000-0001-000000000001",
   "INSERT INTO public.custom_services (societe_id, code, nom) VALUES ('00000000-cab3-0000-0001-000000000001', 'cab3x', 'CAB3 intrus')"],
  ["user_custom_postes",   "societe_id", "00000000-cab3-0000-0001-000000000001",
   "INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES ({u}, '00000000-cab3-0000-0006-000000000001', '00000000-cab3-0000-0001-000000000001')"],
  ["user_activites",       "societe_id", "00000000-cab3-0000-0001-000000000001",
   "INSERT INTO public.user_activites (user_id, societe_id, activite_id) VALUES ({u}, '00000000-cab3-0000-0001-000000000001', '00000000-cab3-0000-0004-000000000001')"],
  ["portail_messages",     "societe_id", "00000000-cab3-0000-0001-000000000001",
   "INSERT INTO public.portail_messages (societe_id, employe_user_id, auteur, contenu) VALUES ('00000000-cab3-0000-0001-000000000001', '00000000-cab3-0000-0000-000000000007', 'admin', 'CAB3 intrus')"],
  ["service_membres",      "service_id", "00000000-cab3-0000-0007-000000000001",
   "INSERT INTO public.service_membres (service_id, user_id, role) VALUES ('00000000-cab3-0000-0007-000000000001', {u}, 'chef')"],
  ["custom_postes",        "service_id", "00000000-cab3-0000-0005-000000000001",
   "INSERT INTO public.custom_postes (service_id, nom, niveau) VALUES ('00000000-cab3-0000-0005-000000000001', 'CAB3 intrus', 'chef')"],
  ["permission_overrides", "user_id",    "00000000-cab3-0000-0000-000000000007",
   "INSERT INTO public.permission_overrides (user_id, module, level) VALUES ('00000000-cab3-0000-0000-000000000007', 'factures', 'validate')"],
  ["cross_service_grants", "user_id",    "00000000-cab3-0000-0000-000000000007",
   "INSERT INTO public.cross_service_grants (user_id, service, level, expires_at) VALUES ('00000000-cab3-0000-0000-000000000007', 'grh', 'chef', now() + interval '1 day')"]
]$json$, true);

-- ─── Structure ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  f text;
  n int;
BEGIN
  -- module_de_table : fonction pure, correspondance du § 6.2.
  f := 'public.module_de_table(text)';
  ASSERT (SELECT NOT prosecdef AND provolatile = 'i' AND proparallel = 's'
          FROM pg_proc WHERE oid = f::regprocedure),
    'module_de_table : attendu SECURITY INVOKER, IMMUTABLE, PARALLEL SAFE';
  ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'module_de_table exécutable par anon';
  ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), 'module_de_table non exécutable par authenticated';
  ASSERT public.module_de_table('suivi_declarations') = 'fiscalite', 'module_de_table(suivi_declarations)';
  ASSERT public.module_de_table('portail_messages') IS NULL, 'module_de_table(portail_messages) non NULL';
  ASSERT public.module_de_table('services') IS NULL, 'module_de_table(services) non NULL';
  ASSERT public.module_de_table(NULL) IS NULL, 'module_de_table(NULL) non NULL';

  FOR r IN
    SELECT x->>0 AS tab, x->>1 AS col, x->>2 AS module, (x->>3)::int AS ne,
           (x->>4)::boolean AS directe, (x->>5)::int AS ns
    FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
  LOOP
    ASSERT public.module_de_table(r.tab) = r.module,
      format('module_de_table(%s) = %s, attendu %s', r.tab, public.module_de_table(r.tab), r.module);

    ASSERT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = r.tab AND policyname = 'cabinet_lecture'
                     AND permissive = 'PERMISSIVE' AND cmd = 'SELECT' AND roles = '{authenticated}'
                     AND qual LIKE '%cabinet_societes(''' || r.module || '''::text, 1)%'),
      format('%s : cabinet_lecture absente ou incorrecte', r.tab);
    ASSERT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = r.tab AND policyname = 'cabinet_plafond_lecture'
                     AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT' AND roles = '{authenticated}'
                     AND qual LIKE '%cabinet_societes_agit()%'
                     AND qual LIKE '%cabinet_societes(''' || r.module || '''::text, 1)%'),
      format('%s : cabinet_plafond_lecture absente ou incorrecte', r.tab);
    ASSERT (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = r.tab
              AND permissive = 'RESTRICTIVE' AND roles = '{authenticated}'
              AND (policyname, cmd) IN (('cabinet_plafond_ecriture_insert', 'INSERT'),
                                        ('cabinet_plafond_ecriture_update', 'UPDATE'),
                                        ('cabinet_plafond_ecriture_delete', 'DELETE'))
              AND coalesce(qual, with_check) LIKE '%cabinet_societes_agit()%') = 3,
      format('%s : plafonds d''écriture incomplets', r.tab);
    ASSERT (SELECT with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tab
            AND policyname = 'cabinet_plafond_ecriture_insert')
           LIKE format('%%cabinet_societes(''%s''::text, %s)%%', r.module, r.ne),
      format('%s : plafond d''insertion au mauvais niveau', r.tab);

    -- Suppression : niveau 3, ou aucune branche cabinet.
    IF r.ns IS NULL THEN
      ASSERT (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tab
              AND policyname = 'cabinet_plafond_ecriture_delete') NOT LIKE '%cabinet_societes(%',
        format('%s : le plafond DELETE ne doit pas avoir de branche cabinet', r.tab);
      ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tab
                         AND policyname = 'cabinet_ecriture_delete'),
        format('%s : permissive DELETE inattendue', r.tab);
    ELSE
      ASSERT (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tab
              AND policyname = 'cabinet_ecriture_delete' AND permissive = 'PERMISSIVE' AND cmd = 'DELETE')
             LIKE format('%%cabinet_societes(''%s''::text, %s)%%', r.module, r.ns),
        format('%s : permissive DELETE absente ou au mauvais niveau', r.tab);
      ASSERT (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tab
              AND policyname = 'cabinet_plafond_ecriture_delete')
             LIKE format('%%cabinet_societes(''%s''::text, %s)%%', r.module, r.ns),
        format('%s : plafond DELETE au mauvais niveau', r.tab);
    END IF;

    -- Permissives d'insertion et de modification.
    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.tab AND permissive = 'PERMISSIVE'
      AND (policyname, cmd) IN (('cabinet_ecriture_insert', 'INSERT'), ('cabinet_ecriture_update', 'UPDATE'));
    ASSERT n = CASE WHEN r.directe THEN 2 ELSE 0 END,
      format('%s : %s règles permissives d''écriture', r.tab, n);

    -- Société immuable : trigger sur toutes les tables sauf societes.
    ASSERT (EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = format('public.%I', r.tab)::regclass
                      AND tgname = 'trg_societe_immuable' AND NOT tgisinternal))
           = (r.tab <> 'societes'),
      format('%s : trigger trg_societe_immuable', r.tab);
  END LOOP;

  ASSERT (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'societes'
          AND policyname = 'cabinet_lecture') LIKE '%(id = ANY%',
    'societes : la règle doit porter sur id';

  -- Tables d'administration : refus total.
  FOR r IN
    SELECT x->>0 AS tab FROM jsonb_array_elements(current_setting('cab3.admin')::jsonb) x
  LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = r.tab AND policyname = 'cabinet_refus'
                     AND permissive = 'RESTRICTIVE' AND cmd = 'ALL' AND roles = '{authenticated}'
                     AND qual IS NOT NULL AND with_check IS NOT NULL),
      format('%s : cabinet_refus absente ou incorrecte', r.tab);
  END LOOP;

  -- Fonctions d'aide : schéma private, SECURITY DEFINER, pas pour anon.
  ASSERT NOT has_schema_privilege('anon', 'private', 'USAGE'), 'schéma private : USAGE pour anon';
  ASSERT has_schema_privilege('authenticated', 'private', 'USAGE'), 'schéma private : pas de USAGE pour authenticated';
  FOREACH f IN ARRAY ARRAY[
    'private.cabinet_services_agit()',
    'private.cabinet_custom_services_agit()',
    'private.cabinet_utilisateurs_agit()'
  ] LOOP
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), f || ' : pas SECURITY DEFINER';
    ASSERT (SELECT provolatile = 's' FROM pg_proc WHERE oid = f::regprocedure), f || ' : pas STABLE';
    ASSERT (SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = f::regprocedure),
      f || ' : search_path non fixé';
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' : exécutable par anon';
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' : non exécutable par authenticated';
  END LOOP;
  ASSERT to_regprocedure('public.cabinet_services_agit()') IS NULL, 'cabinet_services_agit encore dans public';
  ASSERT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a
                   ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                 WHERE i.indrelid = 'public.user_societes'::regclass AND a.attname = 'societe_id'),
    'user_societes : pas d''index commençant par societe_id';

  -- user_roles et user_societes : fermées à l'écriture côté client (24/10/2026).
  FOREACH f IN ARRAY ARRAY['public.user_roles', 'public.user_societes'] LOOP
    ASSERT NOT has_table_privilege('authenticated', f, 'INSERT'), f || ' : INSERT ouvert à authenticated';
    ASSERT NOT has_table_privilege('authenticated', f, 'UPDATE'), f || ' : UPDATE ouvert à authenticated';
    ASSERT NOT has_table_privilege('authenticated', f, 'DELETE'), f || ' : DELETE ouvert à authenticated';
  END LOOP;
END $$;

-- ─── Fixtures (en postgres, RLS contournée par le propriétaire) ─────────────
-- auth.uid() lit d'abord request.jwt.claim.sub : on le vide pour que seul
-- request.jwt.claims compte.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '{}'::jsonb, jsonb_build_object('nom', u.nom), now(), now()
FROM (VALUES
  ('00000000-cab3-0000-0000-000000000001', 'cab3-resp1@exemple.invalid',   'Responsable 1'),
  ('00000000-cab3-0000-0000-000000000002', 'cab3-c1@exemple.invalid',      'Collaborateur C1'),
  ('00000000-cab3-0000-0000-000000000003', 'cab3-stag@exemple.invalid',    'Stagiaire'),
  ('00000000-cab3-0000-0000-000000000004', 'cab3-lecture@exemple.invalid', 'Collaborateur lecture'),
  ('00000000-cab3-0000-0000-000000000005', 'cab3-paie@exemple.invalid',    'Collaborateur paie'),
  ('00000000-cab3-0000-0000-000000000006', 'cab3-resp2@exemple.invalid',   'Responsable 2'),
  ('00000000-cab3-0000-0000-000000000007', 'cab3-admin-a@exemple.invalid', 'Administrateur A'),
  ('00000000-cab3-0000-0000-000000000008', 'cab3-employe-s@exemple.invalid', 'Employé S'),
  ('00000000-cab3-0000-0000-000000000009', 'cab3-super@exemple.invalid',   'Super-admin')
) AS u(id, email, nom);

-- Le trigger handle_new_societe crée societe_config et les services intégrés.
INSERT INTO public.societes (id, nom) VALUES
  ('00000000-cab3-0000-0001-000000000001', 'CAB3 TEST A'),
  ('00000000-cab3-0000-0001-000000000002', 'CAB3 TEST B'),
  ('00000000-cab3-0000-0001-000000000003', 'CAB3 TEST C'),
  ('00000000-cab3-0000-0001-000000000004', 'CAB3 TEST S'),
  ('00000000-cab3-0000-0001-000000000005', 'CAB3 TEST E'),
  ('00000000-cab3-0000-0001-000000000006', 'CAB3 TEST F');

INSERT INTO public.user_societes (user_id, societe_id) VALUES
  ('00000000-cab3-0000-0000-000000000007', '00000000-cab3-0000-0001-000000000001'),
  ('00000000-cab3-0000-0000-000000000001', '00000000-cab3-0000-0001-000000000004'),
  ('00000000-cab3-0000-0000-000000000008', '00000000-cab3-0000-0001-000000000004');

-- user_roles : écriture réservée à service_role (règle du 24/10/2026).
SET LOCAL role service_role;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-cab3-0000-0000-000000000007', 'admin'::public.app_role),
  ('00000000-cab3-0000-0000-000000000001', 'admin'::public.app_role),
  ('00000000-cab3-0000-0000-000000000008', 'employe'::public.app_role),
  ('00000000-cab3-0000-0000-000000000009', 'admin_general'::public.app_role);
RESET role;

-- Une ligne par table métier sur chaque société ; employé et article retenus
-- dans cab3.employe_<rang> / cab3.article_<rang>.
DO $$
DECLARE
  s uuid;
  i int := 0;
  e bigint;
  art bigint;
BEGIN
  FOREACH s IN ARRAY ARRAY['00000000-cab3-0000-0001-000000000001',
                           '00000000-cab3-0000-0001-000000000002',
                           '00000000-cab3-0000-0001-000000000003',
                           '00000000-cab3-0000-0001-000000000004',
                           '00000000-cab3-0000-0001-000000000005',
                           '00000000-cab3-0000-0001-000000000006']::uuid[] LOOP
    i := i + 1;
    INSERT INTO public.activites (id, societe_id, nom)
      VALUES (format('00000000-cab3-0000-0004-%s', lpad(i::text, 12, '0'))::uuid, s, 'CAB3 activité');
    INSERT INTO public.employes (societe_id, nom) VALUES (s, 'CAB3 employé') RETURNING id INTO e;
    INSERT INTO public.articles (societe_id, reference, designation) VALUES (s, 'CAB3-ART', 'CAB3 article')
      RETURNING id INTO art;
    PERFORM set_config('cab3.employe_' || i, e::text, true);
    PERFORM set_config('cab3.article_' || i, art::text, true);
    INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
      VALUES (s, 2026, 1, 'OD', 'CAB3 écriture', 'CAB3-' || i);
    INSERT INTO public.transactions (societe_id, annee, mois, date, type, montant, description)
      VALUES (s, 2026, 1, '2026-01-15', 'd', 1000, 'CAB3 transaction');
    INSERT INTO public.exercices (societe_id, annee) VALUES (s, 2026);
    INSERT INTO public.emprunts (societe_id, preteur, montant, duree_mois, date_deblocage)
      VALUES (s, 'CAB3 banque', 1000000, 12, '2026-01-01');
    INSERT INTO public.informations_fiscales (societe_id, annee) VALUES (s, 2026);
    INSERT INTO public.taux_historique (societe_id, date_effet) VALUES (s, '2026-01-01');
    INSERT INTO public.params_annuels (societe_id, annee) VALUES (s, 2026);
    INSERT INTO public.bulletins_paie (societe_id, employe_id, employe_nom, mois, annee)
      VALUES (s, e, 'CAB3 employé', 1, 2026);
    INSERT INTO public.primes (societe_id, employe_id, annee, mois) VALUES (s, e, 2026, 1);
    INSERT INTO public.heures_sup (societe_id, employe_id, annee, mois) VALUES (s, e, 2026, 1);
    INSERT INTO public.retenues (societe_id, employe_id, annee, mois) VALUES (s, e, 2026, 1);
    INSERT INTO public.absences (societe_id, employe_id, annee, mois, type, date_debut, date_fin)
      VALUES (s, e, 2026, 1, 'conge', '2026-01-05', '2026-01-06');
    INSERT INTO public.sanctions (societe_id, employe_id, date, type) VALUES (s, e, '2026-01-10', 'blame');
    INSERT INTO public.factures (societe_id, annee, mois, numero, client, date, statut_validation)
      VALUES (s, 2026, 1, 'CAB3-F-001', 'CAB3 client', '2026-01-20', 'brouillon');
    INSERT INTO public.devis (societe_id, annee, mois, numero, client, date)
      VALUES (s, 2026, 1, 'CAB3-D-001', 'CAB3 client', '2026-01-20');
    INSERT INTO public.compteurs_numerotation (societe_id, type, annee, valeur) VALUES (s, 'facture', 2026, 1);
    INSERT INTO public.mouvements_stock (societe_id, annee, mois, date, article_id, type, quantite)
      VALUES (s, 2026, 1, '2026-01-20', art, 'entree', 1);
    INSERT INTO public.fournisseurs (societe_id, nom) VALUES (s, 'CAB3 fournisseur');
    INSERT INTO public.categories_stock (societe_id, nom) VALUES (s, 'CAB3 catégorie');
    INSERT INTO public.immobilisations (societe_id, libelle, date_acquisition)
      VALUES (s, 'CAB3 immobilisation', '2026-01-01');
    INSERT INTO public.societe_identification (societe_id) VALUES (s);
  END LOOP;
END $$;

-- Tables d'administration : des lignes sur A (utilisateur concerné : 07).
INSERT INTO public.services (id, societe_id, nom) VALUES
  ('00000000-cab3-0000-0007-000000000001', '00000000-cab3-0000-0001-000000000001', 'CAB3 service');
INSERT INTO public.service_membres (service_id, user_id, role) VALUES
  ('00000000-cab3-0000-0007-000000000001', '00000000-cab3-0000-0000-000000000007', 'membre');
INSERT INTO public.custom_services (id, societe_id, code, nom) VALUES
  ('00000000-cab3-0000-0005-000000000001', '00000000-cab3-0000-0001-000000000001', 'cab3', 'CAB3 service perso');
INSERT INTO public.custom_postes (id, service_id, nom, niveau) VALUES
  ('00000000-cab3-0000-0006-000000000001', '00000000-cab3-0000-0005-000000000001', 'CAB3 poste', 'membre');
INSERT INTO public.user_custom_postes (user_id, poste_id, societe_id) VALUES
  ('00000000-cab3-0000-0000-000000000007', '00000000-cab3-0000-0006-000000000001', '00000000-cab3-0000-0001-000000000001');
INSERT INTO public.user_activites (user_id, societe_id, activite_id) VALUES
  ('00000000-cab3-0000-0000-000000000007', '00000000-cab3-0000-0001-000000000001', '00000000-cab3-0000-0004-000000000001');
INSERT INTO public.portail_messages (societe_id, employe_user_id, auteur, contenu) VALUES
  ('00000000-cab3-0000-0001-000000000001', '00000000-cab3-0000-0000-000000000007', 'admin', 'CAB3 message');
INSERT INTO public.permission_overrides (user_id, module, level) VALUES
  ('00000000-cab3-0000-0000-000000000007', 'compta', 'write');
INSERT INTO public.cross_service_grants (user_id, service, level, expires_at) VALUES
  ('00000000-cab3-0000-0000-000000000007', 'compta', 'membre', now() + interval '1 day');

-- Cabinets, membres, liens, attributions.
INSERT INTO public.cabinets (id, nom, societe_propre_id) VALUES
  ('00000000-cab3-0000-0002-000000000001', 'CAB3 Cabinet 1', '00000000-cab3-0000-0001-000000000004'),
  ('00000000-cab3-0000-0002-000000000002', 'CAB3 Cabinet 2', NULL);

INSERT INTO public.cabinet_membres (cabinet_id, user_id, role) VALUES
  ('00000000-cab3-0000-0002-000000000001', '00000000-cab3-0000-0000-000000000001', 'responsable'),
  ('00000000-cab3-0000-0002-000000000001', '00000000-cab3-0000-0000-000000000002', 'collaborateur'),
  ('00000000-cab3-0000-0002-000000000001', '00000000-cab3-0000-0000-000000000003', 'stagiaire'),
  ('00000000-cab3-0000-0002-000000000001', '00000000-cab3-0000-0000-000000000004', 'collaborateur'),
  ('00000000-cab3-0000-0002-000000000001', '00000000-cab3-0000-0000-000000000005', 'collaborateur'),
  ('00000000-cab3-0000-0002-000000000002', '00000000-cab3-0000-0000-000000000006', 'responsable');

INSERT INTO public.cabinet_dossiers (id, cabinet_id, societe_id, mission, etat, origine, termine_le) VALUES
  ('00000000-cab3-0000-0003-000000000001', '00000000-cab3-0000-0002-000000000001',
   '00000000-cab3-0000-0001-000000000001', 'tenue_complete',   'actif',      'cabinet', NULL),
  ('00000000-cab3-0000-0003-000000000002', '00000000-cab3-0000-0002-000000000001',
   '00000000-cab3-0000-0001-000000000002', 'compta_fiscalite', 'actif',      'cabinet', NULL),
  ('00000000-cab3-0000-0003-000000000003', '00000000-cab3-0000-0002-000000000002',
   '00000000-cab3-0000-0001-000000000003', 'tenue_complete',   'actif',      'client',  NULL),
  ('00000000-cab3-0000-0003-000000000004', '00000000-cab3-0000-0002-000000000001',
   '00000000-cab3-0000-0001-000000000005', 'tenue_complete',   'invitation', 'client',  NULL),
  ('00000000-cab3-0000-0003-000000000005', '00000000-cab3-0000-0002-000000000001',
   '00000000-cab3-0000-0001-000000000006', 'tenue_complete',   'termine',    'cabinet', now());

INSERT INTO public.cabinet_attributions (dossier_id, user_id, mission) VALUES
  ('00000000-cab3-0000-0003-000000000001', '00000000-cab3-0000-0000-000000000002', 'compta_fiscalite'),
  ('00000000-cab3-0000-0003-000000000001', '00000000-cab3-0000-0000-000000000003', 'tenue_complete'),
  ('00000000-cab3-0000-0003-000000000001', '00000000-cab3-0000-0000-000000000004', 'lecture'),
  ('00000000-cab3-0000-0003-000000000001', '00000000-cab3-0000-0000-000000000005', 'paie_social'),
  -- Attributions sur les liens en invitation et terminé : sans effet.
  ('00000000-cab3-0000-0003-000000000004', '00000000-cab3-0000-0000-000000000002', 'tenue_complete'),
  ('00000000-cab3-0000-0003-000000000005', '00000000-cab3-0000-0000-000000000002', 'tenue_complete');

-- ─── Vérification générique d'une table métier à l'autre ───────────────────
-- Pour l'utilisateur _uid sur la société _societe (rang _rang), avec la
-- mission effective _mission (NULL : aucun accès) plafonnée à _plafond
-- (2 stagiaire, 1 départ), et _ouvert vrai en phase 2 (règle « tout ouvert ») :
--   lecture       : lignes lues > 0  ⇔ niveau >= 1 ;
--   INSERT, UPDATE neutre : acceptés ⇔ niveau >= niveau d'écriture, et règle
--                   permissive (cabinet ou « tout ouvert »), et droit SQL ;
--   DELETE        : accepté ⇔ niveau de suppression défini et atteint (une
--                   erreur de clé étrangère 23503 compte comme acceptée : les
--                   lignes ont passé les règles).
-- Les écarts sont réunis dans une seule exception.
CREATE FUNCTION pg_temp.cab3_verifier(_qui text, _uid uuid, _societe uuid, _rang int,
                                      _mission text, _plafond int, _ouvert boolean)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  r record;
  lvl int;
  n bigint;
  etat text;
  attendu boolean;
  ins text;
  ecarts text := '';
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal2"}', _uid), true);

  FOR r IN
    SELECT x->>0 AS tab, x->>1 AS col, x->>2 AS module, (x->>3)::int AS ne,
           (x->>4)::boolean AS directe, (x->>5)::int AS ns
    FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
  LOOP
    lvl := CASE WHEN _mission IS NULL THEN 0
                ELSE least(public.niveau_mission(_mission::public.mission_cabinet, r.module), _plafond) END;

    -- Lecture.
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tab, r.col) INTO n USING _societe;
    IF (n > 0) IS DISTINCT FROM (lvl >= 1) THEN
      ecarts := ecarts || format('; %s lecture=%s (niveau %s)', r.tab, n, lvl);
    END IF;

    -- INSERT.
    attendu := lvl >= r.ne AND (r.directe OR _ouvert)
               AND has_table_privilege('authenticated', format('public.%I', r.tab), 'INSERT');
    ins := replace(replace(replace(current_setting('cab3.sondes')::jsonb ->> r.tab,
             '{s}', quote_literal(_societe)),
             '{e}', current_setting('cab3.employe_' || _rang)),
             '{a}', current_setting('cab3.article_' || _rang));
    BEGIN
      BEGIN
        EXECUTE ins;
        etat := 'ok';
      EXCEPTION
        WHEN insufficient_privilege THEN etat := 'refus';
        WHEN OTHERS THEN etat := SQLSTATE;
      END;
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
    END;
    IF etat NOT IN ('ok', 'refus') OR (etat = 'ok') IS DISTINCT FROM attendu THEN
      ecarts := ecarts || format('; %s insert=%s (niveau %s)', r.tab, etat, lvl);
    END IF;

    -- UPDATE neutre.
    attendu := lvl >= r.ne AND (r.directe OR _ouvert)
               AND has_table_privilege('authenticated', format('public.%I', r.tab), 'UPDATE');
    BEGIN
      BEGIN
        EXECUTE format('UPDATE public.%I SET %I = %I WHERE %I = $1', r.tab, r.col, r.col, r.col) USING _societe;
        GET DIAGNOSTICS n = ROW_COUNT;
        etat := CASE WHEN n > 0 THEN 'ok' ELSE 'refus' END;
      EXCEPTION
        WHEN insufficient_privilege THEN etat := 'refus';
        WHEN OTHERS THEN etat := SQLSTATE;
      END;
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
    END;
    IF etat NOT IN ('ok', 'refus') OR (etat = 'ok') IS DISTINCT FROM attendu THEN
      ecarts := ecarts || format('; %s update=%s (niveau %s)', r.tab, etat, lvl);
    END IF;

    -- DELETE.
    attendu := r.ns IS NOT NULL AND lvl >= r.ns
               AND has_table_privilege('authenticated', format('public.%I', r.tab), 'DELETE');
    BEGIN
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tab, r.col) USING _societe;
        GET DIAGNOSTICS n = ROW_COUNT;
        etat := CASE WHEN n > 0 THEN 'ok' ELSE 'refus' END;
      EXCEPTION
        WHEN foreign_key_violation THEN etat := 'ok';
        WHEN insufficient_privilege THEN etat := 'refus';
        WHEN OTHERS THEN etat := SQLSTATE;
      END;
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
    END;
    IF etat NOT IN ('ok', 'refus') OR (etat = 'ok') IS DISTINCT FROM attendu THEN
      ecarts := ecarts || format('; %s delete=%s (niveau %s)', r.tab, etat, lvl);
    END IF;
  END LOOP;

  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF ecarts <> '' THEN
    RAISE EXCEPTION 'cab3_verifier % (société %, phase %) :%', _qui, _rang,
      CASE WHEN _ouvert THEN 'ouverte' ELSE 'réelle' END, ecarts;
  END IF;
END
$f$;

-- ─── Vérification des tables d'administration de A ──────────────────────────
-- _acces faux (membre de cabinet) : 0 ligne lue, UPDATE et DELETE sans effet,
-- INSERT refusé. _acces vrai (accès direct) : les lignes sont lues.
CREATE FUNCTION pg_temp.cab3_admin(_qui text, _uid uuid, _acces boolean)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  r record;
  n bigint;
  etat text;
  ecarts text := '';
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal2"}', _uid), true);

  FOR r IN
    SELECT x->>0 AS tab, x->>1 AS col, x->>2 AS val, x->>3 AS ins
    FROM jsonb_array_elements(current_setting('cab3.admin')::jsonb) x
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1::uuid', r.tab, r.col) INTO n USING r.val;
    IF (n > 0) IS DISTINCT FROM _acces THEN
      ecarts := ecarts || format('; %s lecture=%s', r.tab, n);
    END IF;
    CONTINUE WHEN _acces;

    BEGIN
      BEGIN
        EXECUTE format('UPDATE public.%I SET %I = %I WHERE %I = $1::uuid', r.tab, r.col, r.col, r.col) USING r.val;
        GET DIAGNOSTICS n = ROW_COUNT;
        etat := CASE WHEN n > 0 THEN 'ok' ELSE 'refus' END;
      EXCEPTION WHEN insufficient_privilege THEN etat := 'refus';
                WHEN OTHERS THEN etat := SQLSTATE;
      END;
      IF etat <> 'refus' THEN ecarts := ecarts || format('; %s update=%s', r.tab, etat); END IF;

      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1::uuid', r.tab, r.col) USING r.val;
        GET DIAGNOSTICS n = ROW_COUNT;
        etat := CASE WHEN n > 0 THEN 'ok' ELSE 'refus' END;
      EXCEPTION WHEN insufficient_privilege THEN etat := 'refus';
                WHEN OTHERS THEN etat := SQLSTATE;
      END;
      IF etat <> 'refus' THEN ecarts := ecarts || format('; %s delete=%s', r.tab, etat); END IF;

      BEGIN
        EXECUTE replace(r.ins, '{u}', quote_literal(_uid));
        etat := 'ok';
      EXCEPTION WHEN insufficient_privilege THEN etat := 'refus';
                WHEN OTHERS THEN etat := SQLSTATE;
      END;
      IF etat <> 'refus' THEN ecarts := ecarts || format('; %s insert=%s', r.tab, etat); END IF;

      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'sonde annulée';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
    END;
  END LOOP;

  EXECUTE 'SET LOCAL ROLE NONE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF ecarts <> '' THEN
    RAISE EXCEPTION 'cab3_admin % :%', _qui, ecarts;
  END IF;
END
$f$;

-- ═══ Phase 1 : règles réelles ═══════════════════════════════════════════════
-- Rangs : A 1, B 2, C 3, S 4, E 5, F 6.
DO $$
DECLARE
  a  constant uuid := '00000000-cab3-0000-0001-000000000001';
  b  constant uuid := '00000000-cab3-0000-0001-000000000002';
  c  constant uuid := '00000000-cab3-0000-0001-000000000003';
  s  constant uuid := '00000000-cab3-0000-0001-000000000004';
  e  constant uuid := '00000000-cab3-0000-0001-000000000005';
  f  constant uuid := '00000000-cab3-0000-0001-000000000006';
  r1 constant uuid := '00000000-cab3-0000-0000-000000000001';
  c1 constant uuid := '00000000-cab3-0000-0000-000000000002';
BEGIN
  -- C1 : compta_fiscalite sur A ; rien sur B (non attribué), C (autre
  -- cabinet), S (société propre du cabinet), E (invitation), F (terminé).
  PERFORM pg_temp.cab3_verifier('C1', c1, a, 1, 'compta_fiscalite', 3, false);
  PERFORM pg_temp.cab3_verifier('C1', c1, b, 2, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('C1', c1, c, 3, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('C1', c1, s, 4, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('C1', c1, e, 5, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('C1', c1, f, 6, NULL, 3, false);
  -- Stagiaire (plafond 2) : saisie, ni clôture ni suppression.
  PERFORM pg_temp.cab3_verifier('stagiaire', '00000000-cab3-0000-0000-000000000003', a, 1, 'tenue_complete', 2, false);
  -- Lecture, paie_social.
  PERFORM pg_temp.cab3_verifier('lecture', '00000000-cab3-0000-0000-000000000004', a, 1, 'lecture', 3, false);
  PERFORM pg_temp.cab3_verifier('paie_social', '00000000-cab3-0000-0000-000000000005', a, 1, 'paie_social', 3, false);
  -- Responsable 1, rôle global admin : la mission du dossier, pas plus.
  PERFORM pg_temp.cab3_verifier('R1', r1, a, 1, 'tenue_complete', 3, false);
  PERFORM pg_temp.cab3_verifier('R1', r1, b, 2, 'compta_fiscalite', 3, false);
  PERFORM pg_temp.cab3_verifier('R1', r1, c, 3, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('R1', r1, e, 5, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('R1', r1, f, 6, NULL, 3, false);
  -- Responsable 2 : C seulement.
  PERFORM pg_temp.cab3_verifier('R2', '00000000-cab3-0000-0000-000000000006', c, 3, 'tenue_complete', 3, false);
  PERFORM pg_temp.cab3_verifier('R2', '00000000-cab3-0000-0000-000000000006', a, 1, NULL, 3, false);
  -- Tables d'administration de A.
  PERFORM pg_temp.cab3_admin('C1', c1, false);
  PERFORM pg_temp.cab3_admin('R1', r1, false);
  PERFORM pg_temp.cab3_admin('stagiaire', '00000000-cab3-0000-0000-000000000003', false);
  PERFORM pg_temp.cab3_admin('administrateur de A', '00000000-cab3-0000-0000-000000000007', true);
END $$;

-- Cas particuliers, en sessions simulées.
SET LOCAL role authenticated;

-- ─── C1 (compta_fiscalite sur A) ────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  a constant uuid := '00000000-cab3-0000-0001-000000000001';
  b constant uuid := '00000000-cab3-0000-0001-000000000002';
  n bigint;
BEGIN
  -- Le sélecteur : A seule.
  ASSERT (SELECT array_agg(id ORDER BY id) FROM public.societes
          WHERE id::text LIKE '00000000-cab3-0000-0001-%') = ARRAY[a],
    'C1 : SELECT FROM societes doit rendre A seule';

  -- Niveau 3 : suppression d'une écriture brouillon acceptée.
  INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
    VALUES (a, 2026, 2, 'OD', 'CAB3 saisie C1', 'CAB3-C1-1');
  INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
    VALUES (a, 2026, 2, 'OD', 'CAB3 saisie C1 à supprimer', 'CAB3-C1-2');
  DELETE FROM public.ecritures_comptables WHERE societe_id = a AND numero_piece = 'CAB3-C1-2';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'C1 : suppression d''une écriture brouillon refusée';

  -- Exercices : création au niveau 3, jamais de suppression.
  INSERT INTO public.exercices (societe_id, annee) VALUES (a, 2031);
  DELETE FROM public.exercices WHERE societe_id = a;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'C1 : exercice supprimé';

  -- Une ligne ne change pas de société (A → B).
  BEGIN
    UPDATE public.ecritures_comptables SET societe_id = b WHERE societe_id = a AND numero_piece = 'CAB3-C1-1';
    RAISE EXCEPTION 'C1 : changement de société accepté';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SOCIETE_IMMUABLE%' THEN
      RAISE EXCEPTION 'C1, A → B : attendu SOCIETE_IMMUABLE, obtenu %', SQLERRM;
    END IF;
  END;
END $$;

-- La liste de l'appelant est calculée une fois par requête (InitPlan), pas
-- une fois par ligne.
DO $$
DECLARE
  lignes text[];
  i int;
  k int;
  m text[];
  jeton text;
  nb int := 0;
  plan text;
BEGIN
  lignes := '{}';
  FOR plan IN EXECUTE 'EXPLAIN (VERBOSE, COSTS OFF) SELECT id FROM public.ecritures_comptables' LOOP
    lignes := lignes || plan;
  END LOOP;
  plan := array_to_string(lignes, E'\n');

  -- Exactement une InitPlan qui calcule cabinet_societes_agit() ; le filtre
  -- y fait référence ($n jusqu'à PostgreSQL 16, (InitPlan n) ensuite).
  FOR i IN 1 .. cardinality(lignes) LOOP
    m := regexp_match(lignes[i], 'InitPlan (\d+)(?: \(returns (\$\d+)\))?');
    CONTINUE WHEN m IS NULL;
    FOR k IN i + 1 .. least(i + 3, cardinality(lignes)) LOOP
      IF lignes[k] LIKE '%cabinet_societes_agit()%' THEN
        nb := nb + 1;
        jeton := coalesce(m[2], '(InitPlan ' || m[1] || ')');
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  ASSERT nb = 1, format('EXPLAIN : %s InitPlan pour cabinet_societes_agit, attendu 1', nb) || E'\n' || plan;
  ASSERT EXISTS (SELECT 1 FROM unnest(lignes) l
                 WHERE l LIKE '%Filter:%' AND position(jeton IN l) > 0),
    format('EXPLAIN : aucun filtre ne référence %s', jeton) || E'\n' || plan;
  ASSERT plan LIKE '%cabinet_societes(%', 'EXPLAIN : cabinet_societes absente du plan' || E'\n' || plan;
  -- Aucun filtre par ligne n'appelle les fonctions.
  ASSERT NOT EXISTS (SELECT 1 FROM unnest(lignes) l WHERE l ~ 'Filter:.*cabinet_societes'),
    'EXPLAIN : cabinet_societes évaluée par ligne' || E'\n' || plan;
END $$;

-- ─── Collaborateur en lecture : upsert refusé ──────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000004","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.informations_fiscales (societe_id, annee, donnees)
      VALUES ('00000000-cab3-0000-0001-000000000001', 2026, '{"x":1}')
      ON CONFLICT (societe_id, annee) DO UPDATE SET donnees = excluded.donnees;
    RAISE EXCEPTION 'lecture : upsert accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ─── Responsable 1 : client A (mission) et sa propre société S (accès direct)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  a constant uuid := '00000000-cab3-0000-0001-000000000001';
  b constant uuid := '00000000-cab3-0000-0001-000000000002';
  s constant uuid := '00000000-cab3-0000-0001-000000000004';
  r record;
  n bigint;
BEGIN
  ASSERT (SELECT array_agg(id ORDER BY id) FROM public.societes
          WHERE id::text LIKE '00000000-cab3-0000-0001-%') = ARRAY[a, b, s],
    'R1 : sociétés attendues A, B et S';

  -- S : tous ses droits habituels d'administrateur.
  FOR r IN
    SELECT x->>0 AS tab, x->>1 AS col
    FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tab, r.col) INTO n USING s;
    ASSERT n > 0, format('R1 : %s de S illisible', r.tab);
  END LOOP;
  INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
    VALUES (s, 2026, 2, 'OD', 'CAB3 saisie R1 sur S', 'CAB3-R1-S');
  UPDATE public.societes SET nom = nom WHERE id = s;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'R1 : UPDATE de sa société S refusé';
  UPDATE public.societe_config SET societe_id = societe_id WHERE societe_id = s;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'R1 : UPDATE de societe_config de S refusé';
  DELETE FROM public.exercices WHERE societe_id = s AND annee = 2026;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'R1 : suppression d''un exercice de S refusée';
  DELETE FROM public.transactions WHERE societe_id = s;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'R1 : suppression d''une transaction de S refusée';
  INSERT INTO public.services (societe_id, nom) VALUES (s, 'CAB3 service R1');
  ASSERT (SELECT count(*) FROM public.services WHERE societe_id = s) > 0, 'R1 : services de S illisibles';
  INSERT INTO public.permission_overrides (user_id, module, level)
    VALUES ('00000000-cab3-0000-0000-000000000008', 'compta', 'read');
  ASSERT (SELECT count(*) FROM public.permission_overrides
          WHERE user_id = '00000000-cab3-0000-0000-000000000008') = 1,
    'R1 : droits de l''employé de S illisibles';

  -- A → S : une ligne ne change pas de société, même vers la sienne.
  BEGIN
    UPDATE public.ecritures_comptables SET societe_id = s WHERE societe_id = a AND numero_piece = 'CAB3-1';
    RAISE EXCEPTION 'R1 : changement de société accepté';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SOCIETE_IMMUABLE%' THEN
      RAISE EXCEPTION 'R1, A → S : attendu SOCIETE_IMMUABLE, obtenu %', SQLERRM;
    END IF;
  END;
  -- Exercice de A : jamais supprimé par un cabinet, même au niveau 3.
  DELETE FROM public.exercices WHERE societe_id = a;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'R1 : exercice de A supprimé';
END $$;

-- ─── Super-admin : peut déplacer une ligne (exception du trigger) ──────────
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000009","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  n bigint;
BEGIN
  UPDATE public.ecritures_comptables SET societe_id = '00000000-cab3-0000-0001-000000000002'
  WHERE societe_id = '00000000-cab3-0000-0001-000000000001' AND numero_piece = 'CAB3-1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'super-admin : déplacement refusé';
  UPDATE public.ecritures_comptables SET societe_id = '00000000-cab3-0000-0001-000000000001'
  WHERE societe_id = '00000000-cab3-0000-0001-000000000002' AND numero_piece = 'CAB3-1';
END $$;

-- ─── Hors session utilisateur (postgres) : idem ─────────────────────────────
RESET role;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.ecritures_comptables SET societe_id = '00000000-cab3-0000-0001-000000000002'
WHERE societe_id = '00000000-cab3-0000-0001-000000000001' AND numero_piece = 'CAB3-1';
UPDATE public.ecritures_comptables SET societe_id = '00000000-cab3-0000-0001-000000000001'
WHERE societe_id = '00000000-cab3-0000-0001-000000000002' AND numero_piece = 'CAB3-1';

-- ─── Administrateur direct de A : inchangé ──────────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000007","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE
  a constant uuid := '00000000-cab3-0000-0001-000000000001';
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT x->>0 AS tab, x->>1 AS col
    FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tab, r.col) INTO n USING a;
    ASSERT n > 0, format('administrateur de A : %s illisible', r.tab);
  END LOOP;
  INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
    VALUES (a, 2026, 2, 'OD', 'CAB3 saisie administrateur', 'CAB3-ADM-A');
  INSERT INTO public.services (societe_id, nom) VALUES (a, 'CAB3 service administrateur');
  -- Lui ne déplace pas une ligne non plus.
  BEGIN
    UPDATE public.ecritures_comptables SET societe_id = '00000000-cab3-0000-0001-000000000004'
    WHERE societe_id = a AND numero_piece = 'CAB3-ADM-A';
    RAISE EXCEPTION 'administrateur de A : changement de société accepté';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SOCIETE_IMMUABLE%' THEN
      RAISE EXCEPTION 'administrateur de A : attendu SOCIETE_IMMUABLE, obtenu %', SQLERRM;
    END IF;
  END;
END $$;

-- ═══ Phase 2 : filet de sécurité ════════════════════════════════════════════
-- Une règle permissive « tout ouvert » sur chaque table : seules les règles
-- RESTRICTIVES (celles du cabinet et les restrictives existantes) bornent
-- encore l'accès. Ce filet ne borne que les sociétés où l'utilisateur agit
-- comme cabinet : une société qu'on ne lui a pas attribuée (B pour C1) reste
-- protégée par les règles existantes, que cette phase met de côté ; elle
-- n'est donc pas vérifiée ici (elle l'est en phase 1).
RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT x->>0 FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
    UNION ALL
    SELECT x->>0 FROM jsonb_array_elements(current_setting('cab3.admin')::jsonb) x
  LOOP
    EXECUTE format('CREATE POLICY zz_test_ouvert ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

DO $$
DECLARE
  a  constant uuid := '00000000-cab3-0000-0001-000000000001';
  b  constant uuid := '00000000-cab3-0000-0001-000000000002';
  r1 constant uuid := '00000000-cab3-0000-0000-000000000001';
  c1 constant uuid := '00000000-cab3-0000-0000-000000000002';
BEGIN
  -- Une sonde INSERT, UPDATE et DELETE par table : le plafond de la mission
  -- tient seul (stagiaire refusé sur exercices et sur toute suppression,
  -- paie_social sans écriture en compta, lecture sans aucune écriture).
  PERFORM pg_temp.cab3_verifier('C1', c1, a, 1, 'compta_fiscalite', 3, true);
  PERFORM pg_temp.cab3_verifier('stagiaire', '00000000-cab3-0000-0000-000000000003', a, 1, 'tenue_complete', 2, true);
  PERFORM pg_temp.cab3_verifier('lecture', '00000000-cab3-0000-0000-000000000004', a, 1, 'lecture', 3, true);
  PERFORM pg_temp.cab3_verifier('paie_social', '00000000-cab3-0000-0000-000000000005', a, 1, 'paie_social', 3, true);
  PERFORM pg_temp.cab3_verifier('R1', r1, a, 1, 'tenue_complete', 3, true);
  PERFORM pg_temp.cab3_verifier('R1', r1, b, 2, 'compta_fiscalite', 3, true);
  -- Tables d'administration : lecture, UPDATE, DELETE et INSERT refusés.
  PERFORM pg_temp.cab3_admin('C1', c1, false);
  PERFORM pg_temp.cab3_admin('R1', r1, false);
  PERFORM pg_temp.cab3_admin('lecture', '00000000-cab3-0000-0000-000000000004', false);
END $$;

-- Cas nommés, sous la règle « tout ouvert ».
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000003","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.exercices (societe_id, annee) VALUES ('00000000-cab3-0000-0001-000000000001', 2030);
    RAISE EXCEPTION 'filet, stagiaire : exercice créé';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-cab3-0000-0000-000000000005","role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
      VALUES ('00000000-cab3-0000-0001-000000000001', 2026, 2, 'OD', 'CAB3 intrus paie', 'CAB3-PAIE');
    RAISE EXCEPTION 'filet, paie_social : écriture comptable insérée';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.factures WHERE societe_id = '00000000-cab3-0000-0001-000000000001') = 0,
    'filet, paie_social : factures lues';
END $$;

RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT x->>0 FROM jsonb_array_elements(current_setting('cab3.tables')::jsonb) x
    UNION ALL
    SELECT x->>0 FROM jsonb_array_elements(current_setting('cab3.admin')::jsonb) x
  LOOP
    EXECUTE format('DROP POLICY zz_test_ouvert ON public.%I', t);
  END LOOP;
END $$;

-- ═══ Phase 3 : A en depart_demande → lecture seule pour tous ═══════════════
UPDATE public.cabinet_dossiers SET etat = 'depart_demande', depart_demande_le = now()
WHERE id = '00000000-cab3-0000-0003-000000000001';
DO $$
DECLARE
  a constant uuid := '00000000-cab3-0000-0001-000000000001';
BEGIN
  PERFORM pg_temp.cab3_verifier('C1 départ', '00000000-cab3-0000-0000-000000000002', a, 1, 'compta_fiscalite', 1, false);
  PERFORM pg_temp.cab3_verifier('R1 départ', '00000000-cab3-0000-0000-000000000001', a, 1, 'tenue_complete', 1, false);
  PERFORM pg_temp.cab3_verifier('stagiaire départ', '00000000-cab3-0000-0000-000000000003', a, 1, 'tenue_complete', 1, false);
END $$;
UPDATE public.cabinet_dossiers SET etat = 'actif', depart_demande_le = NULL
WHERE id = '00000000-cab3-0000-0003-000000000001';

-- ═══ Phase 4 : membre, puis cabinet désactivés en cours de transaction ═════
-- L'accès est coupé dès la requête suivante.
UPDATE public.cabinet_membres SET actif = false WHERE user_id = '00000000-cab3-0000-0000-000000000002';
DO $$
BEGIN
  PERFORM pg_temp.cab3_verifier('C1 désactivé', '00000000-cab3-0000-0000-000000000002',
                                '00000000-cab3-0000-0001-000000000001', 1, NULL, 3, false);
  -- Les autres membres gardent leur accès.
  PERFORM pg_temp.cab3_verifier('R1', '00000000-cab3-0000-0000-000000000001',
                                '00000000-cab3-0000-0001-000000000001', 1, 'tenue_complete', 3, false);
END $$;
UPDATE public.cabinet_membres SET actif = true WHERE user_id = '00000000-cab3-0000-0000-000000000002';
UPDATE public.cabinets SET actif = false WHERE id = '00000000-cab3-0000-0002-000000000001';
DO $$
BEGIN
  PERFORM pg_temp.cab3_verifier('R1, cabinet désactivé', '00000000-cab3-0000-0000-000000000001',
                                '00000000-cab3-0000-0001-000000000001', 1, NULL, 3, false);
  PERFORM pg_temp.cab3_verifier('C1, cabinet désactivé', '00000000-cab3-0000-0000-000000000002',
                                '00000000-cab3-0000-0001-000000000001', 1, NULL, 3, false);
END $$;
UPDATE public.cabinets SET actif = true WHERE id = '00000000-cab3-0000-0002-000000000001';

-- ═══ Tâche 4 : cas attendus en échec aujourd'hui (ne pas exiger encore) ════
-- Le responsable 1 a le rôle global admin : is_admin le dispense des
-- contrôles de réouverture et des quatre yeux. La tâche 4 doit fermer ces
-- trois cas ; retirer les marques de commentaire à ce moment-là.
--
-- UPDATE public.exercices SET statut = 'cloture'
-- WHERE societe_id = '00000000-cab3-0000-0001-000000000001' AND annee = 2026;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims',
--   '{"sub":"00000000-cab3-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
-- DO $$
-- DECLARE
--   a constant uuid := '00000000-cab3-0000-0001-000000000001';
-- BEGIN
--   -- 1. Réouverture d'un exercice clos par un responsable admin : refusée.
--   BEGIN
--     UPDATE public.exercices SET statut = 'ouvert' WHERE societe_id = a AND annee = 2026;
--     RAISE EXCEPTION 'tâche 4 : exercice rouvert par le cabinet';
--   EXCEPTION WHEN insufficient_privilege THEN NULL;
--   END;
--   -- 2. UPDATE de l'année d'un exercice clos : refusé.
--   BEGIN
--     UPDATE public.exercices SET annee = 2027 WHERE societe_id = a AND annee = 2026;
--     RAISE EXCEPTION 'tâche 4 : année d''un exercice clos modifiée';
--   EXCEPTION WHEN insufficient_privilege THEN NULL;
--   END;
--   -- 3. Validation de sa propre saisie par un responsable admin : refusée.
--   INSERT INTO public.ecritures_comptables (societe_id, annee, mois, journal, libelle, numero_piece)
--     VALUES (a, 2025, 2, 'OD', 'CAB3 saisie R1 à valider', 'CAB3-R1-VAL');
--   BEGIN
--     UPDATE public.ecritures_comptables SET statut = 'valide'
--     WHERE societe_id = a AND numero_piece = 'CAB3-R1-VAL';
--     RAISE EXCEPTION 'tâche 4 : propre saisie validée par le cabinet';
--   EXCEPTION WHEN insufficient_privilege THEN NULL;
--   END;
-- END $$;
-- RESET role;

RESET role;
SELECT set_config('request.jwt.claims', '', true);
DO $$ BEGIN RAISE NOTICE 'OK cabinet_regles_acces'; END $$;
-- fin test
ROLLBACK;
