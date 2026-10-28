# Espace cabinet — spécification

Date : 2026-10-27. Statut : à relire par l'utilisateur.

## 1. Objectif

Permettre à un cabinet comptable de travailler dans les dossiers de ses clients depuis un seul compte par collaborateur, sans mélanger les données :

- un collaborateur du cabinet se connecte une fois et passe d'un dossier client à l'autre ;
- chaque client reste une société Ébène à part entière, avec ses propres utilisateurs, ses rôles, son contrôle à quatre yeux et son verrou de clôture ;
- le cabinet dispose d'un tableau de bord de tout son portefeuille.

L'espace cabinet **remplace** le « comptable délégué » et les délégations fiscales (module 10 de la recette). Le portail employé du module 10 n'est pas concerné.

Critère de réussite : un client qui n'a pas de cabinet ne voit aucune différence, et aucun collaborateur ne peut lire ou modifier une donnée hors de ce que le client lui a ouvert, même en appelant directement l'API.

## 2. Décisions validées (2026-10-27)

| Sujet | Décision |
|---|---|
| Périmètre d'un collaborateur | Seulement les dossiers que le responsable du cabinet lui attribue ; le responsable voit tous les dossiers du cabinet. |
| Droits dans un dossier | Choisis client par client. Le client fixe un **plafond** ; le responsable du cabinet répartit les droits entre ses collaborateurs sans dépasser ce plafond. |
| Création d'un dossier client | Trois voies possibles : le cabinet crée le dossier (dans la limite de sa formule), le client invite le cabinet, ou le super-admin rattache. |
| Départ d'un client | Demandé par le client ou par le cabinet, **validé par le super-admin**. Pendant l'attente, le cabinet passe en **lecture seule** (consultation et export). Le client garde toujours sa société et ses données. |
| Traçabilité et contrôle | Chaque action du cabinet est signée « Cabinet X — collaborateur » dans l'audit du client. Les quatre yeux s'appliquent : un collaborateur ne valide pas sa propre saisie ; un autre collaborateur ou le client peut la valider. |
| Comptabilité du cabinet | Au choix du cabinet : il peut tenir sa propre société dans Ébène. |
| Rôles internes | Responsable, collaborateur, stagiaire (le stagiaire saisit mais ne valide jamais). |
| Appartenance | Une personne appartient à un seul cabinet. Elle peut garder par ailleurs des accès directs à d'autres sociétés. |
| Tableau de bord | Échéances fiscales et sociales, pièces à traiter, avancement des dossiers, charge par collaborateur. |
| Facturation | Pas encore décidée : la conception doit supporter « le cabinet paie » comme « chacun paie ». |
| Délégations fiscales | Remplacées par l'espace cabinet (0 délégation en production au 27/10/2026, aucune reprise de données). |

## 3. Existant sur lequel on s'appuie

- `user_societes` relie un utilisateur à ses sociétés ; `has_societe_access(uid, societe)` et `est_personnel(uid, societe)` protègent toutes les tables métier.
- Les rôles (`user_roles`) sont **globaux** : un utilisateur a les mêmes rôles dans toutes ses sociétés. Les droits par module (`AppModule`, `src/lib/permissions.ts`) se calculent dans l'application à partir de ces rôles et de `permission_overrides`.
- Depuis le 24/10/2026, `user_roles` et `user_societes` ne s'écrivent que par les fonctions Edge (`admin-users`, `super-admin-ops`).
- Les droits par activité utilisent déjà des règles **RESTRICTIVES** ajoutées aux règles existantes (`20261009050000_droits_par_activite.sql`) : même schéma à réutiliser.
- `controle_quatre_yeux()` refuse qu'un utilisateur valide sa propre saisie.
- `audit_trigger_fn()` enregistre l'utilisateur et la société de chaque modification.
- `fiscal_delegations` et `GestionDelegations.tsx` : un simple registre, qui n'ouvre aucun accès aux données.

Conséquence : les collaborateurs d'un cabinet **n'ont pas** de lignes dans `user_societes` ni de rôles globaux pour les dossiers clients. Ils y accèdent par un chemin séparé, décrit ci-dessous, qui porte des droits propres à chaque dossier.

## 4. Modèle de données

Toutes les nouvelles tables : RLS activée, `GRANT` explicite à `authenticated` (sinon 403), écriture côté client limitée à ce que les règles permettent ; les opérations sensibles passent par une fonction Edge `cabinet-ops` (service_role).

### 4.1 `cabinets`
| Colonne | Type | Rôle |
|---|---|---|
| id | uuid | |
| nom | text | |
| formule | text | `cabinet` par défaut (lien futur avec la facturation) |
| max_dossiers | int | limite de création par le cabinet (10 par défaut) |
| societe_propre_id | uuid null → societes | sa propre comptabilité, si le cabinet le souhaite |
| actif | bool | un cabinet désactivé perd tout accès aux dossiers |
| created_at, created_by | | |

### 4.2 `cabinet_membres`
| Colonne | Type | Rôle |
|---|---|---|
| cabinet_id | uuid | |
| user_id | uuid **unique** | une personne, un seul cabinet |
| role | enum `responsable` / `collaborateur` / `stagiaire` | |
| actif | bool | |

Au moins un responsable actif par cabinet (contrôle à l'écriture).

### 4.3 `cabinet_dossiers` (lien cabinet ↔ société cliente)
| Colonne | Type | Rôle |
|---|---|---|
| id | uuid | |
| cabinet_id, societe_id | uuid | unique sur (societe_id) pour un lien non terminé : **un seul cabinet actif par client** |
| mission | enum (voir § 5) | **plafond** fixé par le client |
| etat | enum `invitation` / `actif` / `depart_demande` / `termine` | |
| origine | enum `cabinet` / `client` / `super_admin` | qui a créé le lien |
| depart_demande_par, depart_demande_le, depart_motif | | |
| valide_par, termine_le | | validation du super-admin |
| created_at | | |

Historique conservé : un lien terminé n'est jamais supprimé (preuve de qui avait accès, et quand).

### 4.4 `cabinet_attributions`
| Colonne | Type | Rôle |
|---|---|---|
| dossier_id → cabinet_dossiers | | |
| user_id | uuid | collaborateur ou stagiaire du même cabinet |
| mission | enum (§ 5) | ≤ mission du dossier |

Le responsable n'a pas besoin d'attribution : il agit dans tous les dossiers du cabinet, à la mission du dossier.

### 4.5 `suivi_declarations` (pour le tableau de bord)
| Colonne | Rôle |
|---|---|
| societe_id, annee, mois, type (`TVA`, `CNSS`, `IRPP`, `patente`…) | |
| statut `deposee` / `payee`, date, par, note | marqué à la main, ou déduit des écritures (§ 8) |

Utile aussi aux sociétés sans cabinet ; protégée comme les autres tables métier.

### 4.6 Fin des délégations
`fiscal_delegations` est retirée (table vide), avec `GestionDelegations.tsx` et `useFiscalDelegations.ts`, une fois l'étape 1 en service.

## 5. Missions (plafonds et droits)

Une **mission** est un jeu fixe de droits par module, pour rester simple à choisir et à vérifier :

| Mission | Compta | Fiscalité | Paie / GRH | Commercial | Stock | Immo | Paramètres société | Utilisateurs du client |
|---|---|---|---|---|---|---|---|---|
| Tenue complète | valider | valider | valider | valider | valider | valider | lecture | aucun |
| Comptabilité et fiscalité | valider | valider | lecture | lecture | lecture | valider | lecture | aucun |
| Paie et social | lecture | lecture (social) | valider | aucun | aucun | aucun | lecture | aucun |
| Déclarations | lecture | valider | lecture | lecture | lecture | lecture | lecture | aucun |
| Lecture seule | lecture | lecture | lecture | lecture | lecture | lecture | lecture | aucun |

Droits effectifs d'un collaborateur dans un dossier = **minimum** (mission du dossier, mission de son attribution), puis :
- stagiaire : « valider » devient « saisir » (jamais de validation) ;
- dossier en `depart_demande` : tout devient « lecture » ;
- dossier `invitation` ou `termine`, ou cabinet inactif : aucun accès.

Un cabinet ne gère **jamais** les utilisateurs ni les rôles du client, et ne peut ni rouvrir un exercice clos ni supprimer la société.

## 6. Contrôle d'accès en base

### 6.1 Fonctions
- `acces_cabinet(uid, societe) → mission effective` (ou null) : applique les règles du § 5. `SECURITY DEFINER`, `search_path` fixé, `EXECUTE` révoqué pour `anon`.
- `has_societe_access(uid, societe)` n'est **pas** étendue : elle ouvre aussi des tables d'administration (services, droits, délégations de service). *(Révisé le 2026-10-27 au moment du plan.)*
- `est_personnel(uid, societe)` n'est **pas** étendue non plus : une règle existante très large (`ecritures_societe_access`, FOR ALL) aurait donné à tout membre de cabinet l'écriture complète sur les écritures. *(Révisé le 2026-10-27 après relecture de la tâche 2.)*
- Les droits d'un membre de cabinet sont calculés **une fois par requête** : `cabinet_societes(module, niveau_min)` renvoie la liste des sociétés concernées, et la règle compare `societe_id` à cette liste.
- Chaque table métier reçoit une règle **permissive** propre au cabinet (lecture si niveau ≥ lecture, écriture si niveau ≥ saisie) et une règle **restrictive** en lecture comme en écriture (§ 6.2), qui reste le filet de sécurité quelles que soient les autres règles.

### 6.2 Règles restrictives d'écriture
Sur chaque table métier, une règle **RESTRICTIVE** pour INSERT / UPDATE / DELETE :
> soit l'utilisateur n'agit pas au titre d'un cabinet sur cette société (accès direct par `user_societes`), soit sa mission effective autorise l'écriture dans le module de la table.

Correspondance table → module à figer dans la migration :
compta (`ecritures_comptables`, `transactions`, `exercices`, `emprunts`), fiscalité (`informations_fiscales`, `taux_historique`, `params_annuels`, `suivi_declarations`), paie/GRH (`employes`, `bulletins_paie`, `primes`, `heures_sup`, `retenues`, `absences`, `sanctions`, `portail_messages`), commercial (`factures`, `devis`, `compteurs_numerotation`), stock (`articles`, `mouvements_stock`, `fournisseurs`, `categories_stock`), immobilisations (`immobilisations`), paramètres (`societes`, `societe_config`, `societe_identification`, `activites`).

Tables jamais écrites par un cabinet : `user_societes`, `user_roles`, `permission_overrides`, `user_activites`, `services`, `service_membres`, `cross_service_grants`.

Une personne qui a à la fois un accès direct et un accès cabinet sur la même société : l'accès direct prime (cas rare, à éviter ; signalé dans l'écran super-admin).

### 6.3 Validation
`controle_quatre_yeux()` est complétée : un membre de cabinet ne peut passer une pièce à « validé » que si sa mission effective sur le module est « valider » (donc jamais un stagiaire). La règle « pas sa propre saisie » s'applique telle quelle.

### 6.4 Audit
`audit_log` reçoit une colonne `cabinet_id`, remplie par `audit_trigger_fn()` quand l'auteur agit au titre d'un cabinet. Le journal d'audit du client affiche « Cabinet X — nom du collaborateur ».

## 7. Opérations sur les cabinets

*(Révisé le 2026-10-27 au moment du plan.)* Les opérations sont des fonctions de base `SECURITY DEFINER` (`cabinet_*`), qui contrôlent elles-mêmes le rôle de l'appelant (aal2 pour le super-admin) : elles se testent directement en SQL. Une fonction Edge `cabinet-ops` ne sert qu'à créer des comptes par e-mail (nouveau membre, futur administrateur du client), en appelant ensuite ces fonctions :

| Action | Qui | Effet |
|---|---|---|
| `creer_cabinet` | super-admin | crée le cabinet et son premier responsable |
| `ajouter_membre`, `changer_role`, `retirer_membre` | responsable | membres de son cabinet (compte existant ou invitation par e-mail) |
| `creer_dossier` | responsable | crée la société cliente + le lien `actif` (mission « Tenue complète »), refusé au-delà de `max_dossiers` |
| `inviter_cabinet` | admin du client | lien `invitation`, mission choisie par le client |
| `accepter_invitation` / `refuser_invitation` | responsable | `actif` ou `termine` |
| `attribuer` / `retirer_attribution` | responsable | dans la limite de la mission du dossier |
| `changer_mission` | admin du client, super-admin | baisse ou hausse du plafond ; les attributions au-dessus sont abaissées |
| `demander_depart` | admin du client ou responsable | `depart_demande` (lecture seule immédiate), e-mail au super-admin |
| `valider_depart` / `annuler_depart` | super-admin | `termine` ou retour `actif` |
| `rattacher` | super-admin | lien direct, toute mission |

*(Révisé le 2026-10-28 après relecture de la tâche 5.)* **Seul le super-admin crée l'administrateur d'un client** (`inviter_admin_client`), après avoir vérifié qui est le dirigeant : un responsable qui inviterait une adresse qu'il contrôle obtiendrait un administrateur client, donc tous les droits directs, la gestion des comptes du client et la dispense des quatre yeux. Un compte existant n'est accepté que s'il n'a pas d'autre société (le rôle admin est global). Un responsable n'ajoute à son cabinet que des **comptes nouveaux**, avec une réponse identique que l'adresse existe ou non. À la création d'un dossier, le cabinet saisit l'identification minimale du client (NIF, RCCM, forme juridique, début d'exercice), puisqu'il n'a ensuite que la lecture sur les paramètres. Tant qu'aucun administrateur client n'existe, seul le super-admin peut changer la mission.

*(Révisé le 2026-10-28 après la seconde relecture de la tâche 5.)*
- **Quota par tentatives** : `cabinet-ops` appelle `cabinet_reserver_ajout` (jeton de l'appelant) avant toute recherche de compte ; chaque tentative, aboutie ou non, est inscrite dans `cabinet_ajouts_tentatives` ; au-delà de 20 par cabinet sur 24 heures, `CABINET_QUOTA_JOUR`, la même réponse quelle que soit l'adresse. `cabinet_definir_membre` garde une seconde barrière (20 insertions, colonne `cabinet_membres.ajoute_par`). Le super-admin n'est jamais compté.
- **Comptes nouveaux en base** : appelée par un responsable, une insertion dans `cabinet_definir_membre` exige un compte créé il y a moins de 10 minutes, jamais connecté, sans rôle, sans société, membre d'aucun cabinet ; sinon le seul code `CABINET_COMPTE_EXISTANT` (vérifié avant tout autre refus qui décrirait le compte), que `cabinet-ops` rend comme une adresse existante.
- **Détacher un membre** (`cabinet_detacher_membre`) : supprime ses attributions et sa ligne, le compte redevient libre. Super-admin : tout membre ; responsable : un membre jamais connecté, pas lui-même. Jamais un responsable actif.
- **Renvoi d'invitation** : au plus une invitation toutes les 10 minutes par compte (`email_send_log`), sinon 429 ; côté super-admin, un non-membre doit avoir le rôle admin et être rattaché au client suivi.

## 8. Écrans

1. **Sélecteur de société** : deux groupes, « Mes sociétés » et « Clients du cabinet » (avec la mission en badge). La recherche par nom devient utile au-delà de 8 dossiers.
2. **Tableau de bord du cabinet** (nouvelle page, responsable et collaborateurs, sur leurs dossiers) :
   - échéances du mois par dossier : TVA, CNSS, IRPP, patente — faite / à faire / en retard. « Faite » = marquée dans `suivi_declarations`, ou déduite des écritures (liquidation de TVA du mois, reversement CNSS/IRPP) ;
   - pièces à traiter : opérations, factures et écritures en validation ou en brouillon, pièces sans justificatif ;
   - avancement : dernier mois saisi, bulletins du mois faits/attendus, exercice précédent clôturé ou non ;
   - charge par collaborateur (responsable seulement) : dossiers suivis, tâches en attente.
   Calculé par une fonction `tableau_cabinet()` côté base, qui ne lit que les dossiers accessibles.
3. **Gestion du cabinet** (responsable) : équipe, dossiers, attributions, création de dossier, invitations reçues, demandes de départ.
4. **Chez le client** (administrateur) : bloc « Mon cabinet » dans Paramètres société — cabinet actuel, mission (modifiable), inviter un cabinet, demander le départ.
5. **Super-admin** : liste des cabinets (formule, nombre de dossiers), création, validation des départs, signalement des doubles accès.
6. **Audit** : colonne « Cabinet » et filtre.

L'application calcule les droits d'un membre de cabinet dans le dossier ouvert à partir de sa mission effective (même traduction en `AppModule` que les rôles), pour masquer les boutons interdits. La base reste l'autorité.

## 9. Étapes de livraison

1. **Socle** : tables, fonctions d'accès, règles restrictives, quatre yeux, audit signé, `cabinet-ops` (création cabinet, membres, création de dossier, attribution, rattachement super-admin), sélecteur groupé, droits dans l'application, retrait des délégations fiscales.
2. **Tableau de bord du cabinet** et `suivi_declarations`.
3. **Invitations et départs** : invitation par le client, départ demandé et validé, lecture seule pendant l'attente, e-mails.
4. **Facturation**, une fois le modèle choisi.

Chaque étape : migrations appliquées par l'utilisateur, fonctions déployées par l'utilisateur, recette sur TEST.

## 10. Tests et recette

- **Tests de base de données** (sessions simulées, comme la recette d'octobre) sur deux cabinets et trois sociétés de test :
  - un collaborateur lit et écrit dans son dossier attribué, rien dans un dossier non attribué ni chez un autre cabinet ;
  - chaque mission bloque bien les modules hors périmètre, en écriture directe par l'API ;
  - un stagiaire ne peut jamais valider ; personne ne valide sa propre saisie ;
  - départ demandé : plus aucune écriture ; départ validé : plus aucune lecture ;
  - aucun membre de cabinet ne peut écrire dans `user_roles`, `user_societes`, `permission_overrides` ;
  - un client sans cabinet : comportement strictement identique (tests existants inchangés).
- **Tests unitaires** : calcul de la mission effective, traduction mission → droits par module, tableau de bord.
- **Recette** : parcours complet sur TEST avec des comptes créés par l'utilisateur (responsable, collaborateur, stagiaire, administrateur client).

## 11. Questions

Décidé le 2026-10-27 :
- **Dossier créé par le cabinet** : la société appartient toujours au client, qui l'emporte s'il part.
- **Après un départ** : le cabinet peut exporter pendant la lecture seule, rien après.
- **Missions** : les cinq missions du § 5, sans mission sur mesure.

Encore ouvertes (sans effet sur l'étape 1) :
1. **Facturation** : qui paie (cabinet ou client) ; que se passe-t-il au-delà de 10 dossiers (blocage ou supplément). Étape 4.
2. **Notifications** : e-mail au client à chaque validation par le cabinet, ou un récapitulatif. Étape 3.

## 12. Hors périmètre

- Plusieurs cabinets sur un même client en même temps.
- Une personne membre de plusieurs cabinets.
- La facturation elle-même (étape 4, après décision).
- Les pays autres que le Togo.
