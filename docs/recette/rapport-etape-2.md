# Recette : espace cabinet, étape 2 (tableau de bord)

Date : 2026-11-02. Base : production, société EBENE SERVICES - TEST suivie par « Cabinet Test ». Les appels sont faits dans des transactions annulées, en session simulée de chaque compte de recette : rien n'est resté en base.

## Déploiement

Le fichier `supabase/maintenance/deploiement-cabinet-etape-2.sql` a été lancé par le propriétaire. Le contrôle donne :
- trois versions inscrites : `20261102090000`, `20261102100000` et `20261102101000` ;
- la table `suivi_declarations` et ses 10 règles d'accès ;
- la fonction `tableau_cabinet`, qui n'est pas exécutable par `anon` ;
- le calcul du dû social qui repart des à-nouveaux.

## 4.1 Contrôles en base

| Contrôle | Résultat |
|---|---|
| Le responsable voit le dossier TEST et la charge de l'équipe (3 membres, 17 pièces chacun) | ✅ |
| OGA (collaborateur) voit TEST, mais pas la charge (`null`) | ✅ |
| FAB (stagiaire, attribution « tenue complète ») voit TEST, mais pas la charge | ✅ |
| Octobre 2026, consulté le 2 novembre : TVA, CNSS et IRPP « à faire », échéance au 15/11 ; patente « sans objet » | ✅ conforme aux écritures (pas de liquidation ni de règlement d'octobre) |
| Septembre 2026 : TVA, CNSS et IRPP « faites », reconnues dans les écritures ; patente « en retard » (échéance au 15/09, non marquée) | ✅ conforme à la règle |
| Pièces à traiter : 7 transactions et 2 factures à valider, 8 écritures en brouillon, 0 dépense sans justificatif | ✅ |
| Bulletins : 9 sur 9 en octobre, 6 sur 6 en septembre ; exercice 2025 clôturé | ✅ |
| « Dernier mois saisi » | ❌ décembre 2026 → anomalie 77, corrigée |
| OGA marque la TVA d'octobre « déposée », puis « payée » : une seule ligne, mise à jour ; TVA « faite », marquée « payée par OGA » | ✅ |
| Le champ « auteur » envoyé avec l'identifiant du responsable est remplacé par celui d'OGA | ✅ |
| Journal d'audit : création et modification inscrites au nom d'OGA, signées Cabinet Test (`cabinet_id`) | ✅ |

Le cas du stagiaire en mission « Lecture », sans aucun bouton, n'a pas pu être rejoué en base : son attribution est revenue en « tenue complète ». Il est couvert par les tests de l'interface :
- attribution « Lecture » sur un dossier en tenue complète ;
- mission « paie et social » ;
- dossier en départ demandé.

## Anomalie

- **77** : les dotations aux amortissements, passées d'avance au 31 décembre, faisaient afficher « décembre 2026 » comme dernier mois saisi. Seules les écritures datées au plus tard du jour comptent désormais.
  - Migration `20261102110000_tableau_cabinet_dernier_mois.sql`, avec son fichier de déploiement `supabase/maintenance/deploiement-tableau-dernier-mois.sql`.
  - Vérifiée sur TEST en transaction annulée : 2026-10 au 2 novembre, 2026-12 au 31 décembre.
  - Une assertion a été ajoutée à `supabase/tests/tableau_cabinet.sql`.

## Reste à faire

- Appliquer `deploiement-tableau-dernier-mois.sql`.
- Recette à l'écran, quand la nouvelle version de l'application sera en ligne :
  - onglet « Tableau de bord » ouvert par défaut ;
  - choix « Déposée » ou « Payée » ;
  - affichage sur téléphone ;
  - aucun bouton pour le stagiaire en « Lecture ».
