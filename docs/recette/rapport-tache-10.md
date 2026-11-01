# Tâche 10 — audit lisible et retrait du comptable délégué

Travail réalisé sur `main`, sans commit ni push, sans accès à la base, application de migration ou déploiement. Aucune dépendance ajoutée. Les fichiers non suivis `docs/recette/resume-reprise.md`, `marketing/` et `modeles-documents/` sont restés intacts.

## Audit signé

`AuditLog.tsx` lit le `cabinet_id` réellement enregistré dans `audit_log`. La fonction privée `private.cabinet_signature` renvoie cet UUID au moment de l’action ; elle ne stocke pas un libellé nominal. Le navigateur ne l’appelle pas et ne recalcule pas la signature à partir de l’équipe actuelle.

Une ligne signée affiche « Cabinet Test — Collaborateur 1 » dans la colonne utilisateur, ainsi que le nom dans une nouvelle colonne Cabinet. Un sélecteur Cabinet filtre les seules lignes portant cet identifiant ; le choix initial conserve toutes les actions, accès directs compris. La recherche textuelle porte aussi sur le libellé signé. Une action directe du même auteur, sans `cabinet_id`, conserve son affichage par adresse et ne devient jamais une action du cabinet.

Les noms proviennent de `public.audit_noms_cabinet(_societe uuid)`, dans la migration séparée `20261101131000_audit_noms_cabinet.sql`. `cabinet_collaborateurs_dossier` ne convient pas à cet historique : cette fonction ne renvoie que les membres actifs de cabinets actifs sur les dossiers actifs ou en départ. `cabinet_equipe` dépend aussi des droits et de l’équipe actuels, et n’est pas accessible à l’administrateur client. La lecture directe de `profiles` reste masquée par sa RLS.

La nouvelle fonction est `STABLE SECURITY DEFINER`, avec `search_path = public`. Les droits de PUBLIC et anon sont révoqués ; authenticated et service_role reçoivent EXECUTE. Un appel sans utilisateur ne renvoie aucune ligne. Son périmètre reprend les politiques SELECT actuelles de l’audit : super-admin autorisé par `is_admin_general`, ou administrateur ayant `has_societe_access` sur la société demandée. Un simple rattachement sans rôle administrateur ne donne pas accès aux noms. Une société NULL ou inaccessible renvoie un ensemble vide.

Le résultat contient seulement les couples distincts `cabinet_id`, `cabinet_nom`, `user_id`, `auteur_nom` présents dans des lignes signées de cet audit. Aucun cabinet sans audit, auteur d’action directe seule, autre membre, adresse ou donnée de connexion n’est exposé. Le nom d’auteur vide reste NULL, sans repli SQL sur son adresse. Aucun filtre sur l’activité actuelle du cabinet ou l’appartenance de l’auteur : l’historique reste consultable après départ, désactivation ou retrait.

Les noms sont les noms actuels des cabinets et des profils : aucun instantané nominal n’est stocké dans l’audit existant. Un renommage peut donc changer le libellé ; l’UUID signé demeure la référence historique. Si les noms ne sont pas disponibles, le navigateur conserve « Cabinet <UUID> — <adresse enregistrée, identifiant ou Auteur inconnu> » et signale l’erreur de lecture. Il ne lit pas d’adresse supplémentaire dans les profils.

Les réponses tardives de lectures précédentes sont ignorées, y compris lors d’un rafraîchissement concurrent ou du démontage. Un changement de société masque immédiatement les anciennes lignes et réinitialise le filtre Cabinet. La limite préexistante de 500 lignes est conservée ; recherche et filtre portent sur ces lignes chargées.

## Retrait des délégations et inventaire SQL

Les fichiers `GestionDelegations.tsx` et `useFiscalDelegations.ts` sont supprimés. Le bloc et l’import sont retirés de `Fiscalite.tsx`, ainsi que la propriété utilisateur devenue inutile. La table est également retirée des types Supabase, hors ligne. La recherche des trois anciens identifiants dans tout `src` ne trouve plus aucune occurrence, types compris.

La migration demandée est `20261101130000_suppression_fiscal_delegations.sql`. Un bloc DO unique prend un verrou `ACCESS EXCLUSIVE`, puis lève une exception si la table contient au moins une ligne, même inactive ou expirée. Toutes les suppressions appartiennent à ce même bloc : le verrou couvre la vérification et la suppression ; une erreur annule l’ensemble. Aucun `DROP ... CASCADE`.

Sources examinées :

- `supabase/migrations/20261027000000_baseline.sql` ;
- `supabase/migrations_archive/20260524000001_fiscal_regime.sql` ;
- `supabase/migrations_archive/20260524070732_f8f7b690-d5c4-412b-8c36-63aedfb49d6b.sql` ;
- `supabase/migrations_archive/20261006110000_audit_durcissement_securite_perf.sql` ;
- recherche des références dans toutes les migrations actives et archivées.

Objets explicitement supprimés par la migration :

| Nature | Objets dans `public` |
|---|---|
| Politiques sur `fiscal_delegations` | `fiscal_delegations_admin_manage`, `fiscal_delegations_admin_read`, `fiscal_delegations_delegue_read`, `fiscal_delegations_super_admin_all` |
| Index ordinaires | `fiscal_delegations_delegue_idx`, `fiscal_delegations_granted_by_idx`, `fiscal_delegations_societe_idx` |
| Clés étrangères de la table | `fiscal_delegations_delegue_user_id_fkey`, `fiscal_delegations_granted_by_fkey`, `fiscal_delegations_societe_id_fkey` |
| Contrainte unique et son index associé | `fiscal_delegations_societe_id_delegue_user_id_key` |
| Clé primaire et son index associé | `fiscal_delegations_pkey` |
| Table, ses colonnes, valeurs par défaut et privilèges associés | `fiscal_delegations` |

Aucune fonction ni aucun trigger dépendant de cette table n’a été trouvé dans ces sources : aucune suppression de fonction ou de trigger n’est inventée. `generate_set_impots`, `trg_recalc_set_impots` et le trigger `trg_societes_recalc_set_impots` concernent le régime fiscal de `societes`, restent utiles et sont conservés. Une dépendance inattendue en base ferait échouer le DROP en mode RESTRICT implicite, sans suppression aveugle. Aucune vérification de l’état réel de la base n’a été faite.

## Suppression d’une société

L’action `delete_societe` de `super-admin-ops` appelle désormais `supprimerSociete`, fonction locale testable sans environnement Deno. Avant toute écriture, elle cherche une ligne `cabinet_dossiers` pour la société, sans condition d’état. Invitation, actif, départ demandé et terminé entraînent tous une réponse HTTP 409 avec le texte exact :

> Cette société a été suivie par un cabinet : son historique empêche la suppression.

Une erreur de lecture renvoie HTTP 400 et interdit aussi toute suppression. Sans lien, les suppressions existantes sont conservées dans leur ordre ; chaque erreur interrompt désormais la suite. Les contrôles JWT, rôle super-admin et niveau d’authentification de l’Edge restent en amont et inchangés.

Cette opération conserve les appels successifs de l’action existante : elle ne constitue pas une transaction SQL globale. La clé étrangère RESTRICT reste la protection finale contre une création concurrente de lien ; une recette de concurrence reste utile, car la vérification préalable ne verrouille pas les créations ultérieures. Aucun changement de cette clé n’est livré ici.

## Tests et vérifications

Les tests Vitest ont été écrits avant les comportements correspondants :

- `src/pages/AuditLog.test.tsx` : libellé historique, colonne et filtre Cabinet, exclusion de l’action directe du même auteur, recherche par auteur, replis si la fonction échoue, absence d’appel nominal sans signature, réponse tardive d’une autre société. Le français est forcé par `beforeAll(() => i18n.changeLanguage("fr"))`.
- `src/lib/supprimerSociete.test.ts` : les quatre états de dossier, absence de filtre d’état, refus avant suppression, erreur de lecture et parcours sans cabinet. Ce fichier reste dans `src` pour être découvert par la configuration Vitest existante ; il importe la fonction locale de l’Edge.

`npx.cmd vitest run src/pages/AuditLog.test.tsx` a échoué avant toute exécution : `Cannot read directory "../..": Accès refusé`, puis impossibilité de charger `vitest.config.ts`. Aucun contournement tenté. Le cycle rouge/vert n’a pas pu être observé ; aucun test n’est annoncé passant. Les tests complémentaires et la suite complète restent à lancer par l’utilisateur.

`supabase/tests/audit_noms_cabinet.sql` utilise BEGIN/ROLLBACK, les marqueurs `-- debut test` et `-- fin test`, des UUID fixes `00000000-ca10-…`, des adresses `@exemple.invalid`, des sessions simulées, des ASSERT et le NOTICE final `OK audit_noms_cabinet`. Il vérifie les privilèges, la configuration de sécurité, la déduplication, l’historique d’un cabinet inactif sans appartenance actuelle, le nom d’auteur, l’absence de repli sur une adresse privée, l’isolation entre sociétés, le refus des comptes sans accès à l’audit, le super-admin aal2 et son refus aal1, les paramètres NULL et l’absence d’utilisateur. Il n’a pas été exécuté.

Résultats statiques :

- `npx.cmd tsc --noEmit -p tsconfig.app.json` : réussi, code 0. Ce projet vérifie le code applicatif et les tests sous `src`, ainsi que le module local importé ; il ne valide pas le point d’entrée Deno et son import distant.
- `npx.cmd eslint` sur les sept fichiers TypeScript touchés, tests compris : code 1, quatre erreurs `@typescript-eslint/no-explicit-any` préexistantes dans `supabase/functions/super-admin-ops/index.ts`, aux lignes 81, 110, 263 et 411. Ces quatre usages sont également présents dans HEAD ; aucun nouvel `any` ni désactivation de règle n’a été ajouté. Les six autres fichiers n’ont ni erreur ni avertissement.
- `git diff --check` : réussi ; seules informations Git de conversion future LF vers CRLF.
- Recherche récursive des anciens identifiants dans `src` : zéro occurrence.
- Fichiers créés ou modifiés écrits et contrôlés en UTF-8 sans BOM.

Le module 10 du plan de recette remplace les délégations par l’espace cabinet. Les parcours cabinet, audit signé, isolation des noms, refus de suppression et garde de migration sont ajoutés ; le portail employé reste à recetter séparément. Le module transversal des droits remplace aussi le rôle délégué par les membres du cabinet.

## Fichiers livrés

Modifiés :

- `src/pages/AuditLog.tsx` ;
- `src/components/ebene/Fiscalite.tsx` ;
- `src/integrations/supabase/types.ts` ;
- `supabase/functions/super-admin-ops/index.ts` ;
- `docs/recette/plan-recette.md`.

Créés :

- `src/pages/AuditLog.test.tsx` ;
- `src/lib/supprimerSociete.test.ts` ;
- `supabase/functions/super-admin-ops/supprimerSociete.ts` ;
- les deux migrations `20261101130000_suppression_fiscal_delegations.sql` et `20261101131000_audit_noms_cabinet.sql` ;
- `supabase/tests/audit_noms_cabinet.sql` ;
- le présent rapport.

Supprimés : `src/components/ebene/GestionDelegations.tsx` et `src/hooks/useFiscalDelegations.ts`.

## Points ouverts

L’utilisateur doit lancer `npx.cmd vitest run src/pages/AuditLog.test.tsx src/lib/supprimerSociete.test.ts`, puis la suite complète. Les quatre erreurs ESLint préexistantes de l’Edge restent à traiter séparément. Exécuter le test SQL nominal et les essais de garde de suppression en transaction annulée, vérifier le point d’entrée Edge avec l’outillage Deno habituel, puis appliquer les migrations et déployer l’Edge selon le processus habituel. Rien de cela n’a été effectué ici.

Effectuer la recette visuelle et connectée sur TEST, en particulier les noms après retrait ou désactivation, l’action directe du même auteur, les changements de société et les refus de suppression dans les quatre états. La disponibilité de la nouvelle fonction est nécessaire pour les libellés nominaux ; les UUID et les adresses déjà enregistrées permettent le repli avant son application.

Référence consultée : [documentation officielle Supabase sur les fonctions et leur sécurisation](https://supabase.com/docs/guides/database/functions). Le changelog Markdown demandé par la compétence Supabase n’a pas pu être récupéré par l’outil web (type de contenu non pris en charge). Les migrations du dépôt ont servi de référence pour les contrats et dépendances existants.
