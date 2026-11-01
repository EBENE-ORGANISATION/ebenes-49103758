# Tâche 11 : recette de l'espace cabinet sur TEST (2026-11-01)

Comptes créés par l'utilisateur : un responsable, un collaborateur (OGA) et un stagiaire du « Cabinet Test », qui suit EBENE SERVICES - TEST.

## Résultats

| Contrôle | Résultat |
|---|---|
| Tests automatiques et `tsc` | 410 tests vitest passent (les 2 tests de la liasse dépassent le délai sous charge, ils passent lancés seuls) ; tsc OK. Tests SQL non relancés : base inchangée depuis leur passage au déploiement. |
| Création du cabinet, rattachement, invitation | OK après correction (anomalie 75). Invitation : voir anomalie 73. |
| Sélecteur et Mon cabinet (collaborateur) | Société dans « Clients du cabinet » ; Mon cabinet limité à l'onglet Dossiers. |
| Saisie dans la mission | OGA saisit AC-2026-0001 ; pas d'accès aux Paramètres société. |
| Baisse de mission par le client | Lecture : attribution ramenée à Lecture ; en base, 0 modification et 0 suppression possibles ; icônes masquées ; boutons de saisie masqués après l'anomalie 76. Remontée : l'attribution reste basse jusqu'à décision du responsable (voulu). |
| Stagiaire | Pas d'icône de validation ; validation simulée en base refusée (`CABINET_VALIDATION`). |
| Audit | Ligne signée « Cabinet Test — OGA », colonne et filtre Cabinet. |
| Limite de dossiers | Création par le responsable : 10ᵉ accepté, 11ᵉ refusé (`CABINET_LIMITE`). Le rattachement par le super-admin n'est pas limité (conforme à la spec). |
| Société sans cabinet | EBENE SERVICES en administrateur direct : 8 modules présents, aucune différence. |

## Anomalies (docs/recette/bugs.md)

- 73 : invitation, le premier clic ouvre l'application sans demander de mot de passe (à analyser).
- 74 : onglet ouvert pendant un déploiement, rechargement automatique (corrigé).
- 75 : mission et rôle choisis non envoyés (corrigé).
- 76 : actions interdites visibles en lecture seule (corrigé).
