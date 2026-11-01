# Tâche 6 — droits selon le dossier ouvert

Les droits du dossier ouvert remplacent les rôles globaux, délégations et dérogations lorsqu’un utilisateur agit comme cabinet. Le changement de `sid` recalcule les droits sans reconnexion. Un accès direct confirmé garde la priorité ; le super-administrateur garde son fonctionnement habituel. Les routes d’administration et les menus suivent les droits effectifs.

| Mission | Modules au niveau validation | Autres droits |
|---|---|---|
| Tenue complète | Compta, fiscalité, GRH, factures, stock, immobilisations | Paramètres société et tableau de bord en lecture |
| Comptabilité et fiscalité | Compta, fiscalité, immobilisations | Autres modules en lecture |
| Paie et social | GRH et paramètres sociaux | Compta, fiscalité, paramètres société et tableau de bord en lecture ; factures, stock et immobilisations sans accès |
| Déclarations | Fiscalité | Autres modules en lecture |
| Lecture | Aucun | Tous les modules en lecture |

Le responsable reçoit la mission du dossier ; le collaborateur reçoit la mission renvoyée par la base pour son attribution. Le stagiaire est plafonné à l’écriture. Un départ demandé plafonne les niveaux à la lecture sans ouvrir les modules interdits. Invitation et lien terminé ne donnent aucun droit. Les sous-modules héritent de leur parent ; les paramètres sociaux suivent la GRH.

La validation vérifie le module demandé et interdit la propre saisie du membre de cabinet, même s’il est administrateur ailleurs. Une erreur ou un retrait du dossier ne réactive pas ses rôles globaux. Les requêtes sont séparées par utilisateur et relues au retour sur la fenêtre, au montage et toutes les 30 secondes ; la base reste l’autorité entre ces lectures. Le message des exercices distingue l’accès cabinet de l’accès direct.

## Fichiers

- `src/lib/missionCabinet.ts` et `missionCabinet.test.ts` : matrice, plafonds et héritage.
- `src/hooks/useDossiersCabinet.ts` et `useDossiersCabinet.test.tsx` : lecture et cache par utilisateur.
- `src/hooks/useAuth.tsx` et `useAuth.test.tsx` : droits selon le dossier, priorité de l’accès direct, routes et indicateurs de service.
- `src/hooks/usePeutValider.ts` et `usePeutValider.test.ts` : validation par module et quatre yeux.
- `src/components/ebene/Factures.tsx`, `GRH.tsx`, `grh/AbsencesPanel.tsx`, `grh/DisciplinePanel.tsx` : module explicite de validation.
- `src/components/ebene/comptabilite/ExercicesComptables.tsx` et `InformationsFiscalesExercice.tsx` : actions et messages selon les droits.
- `src/pages/Corbeille.tsx` et `Corbeille.test.tsx` : filtre des actions selon le module de chaque table.
- `src/hooks/useEbeneStoreRemote.ts`, `src/lib/ebene-utils.ts` et `ebene-utils.test.ts` : message d’erreur contextualisé.
- `src/i18n/locales/fr.ts`, `en.ts`, `public/locales/fr/translation.json`, `public/locales/en/translation.json` : clé du message cabinet, en français.
- `src/integrations/supabase/types.ts` et `src/lib/cabinetOps.ts` : signatures et types cabinet synchronisés hors ligne.
- Le présent rapport.

## Vérifications

- TDD : échecs observés sur la matrice absente, les droits par dossier et les messages d’exercice, puis passage au vert.
- Vitest : 42 fichiers, 357 tests réussis, dont les tests de navigation, de retrait, d’erreur de relecture, des rôles et de la corbeille.
- `npx.cmd tsc --noEmit -p tsconfig.app.json` : réussi.
- `npx.cmd eslint` sur tous les fichiers TypeScript modifiés ou créés : réussi, sans avertissement.
- `git diff --check` : réussi.

Le lancement Vitest standard échoue avant les tests : esbuild ne peut pas lire un répertoire parent dans cet environnement restreint. Vérification effectuée avec `npx.cmd vitest run --config vitest.cabinet.local.ts --configLoader runner`, sur une copie temporaire de la configuration où le chemin `src` est résolu depuis le répertoire courant. Cette copie a été retirée avant la tentative de commit.

## Points ouverts

- Aucune migration nécessaire ni écrite. Aucun accès à la production, déploiement ou push.
- Les enums et les signatures SQL utiles à la tâche sont synchronisés depuis les migrations du dépôt. La régénération complète des types Supabase reste à faire sur une base locale exploitable ; elle n’a pas été tentée contre la production.
- Pas de recette connectée dans cette intervention ; les échanges Supabase sont simulés dans les tests.

## Commit bloqué par les permissions de la session

La branche est `main`. La tentative `git add` échoue avant toute indexation : `Unable to create .git/index.lock: Permission denied`. Le profil de la session autorise uniquement la lecture de `.git`. Aucun commit n’a donc été créé et aucun hash ne peut être fourni. Les trois ensembles non suivis exclus par la demande sont intacts.

Message prévu pour le commit unique :

```
Espace cabinet : droits de l’application selon le dossier ouvert

Co-Authored-By: Codex <noreply@openai.com>
```
