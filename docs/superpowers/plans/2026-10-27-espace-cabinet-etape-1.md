# Espace cabinet, étape 1 (socle) — plan de travail

> **Pour l'exécution :** sous-compétence requise : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes sont des cases à cocher (`- [ ]`).

**Objectif :** un collaborateur de cabinet se connecte une fois, voit ses dossiers clients dans le sélecteur et y travaille avec les droits de sa mission ; le responsable gère son équipe et ses dossiers ; le super-admin crée les cabinets et rattache les clients ; le comptable délégué disparaît.

**Architecture :** quatre tables (`cabinets`, `cabinet_membres`, `cabinet_dossiers`, `cabinet_attributions`). L'accès d'un membre de cabinet à une société passe par deux fonctions, `agit_comme_cabinet()` et `cabinet_niveau()`, branchées sur `est_personnel()`, une règle permissive et deux règles restrictives par table métier. Les opérations sont des fonctions SQL `cabinet_*` testées en SQL. L'application traduit la mission du dossier ouvert en `PermissionMap`.

**Technique :** Supabase (Postgres, RLS, fonctions Edge Deno), React, TanStack Query, Vitest.

**Spécification :** `docs/superpowers/specs/2026-10-27-espace-cabinet-design.md` (§ 4 à 8, étape 1 du § 9).

## Contraintes générales

- Migrations dans `supabase/migrations/2026102712xxxx_cabinet_*.sql`. **L'utilisateur les applique** (apply_migration est refusé) et déploie lui-même la fonction Edge.
- Chaque nouvelle table : `ENABLE ROW LEVEL SECURITY` et `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` (sans GRANT : 403). L'écriture directe sur les tables cabinet est refusée par RLS : tout passe par les fonctions `cabinet_*`.
- Chaque fonction : `SECURITY DEFINER`, `SET search_path = public`, `REVOKE EXECUTE … FROM anon, public`, `GRANT EXECUTE … TO authenticated`.
- `user_roles` et `user_societes` ne s'écrivent que par service_role (règle du 24/10/2026) : les fonctions `cabinet_*` n'y écrivent jamais, sauf `cabinet-ops` pour l'administrateur client.
- Un membre de cabinet n'a ni rôle global ni ligne `user_societes` pour un dossier client.
- Missions, valeurs exactes : `tenue_complete`, `compta_fiscalite`, `paie_social`, `declarations`, `lecture`. Rôles de membre : `responsable`, `collaborateur`, `stagiaire`. États de lien : `invitation`, `actif`, `depart_demande`, `termine`. Origine : `cabinet`, `client`, `super_admin`.
- Niveaux : 0 aucun, 1 lecture, 2 saisie, 3 validation (même échelle que `AccessLevel` : `none`, `read`, `write`, `validate`).
- Textes de l'interface en français. Données de test sur des sociétés de test seulement. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push sans accord.
- Une société sans cabinet doit se comporter **exactement** comme avant : les 267 tests existants restent verts, et le test SQL « sans cabinet » (tâche 3) doit passer.

## Points de vigilance (non couverts ailleurs, tests ajoutés aux tâches indiquées)

1. Une personne qui a à la fois un accès direct (`user_societes`) et un lien cabinet sur la même société : l'accès direct prime, avec ses rôles habituels → test en tâche 2.
2. Le client baisse la mission alors que des attributions sont plus hautes : le droit effectif baisse immédiatement, sans réécrire les attributions → test en tâche 2.
3. Passage d'un dossier à un autre dans le même onglet : les droits affichés doivent suivre le dossier ouvert, pas le précédent → test en tâche 6.
4. Un membre désactivé, ou un cabinet désactivé, perd l'accès à la requête suivante, sans attendre une reconnexion → test en tâche 2.
5. La limite de dossiers : le 10ᵉ dossier passe, le 11ᵉ est refusé avec un message clair → test en tâche 5.

## Base de test

*(Décidé le 2026-10-27 : la branche Supabase ne peut pas être construite, car les migrations du dépôt ne se rejouent pas sur une base neuve.)*

Les tests SQL (`supabase/tests/cabinet_*.sql`) tournent **sur la production, dans une transaction annulée** : `BEGIN;`, puis la ou les migrations de la tâche (et des tâches précédentes pas encore appliquées), puis les fixtures et les vérifications, puis `ROLLBACK;`. Les changements de structure de Postgres s'annulent aussi : rien ne reste en base. Les fixtures (utilisateurs, sociétés, cabinets) sont créées dans la transaction, avec des uuid fixes. Les sessions sont simulées par `SET LOCAL role authenticated` et `set_config('request.jwt.claims', '{"sub":"…","role":"authenticated","aal":"aal2"}', true)`. Les tests se lancent à un moment calme, car les tables touchées restent verrouillées quelques secondes.

Chaque fichier de test commence par `BEGIN;` et se termine par `RAISE NOTICE 'OK <nom>'` puis `ROLLBACK;`. Le moindre `ASSERT` qui échoue interrompt la transaction : c'est l'échec attendu tant que le code n'existe pas. Pour un test qui dépend des migrations, le lanceur concatène `BEGIN;`, les migrations, puis le corps du test (sans son propre `BEGIN;`). Les tests le prévoient : leur corps est délimité par `-- debut test` et `-- fin test`.

L'utilisateur applique les migrations définitives après le passage des tests (étapes « l'utilisateur applique »).

---

### Tâche 1 : schéma (tables, types, accès aux tables cabinet) — 1 j

**Fichiers :**
- Créer : `supabase/migrations/20261027120000_cabinet_schema.sql`
- Créer : `supabase/tests/cabinet_schema.sql`

**Interfaces :**
- Produit : les types `mission_cabinet`, `role_cabinet`, `etat_dossier_cabinet` et `origine_dossier_cabinet`.
- Produit : les tables du § 4.1 à 4.4 de la spec, avec ces contraintes :
  - `cabinet_membres.user_id UNIQUE` ;
  - un index unique partiel sur `cabinet_dossiers(societe_id) WHERE etat <> 'termine'` ;
  - `cabinet_attributions` en clé primaire `(dossier_id, user_id)`.
- Produit : `cabinets.max_dossiers int NOT NULL DEFAULT 10`.

- [ ] **1.1 Écrire le test** `cabinet_schema.sql`. Il doit vérifier que :
  - deux liens non terminés sur la même société sont refusés (`unique_violation`) ;
  - un même utilisateur ne peut pas être dans deux cabinets ;
  - en session simulée, un membre ne lit que les lignes de son cabinet (`cabinets`, `cabinet_membres`, `cabinet_dossiers`, `cabinet_attributions`), et un `INSERT` direct dans `cabinet_dossiers` est refusé ;
  - l'administrateur d'une société cliente lit le lien de sa société, et le super-admin lit tout.
- [ ] **1.2 Lancer le test** → échec : relation inexistante.
- [ ] **1.3 Écrire la migration.**
  - Règles SELECT : membre du cabinet, administrateur de la société liée (`admin_gere_utilisateur` ou `has_societe_access` + `is_admin`), ou `is_admin_general`.
  - Aucune règle INSERT, UPDATE ni DELETE : tout passe par les fonctions.
  - Les GRANT.
- [ ] **1.4 L'utilisateur applique la migration ; relancer le test** → `OK cabinet_schema`.
- [ ] **1.5 Commit** `Espace cabinet : tables et types`.

### Tâche 2 : calcul des droits d'un membre de cabinet — 1,5 j

**Fichiers :**
- Créer : `supabase/migrations/20261027121000_cabinet_droits.sql`
- Créer : `supabase/tests/cabinet_droits.sql`

**Interfaces :**
- Consomme : les tables de la tâche 1.
- Produit :
  - `niveau_mission(_mission mission_cabinet, _module text) RETURNS int` : matrice du § 5 de la spec. Les modules : `compta`, `fiscalite`, `grh`, `factures`, `stock`, `immobilisations`, `parametres`, `dashboard`. Le tableau de bord est toujours à 1. La paie et le social (`grh`) couvrent aussi `parametres_sociaux`.
  - `agit_comme_cabinet(_uid uuid, _societe uuid) RETURNS boolean`. Vraie si les quatre conditions sont réunies :
    - pas de ligne `user_societes` pour ce couple ;
    - un lien en état `actif` ou `depart_demande` ;
    - un cabinet actif et un membre actif ;
    - le membre est responsable, ou il a une attribution sur ce dossier.
  - `cabinet_niveau(_uid uuid, _societe uuid, _module text) RETURNS int`. Vaut 0 si `agit_comme_cabinet` est faux. Sinon :
    - on prend le minimum de la mission du dossier et de celle de l'attribution (pour le responsable, la mission du dossier) ;
    - on plafonne à 2 pour un stagiaire ;
    - on plafonne à 1 si le lien est en `depart_demande`.
  - `est_personnel(_user_id, _societe_id)` est complétée par `OR public.agit_comme_cabinet(_user_id, _societe_id)`.

- [ ] **2.1 Écrire le test** `cabinet_droits.sql`, avec la matrice complète : 5 missions × 8 modules contre les valeurs du § 5, en dur dans le test. Puis ces cas, avec la valeur attendue de `cabinet_niveau` :
  - responsable, dossier `tenue_complete`, `compta` → 3 ;
  - collaborateur attribué en `lecture` sur un dossier `tenue_complete` → 1 ;
  - stagiaire attribué en `tenue_complete` → 2 ;
  - collaborateur non attribué → 0 ;
  - collaborateur d'un autre cabinet → 0 ;
  - lien `depart_demande` → 1 ; lien `termine` → 0 ; lien `invitation` → 0 ;
  - mission du dossier abaissée à `lecture` alors que l'attribution est `tenue_complete` → 1 (vigilance 2) ;
  - membre ou cabinet désactivé → 0 dans la même transaction, juste après l'`UPDATE` (vigilance 4) ;
  - même personne avec une ligne `user_societes` sur la société → `agit_comme_cabinet` faux (vigilance 1) ;
  - `est_personnel` vrai pour un collaborateur attribué, faux pour un collaborateur non attribué.
- [ ] **2.2 Lancer le test** → échec : fonction inexistante.
- [ ] **2.3 Écrire la migration.** Fonctions `STABLE`. L'accès au rôle de l'appelant se fait par des index sur `cabinet_membres(user_id)` et `cabinet_attributions(user_id)`.
- [ ] **2.4 L'utilisateur applique la migration ; relancer le test** → `OK cabinet_droits`.
- [ ] **2.5 Commit** `Espace cabinet : calcul des droits par dossier`.

### Tâche 3 : règles d'accès sur les tables métier — 2 j

**Fichiers :**
- Créer : `supabase/migrations/20261027122000_cabinet_regles_acces.sql`
- Créer : `supabase/tests/cabinet_regles_acces.sql`
- Créer : `supabase/tests/sans_cabinet.sql`

**Interfaces :**
- Consomme : `cabinet_niveau`, `agit_comme_cabinet`.
- Produit : `module_de_table(_table text) RETURNS text`, la correspondance du § 6.2 de la spec. Les tables `societes`, `societe_config`, `societe_identification` et `activites` relèvent de `parametres`. La table `exercices` relève de `compta`.
- Produit : trois règles sur chaque table de cette correspondance, avec `societe_id` comme colonne de société (`id` pour `societes`) :
  - une règle permissive `cabinet_lecture` FOR SELECT, `USING (cabinet_niveau(...) >= 1)` ;
  - une règle permissive `cabinet_ecriture` FOR INSERT, UPDATE et DELETE : niveau ≥ 2 en USING et en WITH CHECK ;
  - une règle **RESTRICTIVE** `cabinet_plafond` FOR ALL : `NOT agit_comme_cabinet(...)` OR un niveau suffisant pour l'opération. Pour SELECT, ≥ 1 ; pour les écritures, ≥ 2. Concrètement, deux règles restrictives, une SELECT et une pour les écritures.
- Produit : une règle **RESTRICTIVE** de refus total pour un membre de cabinet, sur les tables `services`, `service_membres`, `permission_overrides`, `user_activites`, `cross_service_grants`, `custom_services`, `custom_postes`, `user_custom_postes` et `portail_messages`. Elle s'écrit : `NOT EXISTS (membre actif d'un cabinet lié à cette société)`.

- [ ] **3.1 Écrire le test** `cabinet_regles_acces.sql`, en sessions simulées, sur 2 cabinets et 3 sociétés de test. Le collaborateur C1 est attribué en `compta_fiscalite` sur la société A ; le cabinet 2 suit la société C. Le test doit vérifier que C1 :
  - lit et insère une écriture de A, mais ne lit aucune ligne de B (non attribuée) ni de C (autre cabinet) ;
  - lit les employés de A, mais ne peut pas en insérer (paie en lecture pour cette mission) ;
  - voit son UPDATE de `societes` refusé (paramètres en lecture) ;
  - ne voit ses `INSERT` acceptés dans aucune des tables d'administration listées ;
  - perd toute écriture dès que A passe en `depart_demande`.

  Le test vérifie aussi que **les sociétés de A s'affichent dans `SELECT FROM societes` pour C1** : c'est ce que lit le sélecteur.
- [ ] **3.2 Écrire le test** `sans_cabinet.sql`, avec un administrateur et un membre comptable d'une société sans cabinet. Pour chaque table métier, il compare :
  - le nombre de lignes lues ;
  - le résultat d'un insert annulé ;

  avant et après la migration, en relançant le test sur la base sans puis avec la migration. Le test garde les résultats attendus en dur, relevés une première fois sur la base actuelle.
- [ ] **3.3 Lancer les deux tests** :
  - `cabinet_regles_acces` doit échouer (C1 ne lit rien) ;
  - `sans_cabinet` doit passer : c'est la référence.
- [ ] **3.4 Écrire la migration.** Générer les règles en boucle (`DO $$ … EXECUTE format(...)`) à partir de la liste des tables, pour n'en oublier aucune.
- [ ] **3.5 L'utilisateur applique la migration ; relancer les deux tests** → `OK` pour les deux.
- [ ] **3.6 Commit** `Espace cabinet : règles d'accès des tables métier`.

### Tâche 4 : validation à quatre yeux et audit signé — 0,5 j

**Fichiers :**
- Créer : `supabase/migrations/20261027123000_cabinet_validation_audit.sql`
- Créer : `supabase/tests/cabinet_validation_audit.sql`

**Interfaces :**
- Modifie `controle_quatre_yeux()`. Si `agit_comme_cabinet(uid, NEW.societe_id)` et `cabinet_niveau(uid, NEW.societe_id, module_de_table(TG_TABLE_NAME)) < 3`, le passage au statut validé est refusé avec `RAISE EXCEPTION 'CABINET_VALIDATION'`. La règle « pas sa propre saisie » ne change pas.
- Ajoute `audit_log.cabinet_id uuid`, que `audit_trigger_fn()` remplit quand l'auteur agit comme cabinet sur la société de la ligne.
- `messageErreur()` (`src/lib/ebene-utils.ts`) traduit `CABINET_VALIDATION` par : « Votre mission dans ce dossier ne permet pas de valider : un autre collaborateur ou le client doit le faire. »

- [ ] **4.1 Écrire le test SQL.** Il doit vérifier que :
  - un stagiaire ne peut pas valider une écriture ;
  - un collaborateur `tenue_complete` ne valide pas sa propre saisie, mais valide celle d'un autre ;
  - la ligne d'audit d'une écriture saisie par C1 porte le `cabinet_id` de C1 ;
  - une écriture saisie par l'administrateur de la société a un `cabinet_id` NULL.
- [ ] **4.2 Écrire le test unitaire** `src/lib/ebene-utils.test.ts` : `messageErreur(new Error("CABINET_VALIDATION"), "x")` renvoie le texte ci-dessus.
- [ ] **4.3 Lancer les tests** → échec.
- [ ] **4.4 Écrire la migration et la traduction ; l'utilisateur applique la migration ; relancer** → OK.
- [ ] **4.5 Commit** `Espace cabinet : validation et audit signés`.

### Tâche 5 : opérations sur les cabinets — 2 j

**Fichiers :**
- Créer : `supabase/migrations/20261027124000_cabinet_operations.sql`
- Créer : `supabase/tests/cabinet_operations.sql`
- Créer : `supabase/functions/cabinet-ops/index.ts`
- Créer : `src/lib/cabinetOps.ts`

**Interfaces :**
- Produit (SQL ; chaque fonction contrôle elle-même l'appelant ; une erreur métier lève `RAISE EXCEPTION 'CABINET_<CODE>: <texte>'`) :
  - `cabinet_creer(_nom text, _responsable uuid, _max_dossiers int DEFAULT 10) RETURNS uuid`, pour le super-admin en aal2 ;
  - `cabinet_definir_membre(_cabinet uuid, _user uuid, _role role_cabinet, _actif boolean) RETURNS void`, pour le responsable du cabinet ou le super-admin ; refusé s'il ne reste aucun responsable actif ;
  - `cabinet_creer_dossier(_cabinet uuid, _nom text) RETURNS uuid` (l'id de la société), pour le responsable. La fonction :
    - crée la société par le même chemin que `CreerSocieteModal` ;
    - crée le lien `actif`, avec l'origine `cabinet` et la mission `tenue_complete` ;
    - refuse au-delà de `max_dossiers` liens non terminés, avec `CABINET_LIMITE: Limite de {n} dossiers atteinte pour ce cabinet.` ;
  - `cabinet_rattacher(_cabinet uuid, _societe uuid, _mission mission_cabinet) RETURNS uuid`, pour le super-admin ;
  - `cabinet_attribuer(_dossier uuid, _user uuid, _mission mission_cabinet) RETURNS void` et `cabinet_retirer_attribution(_dossier uuid, _user uuid) RETURNS void`, pour le responsable ; l'attribution est refusée au-dessus de la mission du dossier ;
  - `cabinet_changer_mission(_dossier uuid, _mission mission_cabinet) RETURNS void`, pour un administrateur de la société cliente ou le super-admin. Tant qu'aucun administrateur client n'est rattaché, seul le super-admin peut l'appeler ;
  - `mes_dossiers_cabinet() RETURNS TABLE(societe_id uuid, societe_nom text, cabinet_nom text, mission mission_cabinet, etat etat_dossier_cabinet, mon_role role_cabinet)`.
- Produit (Edge `cabinet-ops`, POST) : les actions `ajouter_membre` (`email`, `nom`, `role`) et `inviter_admin_client` (`societe_id`, `email`, `nom`). La fonction crée le compte, ou retrouve un compte existant, envoie l'e-mail d'invitation par `send-transactional-email`, puis appelle la fonction SQL correspondante. Pour `inviter_admin_client`, elle donne le rôle `admin` et la ligne `user_societes`, par service_role. L'appelant doit être le responsable du cabinet lié à cette société.
- Produit (application) : dans `src/lib/cabinetOps.ts`, un enveloppement typé de chaque fonction SQL (appel `supabase.rpc`) et de la fonction Edge (`supabase.functions.invoke`). `messageErreur` affiche le texte qui suit `CABINET_<CODE>:`.

- [ ] **5.1 Écrire le test SQL.** Il doit vérifier que :
  - le cabinet est créé par le super-admin, et refusé à un non-super-admin ;
  - le responsable crée 10 dossiers, et le 11ᵉ est refusé avec `CABINET_LIMITE` (vigilance 5) ;
  - une attribution au-dessus de la mission est refusée ;
  - le dernier responsable ne peut pas être désactivé ;
  - un collaborateur ne peut ni créer de dossier ni attribuer ;
  - l'administrateur d'une autre société ne peut pas changer la mission ;
  - `mes_dossiers_cabinet()` ne rend que les dossiers attribués au collaborateur.
- [ ] **5.2 Lancer** → échec.
- [ ] **5.3 Écrire la migration, la fonction Edge (modèle : `admin-users/index.ts`, contrôle `niveauAuth`) et `cabinetOps.ts`.**
- [ ] **5.4 L'utilisateur applique la migration et déploie `cabinet-ops` ; relancer le test SQL** → OK. Essai manuel de `ajouter_membre` sur TEST avec une adresse fournie par l'utilisateur.
- [ ] **5.5 Commit** `Espace cabinet : opérations (création, membres, dossiers, attributions)`.

### Tâche 6 : droits dans l'application selon le dossier ouvert — 1 j

**Fichiers :**
- Créer : `src/lib/missionCabinet.ts`, `src/lib/missionCabinet.test.ts`
- Créer : `src/hooks/useDossiersCabinet.ts`
- Modifier : `src/hooks/useAuth.tsx`, l'endroit où `computePermissions` est appelé (vers la ligne 397)
- Régénérer : `src/integrations/supabase/types.ts` (outil de génération des types Supabase)

**Interfaces :**
- Produit : `permissionsMission(mission: MissionCabinet, role: RoleCabinet, etat: EtatDossierCabinet): PermissionMap`. Mêmes valeurs que `niveau_mission` (§ 5 de la spec) ; le stagiaire passe de `validate` à `write`, et `depart_demande` ramène tout à `read`. Les sous-modules héritent du niveau de leur module parent (`MODULE_CHILDREN`).
- Produit : `useDossiersCabinet(): { dossiers: DossierCabinet[]; isLoading: boolean }`, qui appelle `mes_dossiers_cabinet()` par TanStack Query (clé `["dossiers_cabinet", userId]`).
- Modifie `AuthProvider`. Il lit le `sid` de l'URL de la même façon que `useTenant` (`location.search`). Si ce `sid` figure dans `useDossiersCabinet()`, alors `perms = permissionsMission(...)` remplace `computePermissions(...)`, et `isAdmin` reste faux.

- [ ] **6.1 Écrire le test** `missionCabinet.test.ts`. Il doit vérifier :
  - la matrice complète des 5 missions, avec les valeurs du § 5 en dur ;
  - qu'un stagiaire en `tenue_complete` a `compta: "write"` ;
  - qu'un dossier `depart_demande` donne `factures: "read"` ;
  - qu'en `paie_social`, `bulletins` hérite de `grh: "validate"`.
- [ ] **6.2 Écrire le test** du changement de dossier (vigilance 3), dans `src/hooks/useAuth.test.tsx`. On rend `AuthProvider` avec un utilisateur qui suit deux dossiers, A en `tenue_complete` et B en `lecture` ; on navigue de `?sid=A` à `?sid=B`, et `can("compta","write")` doit passer de vrai à faux.
- [ ] **6.3 Lancer** → échec.
- [ ] **6.4 Implémenter ; lancer `npx vitest run` et `npx tsc --noEmit -p tsconfig.app.json`** → tout passe.
- [ ] **6.5 Commit** `Espace cabinet : droits de l'application selon le dossier ouvert`.

### Tâche 7 : sélecteur de société groupé — 0,5 j

**Fichiers :**
- Modifier : `src/components/SocieteSwitcher.tsx`
- Créer : `src/components/SocieteSwitcher.test.tsx`

**Interfaces :**
- Consomme : `useDossiersCabinet()`, `useTenant().societes`.
- Produit :
  - deux groupes, « Mes sociétés » et « Clients du cabinet ». Chaque dossier client porte un badge de mission (Tenue complète, Comptabilité et fiscalité, Paie et social, Déclarations, Lecture seule), et « Départ en cours » s'il y a lieu ;
  - un champ de recherche, au-delà de 8 sociétés au total ;
  - pour un utilisateur sans cabinet, un affichage inchangé.

- [ ] **7.1 Écrire le test.** Avec 2 sociétés directes et 3 dossiers, il vérifie les deux titres, l'ordre et le badge. Sans dossier, il vérifie qu'aucun titre de groupe n'apparaît.
- [ ] **7.2 Lancer** → échec. **7.3 Implémenter. 7.4 Relancer** → OK.
- [ ] **7.5 Commit** `Espace cabinet : sélecteur Mes sociétés / Clients du cabinet`.

### Tâche 8 : page « Mon cabinet » (responsable) — 1,5 j

**Fichiers :**
- Créer : `src/pages/Cabinet.tsx` et `src/components/cabinet/` (`EquipeCabinet.tsx`, `DossiersCabinet.tsx`, `AttributionsDossier.tsx`)
- Créer : `src/hooks/data/useCabinet.ts`
- Modifier : `src/App.tsx` (route protégée `/cabinet`) et `src/components/ebene/Header.tsx` (entrée de menu « Mon cabinet », visible des seuls membres de cabinet)

**Interfaces :**
- Consomme : `cabinetOps.ts`, `useDossiersCabinet()`.
- Produit :
  - `useCabinet(): { cabinet, membres, dossiers, attributions, isLoading }`, par lecture directe des tables (les règles de la tâche 1 filtrent) ;
  - la page :
    - **Équipe** : ajouter un membre par e-mail, changer son rôle, le désactiver ;
    - **Dossiers** : la liste avec la mission et l'état, le compteur « n / max », et le bouton « Nouveau dossier client » désactivé à la limite ;
    - **Attributions** : pour chaque dossier, les collaborateurs et leur mission, dont le choix est limité à la mission du dossier ;
    - **Inviter l'administrateur du client** : sur un dossier qui n'en a pas.
  - Le collaborateur et le stagiaire voient la page en lecture : leurs dossiers seulement, sans bouton de gestion.

- [ ] **8.1 Écrire le test** `src/pages/Cabinet.test.tsx`, avec les données simulées de `useCabinet`. Il vérifie que :
  - à 10 dossiers sur 10, le bouton « Nouveau dossier client » est désactivé et porte le texte d'aide « Limite de 10 dossiers atteinte » ;
  - un collaborateur ne voit ni l'onglet Équipe ni le bouton de création ;
  - la liste des missions d'attribution d'un dossier `compta_fiscalite` ne propose pas `tenue_complete`.
- [ ] **8.2 Lancer** → échec. **8.3 Implémenter. 8.4 Relancer, puis lancer `tsc`** → OK.
- [ ] **8.5 Vérifier dans l'application** (session de l'utilisateur, cabinet de test créé à la tâche 9) : création d'un dossier, attribution, puis vérification que le dossier apparaît dans le sélecteur du collaborateur.
- [ ] **8.6 Commit** `Espace cabinet : page Mon cabinet`.

### Tâche 9 : super-admin et bloc « Mon cabinet » chez le client — 1 j

**Fichiers :**
- Créer : `src/components/superadmin/CabinetsPanel.tsx`
- Modifier : `src/components/superadmin/SuperAdminPanel.tsx` (onglet « Cabinets »)
- Créer : `src/components/ebene/MonCabinetClient.tsx`
- Modifier : `src/pages/ParametresSociete.tsx` (bloc visible de l'administrateur client quand un lien existe)

**Interfaces :**
- Consomme : `cabinet_creer`, `cabinet_rattacher`, `cabinet_changer_mission` (`cabinetOps.ts`).
- Produit, côté super-admin :
  - la liste des cabinets (nom, responsable, dossiers n / max, actif) ;
  - la création d'un cabinet ;
  - le rattachement d'une société existante à un cabinet, avec une mission ;
  - le changement de mission ;
  - le signalement des doubles accès : un membre de cabinet qui a aussi une ligne `user_societes` sur un dossier de son cabinet.
- Produit, côté client : le cabinet, la mission (modifiable par l'administrateur client), la date de début du lien et la liste des collaborateurs qui ont accès. Le texte précise : « Les actions du cabinet sont signées dans le journal d'audit. »

- [ ] **9.1 Écrire le test** `MonCabinetClient.test.tsx`. Il vérifie que le choix d'une mission plus basse appelle `cabinet_changer_mission` avec la bonne valeur, et que le bloc n'apparaît pas pour une société sans cabinet.
- [ ] **9.2 Lancer** → échec. **9.3 Implémenter. 9.4 Relancer** → OK.
- [ ] **9.5 Vérifier dans l'application, sur TEST** : créer le « Cabinet Test » et son responsable (compte créé par l'utilisateur), rattacher la société TEST, puis baisser et remonter la mission depuis TEST.
- [ ] **9.6 Commit** `Espace cabinet : écrans super-admin et client`.

### Tâche 10 : audit lisible, retrait du comptable délégué — 0,5 j

**Fichiers :**
- Modifier : `src/pages/AuditLog.tsx` (colonne et filtre « Cabinet », libellé « Cabinet X — nom »)
- Supprimer : `src/components/ebene/GestionDelegations.tsx`, `src/hooks/useFiscalDelegations.ts` et leur usage dans `src/components/ebene/Fiscalite.tsx`
- Créer : `supabase/migrations/20261027125000_suppression_fiscal_delegations.sql` (`DROP TABLE public.fiscal_delegations`, vide en production le 27/10/2026 ; la migration vérifie qu'elle est vide avant)
- Modifier : `docs/recette/plan-recette.md` (module 10 : délégations remplacées par l'espace cabinet)

- [ ] **10.1 Écrire le test** `src/pages/AuditLog.test.tsx` : une ligne avec `cabinet_id` affiche « Cabinet Test — Collaborateur 1 », et le filtre « Cabinet » ne garde que ces lignes.
- [ ] **10.2 Lancer** → échec. **10.3 Implémenter et supprimer.** Puis `grep -rn "fiscal_delegations\|GestionDelegations" src` ne doit plus rien trouver, en dehors de `types.ts`, qui est régénéré.
- [ ] **10.4 Lancer `npx vitest run` et `tsc`** → tout passe.
- [ ] **10.5 Commit** `Espace cabinet : audit signé, retrait du comptable délégué`.

### Tâche 11 : recette sur TEST — 1 j

Avec des comptes créés par l'utilisateur : un responsable, deux collaborateurs (dont un stagiaire), et un administrateur client sur une deuxième société de test.

- [ ] **11.1** Relancer tous les tests SQL, `npx vitest run` et `tsc`.
- [ ] **11.2** Parcours dans l'application :
  - le collaborateur passe d'un dossier à l'autre ;
  - la saisie fonctionne dans sa mission, et les boutons interdits sont masqués ;
  - le stagiaire ne peut pas valider ;
  - le client baisse la mission, et l'effet est immédiat ;
  - l'audit est signé ;
  - le 11ᵉ dossier est refusé.
- [ ] **11.3** Une société sans cabinet (EBENE SERVICES - TEST, côté administrateur direct) : parcours rapide des 8 modules, sans aucune différence.
- [ ] **11.4** Noter les objets créés dans `docs/recette/journal-creations.md` et les anomalies dans `docs/recette/bugs.md`. Commit `Recette : espace cabinet, étape 1`.

---

## Chiffrage

| Tâche | Jours |
|---|---|
| 1. Schéma | 1 |
| 2. Calcul des droits | 1,5 |
| 3. Règles d'accès | 2 |
| 4. Validation et audit | 0,5 |
| 5. Opérations | 2 |
| 6. Droits dans l'application | 1 |
| 7. Sélecteur | 0,5 |
| 8. Page Mon cabinet | 1,5 |
| 9. Super-admin et client | 1 |
| 10. Audit, retrait des délégations | 0,5 |
| 11. Recette | 1 |
| **Total** | **12,5 jours** |

En pratique, comptez **3 à 4 semaines** : le calendrier dépend surtout de l'application des migrations par l'utilisateur, à chaque tâche de 1 à 5, et de la création des comptes de test pour la tâche 11.
