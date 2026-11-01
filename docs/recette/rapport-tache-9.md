# Tâche 9 — super-admin et bloc client « Mon cabinet »

Travail réalisé sur `main`, sans commit ni push, sans accès à la base ni déploiement. Aucune dépendance ajoutée. Les fichiers non suivis `docs/recette/resume-reprise.md`, `marketing/` et `modeles-documents/` sont restés intacts.

## Écran super-admin

L’onglet « Cabinets » est intégré à `SuperAdminPanel`. Il affiche le nom de chaque cabinet, ses responsables actifs, son état et son nombre de dossiers non terminés sur sa limite. Les invitations et les départs demandés comptent dans ce nombre.

Le formulaire de création sélectionne un compte existant comme responsable, recueille le nom du cabinet et sa limite (10 par défaut), puis appelle `creerCabinet`. Les comptes super-admin sont exclus de ce choix ; les autres refus restent contrôlés par la fonction SQL.

Le rattachement sélectionne une société existante et une des cinq missions. Les sociétés déjà suivies et la société propre du cabinet sont exclues du choix ; le rattachement est désactivé pour un cabinet inactif. Le changement de mission utilise l’identifiant du lien, avec `changerMission`, et non l’identifiant de la société.

Chaque dossier non terminé sans administrateur client propose « Inviter l’administrateur du client ». Le formulaire recueille son nom et son adresse ; l’envoi passe exclusivement par le wrapper existant `inviterAdminClient`, action Edge `inviter_admin_client`. Une réponse `email_envoye: false` affiche l’avertissement existant. La fonction Edge demeure l’autorité pour refuser un compte ou un rattachement incompatible.

La liste des membres propose « Détacher un membre », y compris pour un compte déjà connecté. Un responsable actif n’a jamais ce bouton. La confirmation utilise le nom du membre ; l’opération appelle `detacherMembre`. Les protections de la fonction SQL demeurent applicables en cas de concurrence.

Les commandes sont désactivées pendant une mutation. Une erreur de lecture masque les données et les commandes précédentes. Les lectures sont séparées par utilisateur, relues au montage, au retour sur la fenêtre et toutes les 30 secondes. Les mutations invalident les lectures cabinet, client, sélecteur et sociétés.

## Détection des doubles accès et des administrateurs clients

Le navigateur ne lit pas directement `user_societes`. Le hook `useCabinetsAdmin` réutilise `callSuperAdmin("list_users")`, action existante de `super-admin-ops`. Cette action lit les profils, les rôles et les rattachements avec son client privilégié après vérification de l’appelant.

La lecture parcourt toutes les pages de 200 comptes jusqu’à une page plus courte. Elle ne réutilise pas la liste partielle déjà chargée dans le panneau historique. Pour chaque dossier non terminé, elle croise les membres de son cabinet avec les sociétés des comptes retournés. Tout membre ayant un rattachement direct reçoit un signalement nominatif, même s’il est actuellement inactif. L’accès direct conserve sa priorité ; aucun accès n’est modifié automatiquement.

La présence d’un administrateur client est calculée selon le modèle existant : rôle global `admin` et rattachement à cette société. Aucune nouvelle action Edge ni modification de la fonction Edge n’est nécessaire. Cette lecture dépend du contrat existant de `list_users` ; ses sous-requêtes de profils/rôles/rattachements ne remontent actuellement pas leurs erreurs individuellement. La recette devra notamment vérifier ces informations avec la fonction déployée.

## Bloc client

`MonCabinetClient` est monté dans les paramètres de la société ouverte, pour un administrateur ou un super-admin. Une société sans lien non terminé ne montre aucun bloc. Le composant est remonté lors d’un changement de société ; la clé de requête inclut aussi l’utilisateur et la société.

Le bloc affiche le cabinet, l’état du lien, sa date de début, la mission et les noms/rôles/missions des personnes ayant accès. La liste provient de `collaborateursDossier`, wrapper déjà présent de `cabinet_collaborateurs_dossier`, livrée en tâche 5. Aucune lecture de `profiles` n’est ajoutée pour ce bloc. La modification de mission passe par `changerMission` avec l’identifiant du lien. Le texte précise : « Les actions du cabinet sont signées dans le journal d’audit. »

Les cinq missions utilisent les traductions existantes du sélecteur. Les nouveaux textes disposent de traductions FR/EN dans les ressources TypeScript et JSON publiques. Les opérations d’invitation d’un cabinet et de départ restent hors de cette tâche, conformément à l’étape 1.

## Lecture sécurisée de l’équipe

La nouvelle migration `20261101120000_cabinet_equipe.sql` crée `public.cabinet_equipe(_cabinet uuid)` avec la signature demandée. Elle est `STABLE SECURITY DEFINER`, fixe `search_path = public`, révoque tous les droits de `PUBLIC` et `anon`, puis accorde l’exécution à `authenticated` et `service_role`.

Les contrôles reprennent les fonctions existantes : `is_admin_general` pour le super-admin en aal2 et `private.cabinet_responsable_actif` pour le responsable. Ceux-ci lisent toute l’équipe, y compris les membres inactifs, avec l’e-mail et l’indicateur de première connexion. Un collaborateur ou stagiaire actif d’un cabinet actif reçoit les noms et rôles avec les identifiants et états de la signature, mais `email` et `deja_connecte` valent toujours NULL. Tout autre appelant reçoit `CABINET_INTERDIT`, SQLSTATE 42501, code déjà employé par les opérations cabinet.

Le nom ne se replie jamais sur l’e-mail : un profil sans nom reçoit « Membre du cabinet ». Cela évite de divulguer une adresse dans le champ nominal aux lecteurs sans droit de gestion. `auth.users` n’est jamais exposée directement au navigateur. Le GRANT à `service_role` ne dispense pas de fournir un appelant autorisé.

`useCabinet` appelle le nouveau wrapper `equipe` et ne lit plus `profiles`. Le bouton responsable « Retirer le membre » n’apparaît que si `deja_connecte` est explicitement faux et si le membre n’est pas responsable actif. Une information absente ou masquée ne permet pas de déduire que le compte ne s’est jamais connecté.

## Fichiers

Créés :

- `src/components/superadmin/CabinetsPanel.tsx` et son test.
- `src/components/ebene/MonCabinetClient.tsx` et son test.
- `src/hooks/data/useCabinetsAdmin.ts` et son test.
- `src/hooks/data/useCabinet.test.tsx`.
- `supabase/migrations/20261101120000_cabinet_equipe.sql`.
- `supabase/tests/cabinet_equipe.sql`.
- Le présent rapport.

Modifiés : `SuperAdminPanel.tsx`, `ParametresSociete.tsx`, `EquipeCabinet.tsx`, `useCabinet.ts`, `cabinetOps.ts` et son test, les quatre ressources FR/EN et `src/integrations/supabase/types.ts`.

Les types ajoutent hors ligne la relation existante `cabinet_dossiers → cabinets`, nécessaire à la jointure du bloc client. Le wrapper de la nouvelle fonction emploie le client RPC typé localement de `cabinetOps`, comme les autres opérations. Il ne s’agit pas d’une régénération globale des types.

Dans `ParametresSociete`, le retour d’accès refusé est déplacé après les hooks : ESLint avait relevé deux appels conditionnels préexistants à `useApercuNumero`. Les mêmes messages et contrôles d’accès sont conservés.

## Tests et vérifications

Les tests client et du wrapper ont été écrits avant leur implémentation. Les tests complémentaires couvrent ensuite les appels de création/rattachement/changement de mission, l’invitation conditionnelle, le détachement après connexion et la protection du responsable actif, le signalement des doubles accès, le masquage après erreur, la pagination au-delà de 200 comptes et les noms issus de la fonction protégée. Les tests de composants forcent le français dans `beforeAll`.

Vitest échoue au démarrage avant toute exécution : `Cannot read directory "../..": Accès refusé`, puis impossibilité de charger `vitest.config.ts`. Aucun contournement tenté. Le cycle rouge/vert n’a donc pas pu être observé et aucun test n’est annoncé passant. Les tests complémentaires et la suite complète restent à exécuter par l’utilisateur.

Le test SQL utilise `BEGIN` / `ROLLBACK`, les marqueurs `-- debut test` / `-- fin test`, les UUID `00000000-cab9-…`, les adresses `@exemple.invalid` et des sessions simulées. Il vérifie les privilèges, le responsable, le super-admin aal2 et son refus aal1, les colonnes privées masquées pour collaborateur/stagiaire, la connexion déjà effectuée, les refus pour membre inactif, autre cabinet, compte extérieur, cabinet absent, session sans utilisateur et cabinet désactivé. Une assertion échouée interrompt le test. Il n’a pas été exécuté.

Résultats finaux :

- `npx.cmd tsc --noEmit -p tsconfig.app.json` : réussi, code 0.
- `npx.cmd eslint` sur tous les fichiers TypeScript créés ou modifiés, tests compris : réussi, code 0, sans avertissement.
- `git diff --check` : réussi ; seules informations Git de conversion future LF vers CRLF.
- Contrôle UTF-8 strict et absence de BOM sur les 20 fichiers de code, traduction et SQL touchés : réussi. Rapport également écrit en UTF-8 sans BOM.

## Points ouverts pour l’utilisateur

Exécuter les tests Vitest ciblés, puis la suite complète. Tester la migration dans la transaction SQL de recette, puis l’appliquer selon le processus habituel ; rien n’a été appliqué ici. Le nouvel écran d’équipe nécessite cette migration.

Effectuer la recette 9.5 sur TEST : création du cabinet avec un responsable existant, rattachement de TEST, baisse et remontée de mission depuis le client. Vérifier également les noms d’équipe avec les différentes sessions, l’invitation réelle de l’administrateur, le retour d’échec d’envoi, un double accès, le détachement d’un membre connecté et les refus serveur. La recette visuelle, les courriels réels, les changements concurrents et les règles SQL ne sont pas validés dans cette intervention.

Référence technique consultée pour la sécurisation des fonctions : [documentation officielle Supabase](https://supabase.com/docs/guides/database/functions). Le changelog Markdown demandé par la compétence Supabase n’a pas pu être récupéré par l’outil web (type de contenu non pris en charge) ; les contrats du dépôt ont servi de référence pour cette modification.
