# Espace cabinet, étape 3 (invitations, départs, récapitulatif) — plan de travail

> **Pour l'exécution :** tâches confiées à Codex (`codex exec`), relues et testées par Claude, une tâche à la fois. Les étapes sont des cases à cocher (`- [ ]`).

**Objectif :**
- le client invite lui-même un cabinet, que le responsable accepte ou refuse ;
- le client ou le cabinet demande un départ, que le super-admin valide ou annule ;
- chaque événement prévient les personnes concernées par e-mail ;
- chaque lundi, l'administrateur du client reçoit le récapitulatif de ce que le cabinet a fait dans son dossier ;
- les alertes quotidiennes, aujourd'hui en panne, repartent.

**Architecture :**
- **Changements d'état d'un lien** : des fonctions `SECURITY DEFINER` (`cabinet_*`), sur le modèle de l'étape 1.
- **E-mails d'événement** : un trigger sur `cabinet_dossiers` appelle une fonction Edge par `pg_net`, avec le secret interne du coffre, comme `notify_validation_change`.
- **Tâches programmées** : `pg_cron` appelle les fonctions Edge à travers une fonction unique, `private.appeler_fonction_interne`, qui ne contient ni adresse d'un autre projet ni clé.
- **Récapitulatif** : calculé en SQL, envoyé par une fonction Edge.

**Technique :** Supabase (Postgres, RLS, pg_cron, pg_net, Vault), fonctions Edge Deno, Resend via `send-transactional-email`, React, TanStack Query, Vitest.

**Spécification :** `docs/superpowers/specs/2026-10-27-espace-cabinet-design.md` (§ 2, § 7, § 8.3 à 8.5, étape 3 du § 9, § 11).

## Contraintes générales

- **Migrations** : `supabase/migrations/202611021200xx_*.sql`. **L'utilisateur les applique** à l'aide d'un fichier `supabase/maintenance/deploiement-cabinet-etape-3.sql`. Ce fichier a une garde sur `20261102110000`, inscrit chaque version dans `schema_migrations` et tient en une seule transaction.
- **Fonctions** :
  - `SECURITY DEFINER`, `SET search_path = public` ;
  - `REVOKE … FROM public, anon` ;
  - `GRANT EXECUTE … TO authenticated`, sauf les fonctions `private.*`, réservées au propriétaire et à `service_role`.
- **Erreurs** : texte `CABINET_<CODE>: message en français`. Un refus d'appelant porte `ERRCODE = '42501'`. `messageErreur` les affiche déjà.
- **Contrôles** : le contrôle de l'appelant se fait avant tout verrou, puis le lien est relu `FOR UPDATE` (modèle : `cabinet_attribuer`). Le super-admin n'agit qu'en session `aal2` : `is_admin_general` le vérifie déjà.
- **Tests SQL** : au format de `supabase/tests/cabinet_operations.sql` (`BEGIN` … `ROLLBACK`, fixtures `00000000-ca3N-…`, adresses `@exemple.invalid`). Claude les exécute sur la production en transaction annulée. `sans_cabinet.sql`, `cabinet_operations.sql` et `cabinet_regles_acces.sql` restent verts.
- **Fonctions Edge** :
  - appelées par la base, avec `verify_jwt = false` dans `supabase/config.toml` ;
  - en-tête `X-Internal-Secret` comparé à `get_internal_webhook_secret()` en temps constant, comme `egaliteConstante` de `send-transactional-email` ; sinon 403 ;
  - e-mails envoyés **uniquement** par `send-transactional-email`, qui gère la liste d'exclusion et les liens autorisés, avec un modèle enregistré dans `_shared/transactional-email-templates/registry.ts` ;
  - **l'utilisateur les déploie**.
- **Écrans** : textes en français, traduits en anglais dans `src/i18n/locales/en.ts` ; tests de composants en français forcé.
- **Commits** : Codex ne commite pas. Claude commite avec `Co-Authored-By: Codex <noreply@openai.com>` et `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push sans accord.
- **Données réelles** : aucun envoi réel aux clients pendant les tests. Le récapitulatif et les alertes ne se testent qu'en base, et sur la société TEST.

## Règles métier retenues

- **Annuaire des cabinets** :
  - un administrateur client voit les **cabinets actifs**, nom seulement ;
  - il ne voit ni les membres, ni les dossiers, ni la formule.
- **Invitation** (`origine = 'client'`, `etat = 'invitation'`) :
  - **qui** : seulement l'administrateur de la société (`cabinet_admin_client`) ; la mission est choisie par lui ;
  - **refusée si** :
    - la société est déjà liée à un cabinet, lien non terminé (`CABINET_DEJA_LIE`) ;
    - la société est la propre société du cabinet (`CABINET_SOCIETE_PROPRE`) ;
    - le cabinet est inactif (`CABINET_INACTIF`) ;
  - pendant une invitation, le cabinet n'a **aucun accès**, ce qui est déjà la règle de l'étape 1 ;
  - le client peut retirer son invitation tant qu'elle n'a pas reçu de réponse : le lien passe à `termine`.
- **Réponse du cabinet** : un responsable actif d'un cabinet actif.
  - **Accepter** fait passer le lien à `actif`. C'est refusé (`CABINET_ACCES_DIRECT`) si un membre actif du cabinet a un accès direct à la société, même contrôle que `cabinet_rattacher`.
  - **Refuser** fait passer le lien à `termine`.
  - **Aucune limite de dossiers à l'acceptation** : au-delà de 10, il y aura un supplément, sans blocage (décision du 2026-11-02, facturée à l'étape 4).
- **Départ** :
  - **qui le demande** : l'administrateur du client ou un responsable du cabinet, sur un lien `actif` ;
  - **effet** : le lien passe à `depart_demande`, avec `depart_demande_par = auth.uid()`, `depart_demande_le = now()` et `depart_motif` (motif facultatif, 500 caractères au plus) ;
  - **pendant l'attente** : le cabinet est en lecture seule, export compris, comme le font déjà les règles de l'étape 1 ;
  - **ensuite** : le super-admin valide (`termine`, `valide_par`, `termine_le = now()`) ou annule (retour à `actif`, les trois champs `depart_*` remis à nul) ;
  - un lien dans un autre état : `CABINET_ETAT` (« Ce dossier n'est pas dans l'état attendu. »).
- **Événements prévenus par e-mail** : modèle `cabinet-evenement`, envoyé par la fonction Edge `notification-cabinet`.

  | Changement de `etat` | Événement | Destinataires |
  |---|---|---|
  | insertion `invitation` | `invitation_recue` | responsables actifs du cabinet |
  | `invitation` → `actif` | `invitation_acceptee` | administrateurs du client |
  | `invitation` → `termine` | `invitation_close` | responsables et administrateurs du client |
  | `actif` → `depart_demande` | `depart_demande` | super-admins, responsables et administrateurs du client |
  | `depart_demande` → `termine` | `depart_valide` | responsables et administrateurs du client |
  | `depart_demande` → `actif` | `depart_annule` | responsables et administrateurs du client |

  Tout autre changement ne prévient personne, y compris une insertion directement `actif` (rattachement, dossier créé par le cabinet). Chaque destinataire voit le nom du cabinet, le nom de la société et l'événement, ainsi qu'un lien vers `/cabinet` pour un membre du cabinet, `/parametres-societe` pour un administrateur du client, ou l'onglet super-admin.
- **Administrateurs du client** : comptes avec le rôle `admin` dans `user_roles` et un accès à la société dans `user_societes`, hors membres de cabinet.
- **Récapitulatif hebdomadaire** :
  - **quand** : le lundi à 07:00 UTC (heure de Lomé), pour chaque lien `actif` ou `depart_demande` ;
  - **période** : les 7 jours qui précèdent l'envoi, de `_fin - 7 jours` à `_fin`, où `_fin` est l'heure de l'envoi ;
  - **contenu**, calculé par `private.recap_cabinet(_dossier, _fin)` sur les lignes d'`audit_log` de la société signées du cabinet (`cabinet_id`) dans la période :
    - nombre d'actions par table, pour `transactions`, `factures`, `ecritures`, `bulletins` et `suivi_declarations` ; les autres tables sont regroupées sous `autres` ;
    - nombre de validations : `action LIKE 'VALIDER\_%'`, ou `UPDATE` dont le statut (`statut_validation`, sinon `statut`) passe de `en_validation` à `valide` ;
    - déclarations marquées : type, période, statut ;
    - actions par personne : nom (`profiles.nom`, sinon l'e-mail) et nombre ;
    - pièces qui attendent la validation du client : transactions et factures `en_validation`, à la date de l'envoi ;
  - **envoi** : seulement s'il y a au moins une action ou une pièce en attente, sinon rien ;
  - **destinataires** : administrateurs du client.
- **Alertes quotidiennes** : la tâche `notification-alertes-daily` (08:00 UTC) appelle désormais la fonction de **ce** projet, avec le secret interne du coffre. L'ancienne commande, qui contenait l'adresse et la clé publique de l'ancien projet, disparaît.

## Points de vigilance (tests ajoutés aux tâches indiquées)

1. Un responsable d'un autre cabinet, un collaborateur, un stagiaire ou un employé simple du client ne peut ni inviter, ni répondre, ni demander un départ → tests en tâches 2 et 3.
2. Deux invitations envoyées en même temps à deux cabinets : une seule réussit, grâce à l'index unique sur les liens non terminés, et la seconde reçoit `CABINET_DEJA_LIE`, pas une erreur brute → test en tâche 2.
3. Après `valider_depart`, le cabinet ne lit plus rien du dossier ; après `annuler_depart`, il écrit de nouveau → test en tâche 3.
4. Un appel sans le bon secret à `notification-cabinet` ou à `recap-cabinet-hebdo` reçoit 403 et n'envoie rien ; une société sans administrateur client n'envoie rien, sans erreur → tests en tâches 5 et 6.
5. Une semaine sans activité n'envoie pas d'e-mail vide ; une action d'un autre cabinet ou un accès direct n'entre pas dans le récapitulatif → test en tâche 6.

---

### Tâche 1 : réparer la tâche programmée des alertes

**Fichiers :**
- Créer : `supabase/migrations/20261102120000_taches_programmees.sql`
- Créer : `supabase/tests/taches_programmees.sql`
- Modifier : `docs/supabase-baseline.md` (section « Sur une base neuve »)

**Interfaces :**
- Produit : `private.appeler_fonction_interne(_fonction text, _corps jsonb DEFAULT '{}') RETURNS bigint`.
  - Elle rend l'identifiant de la requête `net.http_post`.
  - Adresse : `'https://yblucgmxofyelziwlvxu.supabase.co/functions/v1/' || _fonction`.
  - En-têtes : `Content-Type: application/json` et `X-Internal-Secret`, lu dans `vault.decrypted_secrets` (nom `internal_webhook_secret`).
  - `_fonction` doit respecter `^[a-z0-9-]+$`, sinon exception.
  - Sans secret dans le coffre : exception `SECRET_ABSENT`.
  - Exécutable seulement par le propriétaire et `service_role`.

- [x] **Étape 1 : écrire le test SQL.** Il vérifie :
  - la fonction existe et n'est exécutable ni par `anon` ni par `authenticated` ;
  - `_fonction = 'x/../y'` est refusé ;
  - une seule tâche `notification-alertes-daily` existe, avec `schedule = '0 8 * * *'` ;
  - sa commande contient `private.appeler_fonction_interne('notification-alertes'` ;
  - sa commande ne contient ni `nmeyylvltlvvcvbhvxpz` ni `eyJ`.
- [x] **Étape 2 :** Claude lance le test. Attendu : échec, la fonction est absente et l'ancienne commande est en place.
- [x] **Étape 3 : écrire la migration.**
  - `CREATE SCHEMA IF NOT EXISTS private` ;
  - la fonction ;
  - `cron.unschedule('notification-alertes-daily')` s'il existe, puis `cron.schedule('notification-alertes-daily', '0 8 * * *', $$SELECT private.appeler_fonction_interne('notification-alertes')$$)`.
- [x] **Étape 4 :** Claude relance le test avec la migration, en transaction annulée. Attendu : `OK taches_programmees`.
- [x] **Étape 5 :** documentation : dans `docs/supabase-baseline.md`, remplacer le paragraphe sur la tâche cron. Elle est désormais créée par la migration ; il faut seulement le secret du coffre.
- [x] **Étape 6 :** commit « Tâches programmées : alertes quotidiennes vers ce projet ».

### Tâche 2 : invitations

**Fichiers :**
- Créer : `supabase/migrations/20261102121000_cabinet_invitations.sql`
- Créer : `supabase/tests/cabinet_invitations.sql`
- Modifier : `src/integrations/supabase/types.ts` (ajout des fonctions, à la main)

**Interfaces :**
- Consomme : `cabinet_admin_client`, `private.cabinet_responsable_actif` et `is_admin_general` (étape 1).
- Produit :
  - `public.cabinets_annuaire() RETURNS TABLE (id uuid, nom text)` : cabinets actifs, triés par nom. Réservée à un appelant `is_admin` ou `is_admin_general`, sinon `CABINET_INTERDIT`.
  - `public.cabinet_inviter(_societe uuid, _cabinet uuid, _mission public.mission_cabinet) RETURNS uuid` : rend l'id du lien.
  - `public.cabinet_repondre_invitation(_dossier uuid, _accepter boolean) RETURNS void`.
  - `public.cabinet_annuler_invitation(_dossier uuid) RETURNS void` : réservée à l'administrateur du client ; le lien passe à `termine`, avec `termine_le = now()`.
  - `public.cabinet_invitations_recues() RETURNS TABLE (dossier_id uuid, societe_id uuid, societe_nom text, mission public.mission_cabinet, created_at timestamptz)` : liens `invitation` du cabinet dont l'appelant est responsable actif, triés par date. Elle existe parce que le responsable ne lit pas `societes` tant que l'invitation n'est pas acceptée. Pour tout autre appelant : aucune ligne.

- [x] **Étape 1 : écrire le test SQL.** Fixtures : deux cabinets (A actif, B inactif), un responsable et un collaborateur de A, le responsable d'un autre cabinet C, une société cliente avec son administrateur et un employé simple. Il vérifie :
  - **Annuaire** :
    - il liste A et C, mais pas B ;
    - il est refusé à l'employé simple.
  - **Invitation par l'administrateur** :
    - elle crée un lien `invitation`, d'origine `client`, avec la mission choisie ;
    - une seconde invitation, vers C, donne `CABINET_DEJA_LIE` ;
    - inviter B donne `CABINET_INACTIF`.
  - **Pendant l'invitation** : le responsable de A ne lit aucune donnée de la société (`SELECT` sur `transactions` vide).
  - **Appelants refusés**, avec `CABINET_INTERDIT` :
    - le collaborateur de A et le responsable de C ne peuvent pas répondre ;
    - l'employé simple ne peut pas inviter.
  - **Acceptation par le responsable de A** :
    - le lien passe à `actif`, et le responsable lit les transactions ;
    - une seconde réponse donne `CABINET_ETAT`.
  - **Refus** : avec une nouvelle invitation, sur une seconde société, le lien passe à `termine`.
  - **Retrait par le client** : le lien passe à `termine`, puis une nouvelle invitation est possible.
  - **Accès direct** : si un membre actif de A a un accès direct à la société, accepter donne `CABINET_ACCES_DIRECT`.
  - **Limite de dossiers** : avec `max_dossiers = 0`, accepter réussit quand même.
  - **Invitations reçues** : le responsable de A voit le lien en attente, avec le nom de la société ; le collaborateur de A et le responsable de C ne voient rien ; un lien accepté ou refusé n'y figure plus.
  - **Propriétés** des cinq fonctions : `SECURITY DEFINER`, `search_path` fixé, aucune exécution pour `anon`.
- [x] **Étape 2 :** Claude lance le test sans la migration. Attendu : échec, les fonctions sont absentes.
- [x] **Étape 3 : écrire la migration**, selon les règles métier. L'insertion qui heurte `cabinet_dossiers_societe_en_cours_uniq` est rattrapée (`unique_violation`) et rendue en `CABINET_DEJA_LIE`.
- [x] **Étape 4 :** Claude relance ce test, `cabinet_operations.sql`, `cabinet_regles_acces.sql` et `sans_cabinet.sql`. Attendu : tous verts.
- [x] **Étape 5 :** `npx.cmd tsc --noEmit -p tsconfig.app.json` vert ; commit « Espace cabinet : invitation par le client ».

### Tâche 3 : départs

**Fichiers :**
- Créer : `supabase/migrations/20261102122000_cabinet_departs.sql`
- Créer : `supabase/tests/cabinet_departs.sql`
- Modifier : `src/integrations/supabase/types.ts`

**Interfaces :**
- Produit :
  - `public.cabinet_demander_depart(_dossier uuid, _motif text DEFAULT NULL) RETURNS void` ;
  - `public.cabinet_valider_depart(_dossier uuid) RETURNS void` ;
  - `public.cabinet_annuler_depart(_dossier uuid) RETURNS void`.

- [x] **Étape 1 : écrire le test SQL.** Fixtures : un dossier `actif` avec un responsable, un collaborateur attribué en `tenue_complete`, l'administrateur du client et un super-admin en session `aal2`. Il vérifie :
  - **Appelants refusés** pour la demande, avec `CABINET_INTERDIT` : le collaborateur et l'employé simple ;
  - **Demande par l'administrateur du client**, avec un motif :
    - le lien passe à `depart_demande`, avec les trois champs `depart_*` renseignés ;
    - le collaborateur lit toujours les transactions, mais un `INSERT` dans `transactions` est refusé ;
  - **Motif trop long** : un motif de 501 caractères donne `CABINET_PARAMETRE` ;
  - **Seconde demande** : `CABINET_ETAT` ;
  - **Validation et annulation réservées au super-admin** : l'administrateur et le responsable reçoivent `CABINET_INTERDIT`, tout comme le super-admin en session `aal1` ;
  - **Annulation par le super-admin** : retour à `actif`, champs `depart_*` nuls, et l'`INSERT` du collaborateur réussit de nouveau ;
  - **Demande par le responsable, puis validation par le super-admin** :
    - le lien passe à `termine`, avec `valide_par` et `termine_le` renseignés ;
    - le collaborateur et le responsable ne lisent plus aucune transaction ;
    - l'administrateur du client lit toujours tout ;
  - **Lien `termine`** : une demande donne `CABINET_ETAT` ;
  - **Propriétés** des fonctions, comme en tâche 2.
- [x] **Étape 2 :** Claude lance le test sans la migration. Attendu : échec.
- [x] **Étape 3 : écrire la migration.**
- [x] **Étape 4 :** Claude relance les tests des tâches 2 et 3, puis `cabinet_regles_acces.sql` et `sans_cabinet.sql`. Attendu : tous verts.
- [x] **Étape 5 :** `tsc` vert ; commit « Espace cabinet : demandes de départ ». Claude écrit le fichier de déploiement des tâches 1 à 3, et l'utilisateur le lance.

### Tâche 4 : écrans

**Fichiers :**
- Modifier :
  - `src/lib/cabinetOps.ts` : enveloppes `annuaire()`, `inviter(societeId, cabinetId, mission)`, `repondreInvitation(dossierId, accepter)`, `annulerInvitation(dossierId)`, `demanderDepart(dossierId, motif?)`, `validerDepart(dossierId)`, `annulerDepart(dossierId)`, sur `appeler` ;
  - `src/components/ebene/MonCabinetClient.tsx` ;
  - `src/components/cabinet/DossiersCabinet.tsx` ;
  - `src/components/superadmin/CabinetsPanel.tsx` ;
  - `src/i18n/locales/fr.ts` et `en.ts` (clés `cabinet10.*`).
- Tests :
  - `src/components/ebene/MonCabinetClient.test.tsx` ;
  - `src/components/cabinet/DossiersCabinet.test.tsx` ;
  - `src/components/superadmin/CabinetsPanel.test.tsx` (à créer s'ils n'existent pas) ;
  - `src/lib/cabinetOps.test.ts`.

**Interfaces :**
- Consomme : les fonctions SQL des tâches 2 et 3. Chaque mutation invalide les clés `cabinet_client`, `cabinet`, `cabinets_admin` et `dossiers_cabinet`.

- [x] **Étape 1 : écrire les tests.**
  - **`cabinetOps`** : chaque enveloppe appelle la bonne fonction avec les bons noms de paramètres (`_dossier`, `_accepter`, `_motif`…) ; une erreur `CABINET_ETAT` remonte avec son texte.
  - **`MonCabinetClient`** (bloc « Mon cabinet » de l'administrateur client) :
    - sans lien : un formulaire « Inviter un cabinet », avec la liste de l'annuaire et la mission ; l'envoi appelle `inviter` ;
    - lien `invitation` : le texte « Invitation envoyée à {cabinet}, en attente de réponse » et le bouton « Retirer l'invitation », qui demande une confirmation ;
    - lien `actif` : le bouton « Demander la fin de la mission », avec un motif facultatif et une confirmation ;
    - lien `depart_demande` : le texte « Fin de mission demandée le {date} : le cabinet ne peut plus que consulter le dossier, en attendant la validation », sans bouton.
  - **`DossiersCabinet`** :
    - responsable : une section « Invitations reçues », listant les liens `invitation` avec « Accepter » et « Refuser » (confirmation pour refuser), et sur chaque dossier `actif` le bouton « Demander la fin de la mission » ;
    - collaborateur : aucun de ces boutons.
  - **`CabinetsPanel`** (super-admin) : une section « Fins de mission à valider » liste les liens `depart_demande`, avec le cabinet, la société, la personne qui a fait la demande, la date et le motif, ainsi que les boutons « Valider » et « Annuler la demande ».
- [x] **Étape 2 :** `npx.cmd vitest run` sur ces fichiers. Attendu : les nouveaux tests échouent.
- [x] **Étape 3 : implémenter.**
  - La requête de `MonCabinetClient` lit déjà le lien non terminé : elle doit aussi rendre `null` quand il n'y a pas de lien, pour afficher le formulaire d'invitation au lieu de rien.
  - Le responsable doit voir les liens `invitation` de son cabinet dans `useCabinet`. Si la règle de lecture de `cabinet_dossiers` ne les lui donne pas, l'ajouter dans la migration de la tâche 2, sans donner accès aux données de la société, et ajouter son test SQL.
- [x] **Étape 4 :** suite vitest complète et `tsc` verts.
- [x] **Étape 5 :** commit « Espace cabinet : écrans des invitations et des départs ».

### Tâche 5 : e-mails des événements

**Fichiers :**
- Créer :
  - `supabase/migrations/20261102123000_notifications_cabinet.sql` ;
  - `supabase/functions/notification-cabinet/index.ts` ;
  - `supabase/functions/notification-cabinet/evenements.ts` (logique pure, testable) ;
  - `supabase/functions/notification-cabinet/evenements.test.ts` (Vitest, sans Deno) ;
  - `supabase/functions/_shared/transactional-email-templates/cabinet-evenement.tsx`.
- Modifier :
  - `supabase/functions/_shared/transactional-email-templates/registry.ts` ;
  - `supabase/config.toml` (`[functions.notification-cabinet] verify_jwt = false`) ;
  - `supabase/tests/cabinet_invitations.sql` (trigger).

**Interfaces :**
- Consomme : `private.appeler_fonction_interne` (tâche 1).
- Produit :
  - trigger `trg_notifier_cabinet` AFTER INSERT OR UPDATE OF etat ON `cabinet_dossiers`, qui exécute `private.notifier_cabinet()`. Il appelle `private.appeler_fonction_interne('notification-cabinet', jsonb_build_object('dossier_id', NEW.id, 'ancien', OLD.etat, 'nouveau', NEW.etat))` seulement pour les six changements du tableau des règles ; une insertion porte `ancien` nul ;
  - `evenement(ancien: EtatDossierCabinet | null, nouveau: EtatDossierCabinet): Evenement | null`, où `Evenement` vaut `"invitation_recue" | "invitation_acceptee" | "invitation_close" | "depart_demande" | "depart_valide" | "depart_annule"` ;
  - `destinataires(e: Evenement): Array<"responsables" | "admins_client" | "super_admins">` ;
  - modèle `cabinet-evenement`, avec `templateData = { evenement, cabinet, societe, lien, motif? }`. L'objet et le texte en français sont fixés par `evenement`.

- [x] **Étape 1 : écrire les tests.**
  - Vitest, pour les six changements du tableau : le bon événement et les bons destinataires. `actif` → `actif`, insertion `actif` et `termine` → `actif` donnent `null`.
  - SQL : en remplaçant `private.appeler_fonction_interne` dans la transaction par une version qui écrit dans une table temporaire, une invitation, une acceptation et un rattachement donnent respectivement 1, 1 et 0 appel, avec les bons `ancien` et `nouveau`.
- [x] **Étape 2 :** lancer les tests. Attendu : échec.
- [x] **Étape 3 : implémenter.**
  - La fonction Edge vérifie le secret, puis lit le lien, le cabinet et la société avec la clé `service_role`. Elle résout les adresses (règle « administrateurs du client » ; super-admins = `user_roles.role = 'admin_general'`) et appelle `send-transactional-email` une fois par destinataire, avec `idempotencyKey = cabinet-${dossier_id}-${evenement}-${minute}`.
  - Une adresse manquante est sautée sans erreur.
  - Un échec d'envoi est journalisé, mais la réponse reste 200 pour ne pas relancer le trigger.
  - Le trigger ne bloque jamais la transaction : toute exception de l'appel est rattrapée et journalisée par `RAISE WARNING`.
- [x] **Étape 4 :** tests verts, puis `deno check supabase/functions/notification-cabinet/index.ts` si Deno est installé.
- [x] **Étape 5 :** commit « Espace cabinet : e-mails des invitations et des départs ».

### Tâche 6 : récapitulatif hebdomadaire

**Fichiers :**
- Créer :
  - `supabase/migrations/20261102124000_recap_cabinet.sql` ;
  - `supabase/tests/recap_cabinet.sql` ;
  - `supabase/functions/recap-cabinet-hebdo/index.ts` ;
  - `supabase/functions/_shared/transactional-email-templates/cabinet-recap.tsx`.
- Modifier :
  - `registry.ts` ;
  - `supabase/config.toml` (`[functions.recap-cabinet-hebdo] verify_jwt = false`) ;
  - `supabase/maintenance/deploiement-cabinet-etape-3.sql` (tâches 5 et 6 ajoutées).

**Interfaces :**
- Produit : `private.recap_cabinet(_dossier uuid, _fin timestamptz) RETURNS jsonb`, exécutable par `service_role` seulement. Forme du résultat :
  ```json
  {
    "cabinet": "text", "societe": "text", "debut": "timestamptz", "fin": "timestamptz",
    "actions": {"transactions": 0, "factures": 0, "ecritures": 0, "bulletins": 0, "suivi_declarations": 0, "autres": 0},
    "total": 0, "validations": 0,
    "declarations": [{"type": "TVA", "annee": 2026, "mois": 10, "statut": "deposee"}],
    "personnes": [{"nom": "text", "actions": 0}],
    "en_attente_client": {"transactions": 0, "factures": 0}
  }
  ```
  - Tâche cron `recap-cabinet-hebdo`, `'0 7 * * 1'`, qui exécute `SELECT private.appeler_fonction_interne('recap-cabinet-hebdo')`.

- [x] **Étape 1 : écrire le test SQL.** Fixtures : un dossier `actif` du cabinet A, avec des lignes d'`audit_log` de la société :
  - 3 `INSERT transactions` signés A dans la semaine ;
  - 1 `VALIDER_FACTURE` signé A dans la semaine ;
  - 1 `UPDATE transactions` signé A, dont le statut passe de `en_validation` à `valide` ;
  - 1 `INSERT suivi_declarations` (TVA 2026-10, `deposee`) signé A ;
  - 2 actions signées A il y a 8 jours ;
  - 2 actions sans `cabinet_id` (accès direct) ;
  - 1 action signée par un autre cabinet B ;
  - 2 transactions `en_validation`.

  Assertions :
  - `actions.transactions = 4` et `total = 6` ;
  - `validations = 2` ;
  - une déclaration TVA `deposee` ;
  - `personnes` porte les noms ;
  - `en_attente_client.transactions = 2` ;
  - la fonction n'est exécutable ni par `anon` ni par `authenticated` ;
  - la tâche cron existe avec ce planning, sans `eyJ` ni l'adresse de l'ancien projet ;
  - un dossier sans activité donne `total = 0`.
- [x] **Étape 2 :** Claude lance le test. Attendu : échec.
- [x] **Étape 3 : implémenter.**
  - La migration contient la fonction et la tâche cron.
  - La fonction Edge :
    - vérifie le secret ;
    - pour chaque lien `actif` ou `depart_demande` d'un cabinet actif, appelle `recap_cabinet(id, now())` ;
    - saute le lien si `total = 0` et qu'aucune pièce n'attend le client ;
    - envoie le modèle `cabinet-recap` à chaque administrateur du client, avec `idempotencyKey = recap-${dossier_id}-${date ISO de fin}` ;
    - répond `{ ok, envoyes, sautes }`.
  - Le modèle affiche la période, le tableau des actions en libellés français (« Opérations », « Factures », « Écritures », « Bulletins », « Déclarations »), les validations, les déclarations, les personnes et les pièces en attente, avec un lien vers le site.
- [x] **Étape 4 :** tests SQL des tâches 1 à 6 et suite vitest verts.
- [x] **Étape 5 :** commit « Espace cabinet : récapitulatif hebdomadaire au client ». L'utilisateur lance le fichier de déploiement complété, puis déploie `notification-cabinet`, `recap-cabinet-hebdo`, `send-transactional-email` (nouveaux modèles) et `notification-alertes`, pour être sûr que la version en ligne est celle du dépôt.

### Tâche 7 : recette sur TEST

- [ ] **Contrôles en base**, avec les comptes de recette, en transaction annulée : les scénarios des tâches 2 et 3 sur TEST et Cabinet Test, et le contenu de `recap_cabinet` pour le dossier TEST.
- [ ] **Alertes** : le lendemain du déploiement, après 08:00 UTC, `net._http_response` montre un statut 200 pour `notification-alertes`, et les journaux de la fonction montrent l'envoi.
- [ ] **À l'écran, avec l'utilisateur**, sur une seconde société de test sans cabinet :
  - invitation par son administrateur, puis réponse du responsable ;
  - demande de fin de mission, puis validation par le super-admin ;
  - réception des e-mails.
- [ ] **Récapitulatif** : un premier lundi est vérifié dans les journaux (`envoyes`, `sautes`).
- [ ] **Rapport** `docs/recette/rapport-etape-3.md`, anomalies dans `docs/recette/bugs.md`, plan coché. Commit « Recette : espace cabinet, étape 3 ».
