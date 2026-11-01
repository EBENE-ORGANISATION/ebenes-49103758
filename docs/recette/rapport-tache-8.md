# Tâche 8 — Page Mon cabinet

## Périmètre livré

La route `/cabinet` est protégée par l’authentification. La page contrôle ensuite l’appartenance active à un cabinet actif, sans s’appuyer sur les rôles globaux ni sur la société actuellement ouverte. Une entrée « Mon cabinet » est ajoutée au menu commun du Header, sur ordinateur et téléphone, pour les membres actifs seulement. Le retour à l’accueil conserve le contexte `sid`.

Le responsable dispose des onglets Dossiers et Équipe. Le collaborateur et le stagiaire disposent uniquement des dossiers attribués, en lecture, sans compteur global, équipe, création ni modification des attributions. Un administrateur client ou un super-admin sans appartenance active ne reçoit pas cet écran de gestion ; leurs opérations spécifiques restent en tâche 9.

## Dossiers et attributions

- Le compteur prend tous les liens non terminés, invitations et départs compris. La création est désactivée lorsque ce compteur atteint ou dépasse `max_dossiers` ; le texte d’aide annonce la limite configurée. Le refus concurrent éventuel de la base reste affiché.
- Le formulaire de création recueille le nom, le NIF, le RCCM, la forme juridique et la date de début d’exercice. Il utilise exclusivement `cabinetOps.creerDossier`.
- Chaque dossier affiche sa mission et son état. Les dossiers terminés restent consultables par le responsable, sans attribution modifiable.
- Le responsable attribue un dossier à un collaborateur ou stagiaire actif, change sa mission d’attribution et retire son attribution. La création et la modification utilisent le même wrapper `attribuer`, conformément à son fonctionnement SQL de remplacement. `retirerAttribution` sert au retrait.
- Le plafond du dossier n’est jamais modifiable ici : `changerMission` est réservé à l’administrateur client et au super-admin. Aucun appel manuel aux RPC n’est ajouté.
- `missionCouvre` reproduit côté client la comparaison des huit niveaux de `mission_couvre`, à partir de la matrice existante de `missionCabinet.ts`. C’est un ordre partiel : paie/social n’est notamment pas couvert par lecture, ni l’inverse. Le test dédié énumère les 25 comparaisons.

Aucun bouton d’invitation d’administrateur client n’est présent. Les règles de lecture disponibles ne permettent pas au responsable d’établir de façon fiable la présence d’un administrateur client ; l’écran affiche donc une consigne conditionnelle sur chaque dossier : si l’administrateur manque, sa création relève du support Ébène (super-admin). Aucune recherche supplémentaire dans les comptes ou les rôles du client n’est effectuée.

## Équipe et sécurité

L’ajout passe par `ajouterMembre`, sans identifiant de cabinet transmis par l’écran responsable. L’échec générique de l’Edge est conservé comme texte de repli de `messageErreur`, sans explication sur l’existence d’un compte. Une réussite avec `email_envoye: false` annonce que le membre est créé mais que le courriel n’est pas parti.

Le rôle et l’état actif passent par `definirMembre`. Le retrait confirmé passe par `detacherMembre` : aucune déduction locale de la première connexion. Le bouton est affiché aussi pour soi-même et les responsables ; la base décide et ses refus sont traduits. Le renvoi passe par `renvoyerInvitation` ; un statut HTTP 429 produit « Patientez 10 minutes avant un nouveau renvoi », même sans corps JSON lisible. Les quatre codes seuls `CABINET_DEJA_CONNECTE`, `CABINET_SOI_MEME`, `CABINET_RESPONSABLE` et `CABINET_QUOTA_JOUR` sont traduits par `messageErreur`.

Les mutations désactivent les commandes pendant leur exécution et invalident les lectures cabinet et les dossiers utilisés par `useDossiersCabinet` et le sélecteur. La page relit les données au montage, au retour sur la fenêtre et toutes les 30 secondes. Une erreur de rafraîchissement masque les données précédentes et les commandes.

`useCabinet` lit d’abord la propre appartenance active, puis borne toutes les lectures à son cabinet. Les dossiers d’un collaborateur sont filtrés par ses attributions en complément de la RLS. Les noms des membres utilisent les profils visibles, avec repli sur l’identifiant si le profil n’est pas lisible. Les sociétés non lisibles ont le même repli. Les types de lecture des quatre tables ont été ajoutés hors ligne depuis les migrations ; leurs écritures directes sont interdites au niveau TypeScript (`Insert` et `Update` à `never`). Cela ne remplace pas une régénération complète des types Supabase.

## Fichiers

Créés :

- `src/pages/Cabinet.tsx`, `src/pages/Cabinet.test.tsx`.
- `src/hooks/data/useCabinet.ts`.
- `src/components/cabinet/EquipeCabinet.tsx`.
- `src/components/cabinet/DossiersCabinet.tsx`.
- `src/components/cabinet/AttributionsDossier.tsx`.
- `src/lib/missionCouvre.test.ts`.
- Le présent rapport.

Modifiés :

- `src/App.tsx`, `src/components/ebene/Header.tsx`.
- `src/lib/cabinetOps.ts`, `src/lib/cabinetOps.test.ts`.
- `src/lib/missionCabinet.ts`, `src/lib/ebene-utils.ts`.
- `src/integrations/supabase/types.ts`.
- `src/i18n/locales/fr.ts`, `src/i18n/locales/en.ts`.
- `public/locales/fr/translation.json`, `public/locales/en/translation.json`.

Les nouveaux fichiers sont en UTF-8 sans BOM. Les textes de l’interface disposent des traductions FR/EN ; le code, les commentaires et ce rapport sont en français.

## Vérifications et limites

Les tests de page ont été écrits avant l’implémentation : limite dix sur dix et aide associée, absence de gestion pour collaborateur/stagiaire, choix des missions sous le plafond comptabilité/fiscalité. Des tests complémentaires vérifient le wrapper d’attribution avec l’identifiant du lien, l’absence d’invitation d’administrateur client, la comparaison des missions et les erreurs de renvoi/retrait/quota.

`npx.cmd vitest run src/pages/Cabinet.test.tsx` échoue au démarrage, avant toute exécution : esbuild indique `Cannot read directory "../..": Accès refusé` et ne charge pas `vitest.config.ts`. Aucun contournement n’a été tenté. Le cycle rouge/vert n’a donc pas pu être observé ; aucun test n’est annoncé passant. Les tests complémentaires doivent également être exécutés par l’utilisateur.

Vérifications statiques finales : `npx.cmd tsc --noEmit -p tsconfig.app.json` réussi ; ESLint sur tous les fichiers TypeScript créés ou modifiés réussi, sans avertissement. `git diff --check` réussi, avec les seules informations de conversion future LF vers CRLF de Git.

Points ouverts : lancer les tests ciblés puis la suite complète ; effectuer la recette 8.5 ultérieurement, notamment création, attribution et apparition dans le sélecteur du collaborateur, ainsi que les refus serveur sur retrait, quota et renvoi. La recette visuelle, l’envoi réel de courriels et les règles RLS ne sont pas vérifiés ici.

Aucune dépendance ajoutée, aucune migration, aucun accès à la base, aucun déploiement, aucun commit et aucun push. Les fichiers non suivis exclus par la demande sont restés intacts.
