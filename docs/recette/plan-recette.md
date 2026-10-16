# Recette complète Ébène Suite (v2.5.9 →)

Lancée le 2026-10-16. Objectif : toucher chaque page, chaque fonction, chaque bouton, puis documenter et filmer la version corrigée.

## Décisions validées
- Livrables, dans l'ordre : recette → guide (PDF A4 + page web) → tutos (courts 1-3 min par fonction + longs par module) → film de présentation complet.
- Environnement : serveur local (vite, port 8080) sur la base Supabase réelle, société TEST uniquement (3458ac49-0fd5-4872-8162-f233ff20501e). EBENE SERVICES jamais touchée.
- Écritures : tout est permis sur TEST (créer, modifier, valider, convertir, supprimer, clôturer). Chaque objet créé est noté dans `journal-creations.md` pour nettoyage.
- Supports : web ordinateur, largeur téléphone (375 px), Electron (impression, PDF, mises à jour), Android (lecture du code propre à Android ; test sur appareil par l'utilisateur).
- Rôles : super-admin/propriétaire, comptable/gestionnaire délégué, employé (Mon portail), mode hors ligne. Les comptes de rôle sont créés et connectés par l'utilisateur.
- Profondeur : chaque bouton répond (console, réseau 403/500) ; calculs recalculés à la main (paie CNSS/IRPP/ancienneté, TVA, IS, amortissements, balance, bilan) ; écritures SYSCOHADA vérifiées ; droits et isolation RLS.
- Bugs : corrigés au fil de l'eau, un commit par groupe, l'utilisateur pousse.
- Guide et tutos : deux parties, « Démarrer » (dirigeants non comptables) et « Expert » (comptables). Français seulement ; anglais vérifié pour la casse d'affichage.
- Point d'étape à la fin de chaque module, sans attendre de réponse pour continuer.

## Modules (ordre de passage)
| # | Module | Fichiers principaux | Statut |
|---|--------|---------------------|--------|
| 1 | Connexion, compte, mot de passe, 2FA | pages/Auth, components/auth | fait (2FA lu dans le code, pas déclenché sur votre compte) |
| 2 | Tableau de bord, en-tête, sélecteurs société/activité, mois | Dashboard, Header, SocieteSwitcher, ActiviteSwitcher, MoisNav, TresorerieCard | fait |
| 3 | Commercial : devis, factures, lignes multi-activités, OCR, clients/fournisseurs | DevisSection, Factures, LignesVente, OCRFacture | fait (lignes d'articles du stock : module 4) |
| 4 | Stock : articles, catégories, mouvements | Stock | fait (entrée achetée, PMP, refus de sortie, suppression, constatation au bilan vérifiés) |
| 5 | Immobilisations et amortissements | Immobilisations | fait |
| 6 | Comptabilité : saisie guidée/expert, journal, grand livre, balance, bilan, résultat, exercices, emprunts, liasse | comptabilite/* | fait (clôture réelle non rejouée : 2026 doit rester ouvert ; liasse couverte par ses tests) |
| 7 | Fiscalité : TVA modèle OTR, IS, réintégrations/déductions, taux | Fiscalite, TauxImpots, TauxHistoriqueDialog | fait (taux légaux non revérifiés : paramétrables) |
| 8 | GRH : personnel, fiche, contrats, absences, heures sup, discipline, indemnités, simulateur, import Excel | GRH, grh/* | fait (barème licenciement à confirmer) |
| 9 | Paie : bulletins, validation, paiement, récap annuel | BulletinsPaie, BulletinEditDialog, RecapAnnuelModal, pages/Bulletins | fait |
| 10 | Mon portail (employé) et délégations | MonPortail, GestionDelegations | à faire |
| 11 | Paramètres société, identification, activités, apparence | ParametresSociete, IdentificationSociete, ActivitesManager | à faire |
| 12 | Administration : utilisateurs, journal d'audit, corbeille, archives, super-admin | AdminUsers, AuditLog, Corbeille, ArchivesModal, SuperAdmin | à faire |
| 13 | Impression et documents (modèle D) | components/impression | à faire |
| 14 | Hors ligne, mises à jour, Electron, Android | OfflineBanner, UpdateBanner, electron, AndroidUpdateChecker | à faire |
| 15 | Droits et isolation RLS (transversal) | supabase/migrations | à faire |

## Méthode par module
1. Lire le code du module : liste exhaustive des boutons et actions (`inventaire/<module>.md`).
2. Cliquer chaque élément dans le navigateur (ordinateur puis 375 px), relever console et réseau.
3. Recalculer les montants et contrôler les écritures en SQL (lecture seule sur TEST).
4. Corriger, vérifier, commit.
5. Mettre à jour `bugs.md` et le statut ci-dessus ; point d'étape.
