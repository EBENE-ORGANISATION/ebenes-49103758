# Recette — espace cabinet, étape 3

Plan : `docs/superpowers/plans/2026-11-02-espace-cabinet-etape-3.md`. Société TEST, « Cabinet Test ».

## Déploiement (2026-11-02)

- Migrations 20261102120000 à 20261102124000 inscrites (`deploiement-cabinet-etape-3.sql`, puis `deploiement-cabinet-etape-3-suite.sql`).
- Tâches programmées : `notification-alertes-daily` à `0 8 * * *`, `recap-cabinet-hebdo` à `0 7 * * 1`, toutes deux par `private.appeler_fonction_interne`.
- Trigger `trg_notifier_cabinet` présent sur `cabinet_dossiers`.
- Fonctions Edge `notification-cabinet` (v1) et `recap-cabinet-hebdo` (v1) actives, `send-transactional-email` en v7. Les deux nouvelles répondent 403 sans secret valide.

## Contrôles en base (2026-11-02, transaction annulée, e-mails neutralisés)

Avec les comptes de recette (administrateur client ebnservicess@, responsable `+cabinet-resp`, super-admin) sur le lien TEST / Cabinet Test :

| Étape | Résultat |
|---|---|
| Annuaire vu par le client | Cabinet Test présent |
| Le client demande la fin de mission | `depart_demande` |
| Le responsable redemande | refus `CABINET_ETAT` |
| Le super-admin annule sans double authentification | refus `CABINET_INTERDIT` |
| Le super-admin annule en aal2 | retour à `actif` |
| Le responsable demande, le super-admin valide | `termine` |
| Le client réinvite le cabinet | invitation créée, visible du responsable |
| Le responsable accepte | `actif` |

Après annulation, le lien TEST est inchangé (`actif`).

Récapitulatif calculé pour TEST (semaine close le 02/11 11:00 UTC) : 2 actions (une déclaration TVA 10/2026 déposée, une autre action), 2 personnes, 7 opérations et 2 factures en attente du client. Destinataires du premier envoi : les deux adresses administrateur de TEST (adresses de l'éditeur, aucun client réel).

Tests automatisés : tests SQL des tâches 1 à 6 verts en transaction annulée ; Vitest 478 tests verts.

## À l'écran (2026-11-02, société « EBENE SERVICES - TEST 2 »)

- Invitation de Cabinet Test par ebnservicess@ : faite à l'écran ; e-mail au responsable envoyé.
- Acceptation par le responsable : faite à l'écran (onglet Dossiers) ; e-mails aux deux administrateurs envoyés.
- Demande de fin de mission par le client : le bouton restait sans effet (voir anomalie A). Demande faite en base au nom du client ; 3 e-mails envoyés (super-admin, responsable, administrateur).
- Validation par le super-admin (aal2), onglet Cabinets, après correction A : faite à l'écran le 02/11 à 12:10 UTC ; lien `termine`, `valide_par` = super-admin ; 3 e-mails « Fin de mission validée » envoyés (responsable, super-admin, administrateur).

Anomalies :

| # | Constat | Suite |
|---|---|---|
| A | Les boutons à confirmation de l'espace cabinet utilisaient `window.confirm`, bloqué sans message dans certains environnements : clic sans effet. | Corrigé (f5de3c0) : fenêtre de confirmation dans la page. |
| B | Les invitations reçues ne sont visibles que dans l'onglet Dossiers de `/cabinet`, et les fins de mission à valider que dans l'onglet Cabinets du super-admin ; chaque page s'ouvre sur un autre onglet. | Mineur, à améliorer (compteur ou encart). |
| C | `pg_net` attend 5 s par défaut ; trois e-mails d'affilée dépassent ce délai : réponse notée en erreur alors que l'envoi aboutit. | Corrigé par la migration 20261102125000 (60 s), à déployer. |

## Reste à vérifier

- Alertes quotidiennes : après le 03/11 08:00 UTC, statut 200 dans `net._http_response`.
- Écrans, avec l'utilisateur, après publication : invitation depuis une seconde société de test sans cabinet, réponse du responsable, fin de mission et sa validation, réception des e-mails.
- Premier récapitulatif : lundi 09/11 07:00 UTC, `envoyes` / `sautes` dans les journaux de la fonction.
