# Espace cabinet, étape 2 (tableau de bord) — plan de travail

> **Pour l'exécution :** tâches confiées à Codex (`codex exec`), relues et testées par Claude, une tâche à la fois. Les étapes sont des cases à cocher (`- [ ]`).

**Objectif :** dans « Mon cabinet », un onglet « Tableau de bord » montre, pour chaque dossier suivi, les échéances fiscales et sociales du mois, les pièces à traiter et l'avancement ; le responsable voit en plus la charge de chaque collaborateur. Une déclaration se marque « déposée » ou « payée » depuis ce tableau.

**Architecture :** une table `suivi_declarations` protégée comme les tables fiscales (accès direct et règles cabinet du module `fiscalite`). Une fonction `tableau_cabinet(_annee, _mois, _aujourdhui)` calcule tout côté base, sur les seuls dossiers que l'appelant peut lire. L'application affiche le résultat et écrit dans `suivi_declarations`.

**Technique :** Supabase (Postgres, RLS), React, TanStack Query, Vitest.

**Spécification :** `docs/superpowers/specs/2026-10-27-espace-cabinet-design.md` (§ 4.5, § 8.2, étape 2 du § 9).

## Contraintes générales

- Migrations `supabase/migrations/202611021xxxxx_*.sql`. **L'utilisateur les applique** à l'aide d'un fichier `supabase/maintenance/deploiement-*.sql` (garde sur `20261102090000`, inscription dans `schema_migrations`, une transaction).
- Nouvelle table : `ENABLE ROW LEVEL SECURITY` et `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`.
- Fonctions : `SECURITY DEFINER`, `SET search_path = public`, `REVOKE … FROM public, anon`, `GRANT EXECUTE … TO authenticated`.
- Tests SQL au format de `supabase/tests/cabinet_equipe.sql` (`BEGIN` … `ROLLBACK`, fixtures `00000000-ca2N-…`, adresses `@exemple.invalid`), exécutés par Claude sur la production en transaction annulée.
- Textes de l'interface en français, avec leur traduction anglaise dans `src/i18n/locales/en.ts`. Tests de composants en français forcé (`await i18n.changeLanguage("fr")`).
- Une société sans cabinet se comporte exactement comme avant : `supabase/tests/sans_cabinet.sql` et toute la suite vitest restent verts.
- Codex ne commite pas ; Claude commite avec `Co-Authored-By: Codex <noreply@openai.com>` et `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push sans accord.

## Règles métier retenues

- **Période** : `(_annee, _mois)` est la période déclarée. L'échéance de TVA, CNSS et IRPP est le **15 du mois suivant** (convention déjà utilisée par `src/lib/alertes.ts`). Par défaut, l'écran montre la période du mois précédent.
- **Patente** : déclaration annuelle (`mois = 0`), échéance au **31 mars** de l'année. *À confirmer par l'utilisateur à la relecture du plan.* Elle n'est « faite » que si elle est marquée.
- **États** d'une échéance : `faite`, `a_faire` (échéance pas encore passée), `en_retard` (`_aujourdhui` > échéance), `sans_objet` (rien à déclarer sur la période).
- **TVA faite** : une ligne `suivi_declarations` (TVA, période), ou une écriture validée de la période qui est une liquidation de TVA. Même règle que `estLiquidationTva` (`src/lib/etatsFinanciers.ts`) : un débit sur un compte `443…` hors `4438`, une contrepartie `4441`, `4449`, `5…` (de `50` à `58`) ou un crédit `445…`, et aucune ligne en classe 6 ou 7. **Sans objet** : aucune ligne `443…` ni `445…` dans les écritures validées de la période.
- **CNSS faite** (comptes `431…` et `433…`) et **IRPP faite** (comptes `447…`) : une ligne `suivi_declarations`, ou un dû soldé. Le dû se calcule comme `dettesPaie` : Σ crédits des écritures validées datées avant le 1er du mois suivant la période, moins Σ débits de toutes les écritures validées, arrondi ; faite si ce dû est ≤ 0. **Sans objet** : aucun crédit sur ces comptes dans les écritures validées de la période.
- **Pièces à traiter** (par dossier, tous mois confondus) : transactions `statut = 'en_validation'`, factures `statut_validation = 'en_validation'`, écritures `statut = 'brouillon'`, et transactions de l'année `_annee` de type dépense sans `piece_jointe` (`auto` faux, `deleted_at` nul).
- **Avancement** : dernier mois saisi (plus grand `(annee, mois)` d'une écriture validée) ; bulletins de la période faits sur bulletins attendus (employés non supprimés, embauchés au plus tard à la fin de la période, sans fin de contrat avant le début de la période) ; exercice `_annee - 1` clôturé ou non (`exercices.statut = 'cloture'`).
- **Dossiers visibles** : liens `actif` et `depart_demande`. Le responsable actif voit tous les dossiers de son cabinet ; collaborateurs et stagiaires ne voient que ceux qui leur sont attribués. La charge par collaborateur n'est renvoyée qu'au responsable.

## Points de vigilance (tests ajoutés aux tâches indiquées)

1. Un collaborateur ne voit ni les dossiers non attribués, ni la charge des autres → test en tâche 2.
2. Un membre ou un cabinet désactivé, ou un dossier `termine`, disparaît du tableau à l'appel suivant → test en tâche 2.
3. Un dossier sans aucune écriture (dossier neuf) : toutes les échéances `sans_objet`, aucun dernier mois, sans erreur → test en tâche 2.
4. Marquer une déclaration demande le niveau 2 en fiscalité : en mission `paie_social` (fiscalité 1) ou pour un stagiaire en `lecture`, l'écriture dans `suivi_declarations` est refusée → test en tâche 1 ; le bouton n'apparaît pas → test en tâche 3.
5. Marquer deux fois la même déclaration : mise à jour de la ligne existante, pas de doublon ni d'erreur visible → contrainte unique en tâche 1, upsert en tâche 3.

---

### Tâche 1 : table `suivi_declarations`

**Fichiers :**
- Créer : `supabase/migrations/20261102100000_suivi_declarations.sql`
- Créer : `supabase/tests/suivi_declarations.sql`
- Modifier : `src/integrations/supabase/types.ts` (ajout de la table, à la main)

**Interfaces :**
- Produit : table `public.suivi_declarations(id uuid PK DEFAULT gen_random_uuid(), societe_id uuid NOT NULL REFERENCES societes ON DELETE CASCADE, annee smallint NOT NULL, mois smallint NOT NULL CHECK (mois BETWEEN 0 AND 12), type text NOT NULL CHECK (type IN ('TVA','CNSS','IRPP','patente')), statut text NOT NULL CHECK (statut IN ('deposee','payee')), date date NOT NULL DEFAULT current_date, par uuid, note text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (societe_id, annee, mois, type), CHECK ((type = 'patente') = (mois = 0)))`.

- [ ] **Étape 1 : écrire le test SQL** `supabase/tests/suivi_declarations.sql`. Il vérifie :
  - un administrateur de la société (accès direct) insère, modifie et supprime ;
  - un membre du service comptable de la société (`in_service_compta`) insère ;
  - un simple employé de la société lit, mais ne peut pas écrire ;
  - collaborateur en `tenue_complete` : il écrit ;
  - collaborateur en `paie_social` : il lit, mais ne peut pas écrire ;
  - stagiaire : il écrit en `compta_fiscalite` ;
  - personne n'écrit pour une autre société, et aucun cabinet sur un dossier `termine` ;
  - `par` vaut toujours `auth.uid()`, même si l'appelant envoie une autre valeur ;
  - une seconde insertion sur la même clé échoue (`unique_violation`) ;
  - `patente` avec `mois = 3` est refusée, et `TVA` avec `mois = 0` aussi ;
  - une ligne d'`audit_log` est écrite et signée du cabinet quand c'est un collaborateur.
- [ ] **Étape 2 :** Claude lance le test sur la production en transaction annulée, sans la migration. Attendu : échec, la table est absente.
- [ ] **Étape 3 : écrire la migration.**
  - **Accès direct**, sur le modèle de `informations_fiscales` dans la baseline :
    - SELECT : `est_personnel(auth.uid(), societe_id)` ;
    - écriture : `is_admin_general`, ou `has_societe_access` combiné avec `is_admin` ou `in_service_compta`.
  - **Règles cabinet** :
    - même forme que la boucle de `20261027122000_cabinet_regles_acces.sql` pour la ligne `('suivi_declarations','societe_id','fiscalite',2,true,3)` ;
    - politiques `cabinet_lecture`, `cabinet_ecriture_insert|update|delete`, `cabinet_plafond_lecture` et `cabinet_plafond_ecriture_insert|update|delete`, écrites en clair ;
    - trigger `trg_societe_immuable` ;
    - garde : `module_de_table('suivi_declarations') = 'fiscalite'`.
  - **Champ `par`** : trigger BEFORE INSERT OR UPDATE qui force `par := auth.uid()`.
  - **Audit** : trigger `audit_suivi_declarations` AFTER INSERT OR UPDATE OR DELETE, exécutant `audit_trigger_fn()`.
- [ ] **Étape 4 :** Claude relance le test avec la migration. Attendu : `OK suivi_declarations`, puis `sans_cabinet.sql` vert.
- [ ] **Étape 5 :** `npx.cmd tsc --noEmit -p tsconfig.app.json` vert ; commit « Suivi des déclarations : table et règles d'accès ».

### Tâche 2 : fonction `tableau_cabinet`

**Fichiers :**
- Créer : `supabase/migrations/20261102101000_tableau_cabinet.sql`
- Créer : `supabase/tests/tableau_cabinet.sql`
- Créer : `supabase/maintenance/deploiement-cabinet-etape-2.sql` (tâches 1 et 2, garde sur `20261102090000`)

**Interfaces :**
- Consomme : `suivi_declarations` (tâche 1), `cabinet_lit_dossier(uid, dossier)` et `private.cabinet_responsable_actif(uid, cabinet)` (étape 1).
- Produit : `public.tableau_cabinet(_annee int, _mois int, _aujourdhui date DEFAULT current_date) RETURNS jsonb`. Forme du résultat :
  ```json
  {
    "cabinet_id": "uuid",
    "responsable": true,
    "dossiers": [{
      "dossier_id": "uuid", "societe_id": "uuid", "societe_nom": "text",
      "mission": "tenue_complete", "etat": "actif",
      "echeances": [
        {"type": "TVA", "annee": 2026, "mois": 10, "echeance": "2026-11-15",
         "etat": "a_faire", "marquee": null}
      ],
      "pieces": {"transactions": 0, "factures": 0, "ecritures_brouillon": 0, "sans_justificatif": 0},
      "avancement": {"dernier_mois": "2026-10", "bulletins_faits": 3, "bulletins_attendus": 4,
                     "exercice_precedent_cloture": true}
    }],
    "charge": [{"user_id": "uuid", "nom": "text", "role": "collaborateur", "dossiers": 2, "pieces": 5}]
  }
  ```
  - `echeances` : toujours 4 entrées, dans l'ordre TVA, CNSS, IRPP, patente. `patente` porte `mois` 0 et l'échéance du 31 mars.
  - `marquee` vaut `{"statut", "date", "par_nom"}` quand une ligne `suivi_declarations` existe, sinon `null`.
  - `charge` vaut `null` si l'appelant n'est pas responsable. Pour un responsable, une entrée par membre actif ; `pieces` est la somme des pièces de ses dossiers.
  - Appelant sans cabinet : `CABINET_INTERDIT` (42501). `_mois` hors de 1 à 12 : `CABINET_PARAMETRE`.

- [ ] **Étape 1 : écrire le test SQL** `supabase/tests/tableau_cabinet.sql`.
  - **Fixtures** :
    - un cabinet avec un responsable, un collaborateur (attribué au dossier A) et un stagiaire ;
    - le dossier A contient :
      - une liquidation de TVA validée en octobre ;
      - des salaires d'octobre (crédit 431 et 447) dont le CNSS est réglé en novembre et l'IRPP non réglé ;
      - deux transactions `en_validation` ;
      - une dépense sans pièce ;
      - 2 bulletins d'octobre pour 3 employés ;
    - un dossier B neuf, non attribué ;
    - un dossier C `termine`.
  - **Assertions** pour `tableau_cabinet(2026, 10, '2026-11-20')` :
    - responsable : dossiers A et B, mais pas C ; dans A, TVA `faite`, CNSS `faite`, IRPP `en_retard`, patente `a_faire` ; `pieces.transactions = 2`, `sans_justificatif = 1` ; `bulletins_faits = 2`, `bulletins_attendus = 3` ; `charge` non nul, et le collaborateur y porte `dossiers = 1` ;
    - même appel avec `_aujourdhui = '2026-11-10'` : IRPP `a_faire` ;
    - dossier B : TVA, CNSS et IRPP `sans_objet`, `dernier_mois` nul ;
    - collaborateur : seulement A, et `charge` nul ;
    - une ligne `suivi_declarations` IRPP `payee` sur A fait passer IRPP à `faite`, avec `marquee.statut = 'payee'` ;
    - collaborateur désactivé, ou cabinet désactivé : `CABINET_INTERDIT` ou aucun dossier ;
    - appelant sans cabinet : `CABINET_INTERDIT` ;
    - `_mois = 13` : `CABINET_PARAMETRE` ;
    - fonction `SECURITY DEFINER`, `search_path` fixé, pas d'exécution pour `anon`.
- [ ] **Étape 2 :** Claude lance le test sans la migration. Attendu : échec, la fonction est absente.
- [ ] **Étape 3 : écrire la fonction.** Les règles métier sont au début du plan. Le dû CNSS/IRPP et la liquidation de TVA se calculent sur `jsonb_array_elements(lignes)` ; elles vont dans deux fonctions `private` : `private.tva_liquidee(_societe uuid, _annee int, _mois int) -> boolean` et `private.du_social(_societe uuid, _prefixes text[], _avant date) -> numeric`.
- [ ] **Étape 4 :** Claude relance les tests de la tâche 1, de la tâche 2 et `sans_cabinet.sql`. Attendu : tous verts.
- [ ] **Étape 5 :** commit « Tableau du cabinet : fonction tableau_cabinet ». L'utilisateur lance le fichier de déploiement.

### Tâche 3 : onglet « Tableau de bord » dans Mon cabinet

**Fichiers :**
- Créer : `src/lib/tableauCabinet.ts` (types du résultat, libellés et couleurs des états, `periodeParDefaut(aujourdhui: Date): { annee: number; mois: number }`)
- Créer : `src/hooks/data/useTableauCabinet.ts`
- Créer : `src/components/cabinet/TableauCabinet.tsx`
- Modifier : `src/pages/Cabinet.tsx` (premier onglet), `src/i18n/locales/fr.ts`, `src/i18n/locales/en.ts`
- Tests : `src/lib/tableauCabinet.test.ts`, `src/components/cabinet/TableauCabinet.test.tsx`

**Interfaces :**
- Consomme : RPC `tableau_cabinet` (tâche 2), table `suivi_declarations` (tâche 1), `permissionsMission` (`src/lib/missionCabinet.ts`).
- Produit :
  - `useTableauCabinet(annee: number, mois: number)` : `useQuery`, clé `["tableau_cabinet", annee, mois]` ;
  - `useMarquerDeclaration()` : `useMutation` qui fait un upsert sur `suivi_declarations` (`onConflict: "societe_id,annee,mois,type"`), puis invalide `tableau_cabinet`.

- [ ] **Étape 1 : écrire les tests.**
  - `periodeParDefaut` :
    - `new Date(2026, 10, 2)` donne `{ annee: 2026, mois: 10 }` ;
    - `new Date(2027, 0, 5)` donne `{ annee: 2026, mois: 12 }`.
  - Composant, avec le hook simulé :
    - une ligne par dossier, avec son nom et le badge de mission ;
    - les 4 échéances affichées « Faite », « À faire », « En retard » ou « Sans objet » ;
    - le compteur de pièces et l'avancement « 2 / 3 bulletins » ;
    - le bloc « Charge de l'équipe » seulement si `charge` n'est pas nul ;
    - un clic sur une échéance « À faire » d'un dossier où la fiscalité est au niveau 2 ou plus ouvre un choix « Déposée » / « Payée » qui appelle la mutation avec `{ societe_id, annee, mois, type, statut }` ;
    - si la fiscalité est au niveau 1 (mission `paie_social`), aucun bouton ;
    - le sélecteur de période (mois et année) change les arguments du hook.
- [ ] **Étape 2 :** `npx.cmd vitest run src/lib/tableauCabinet.test.ts src/components/cabinet/TableauCabinet.test.tsx`. Attendu : échec, les modules sont absents.
- [ ] **Étape 3 : implémenter.**
  - L'onglet « Tableau de bord » vient en premier dans `Cabinet.tsx` et s'ouvre par défaut.
  - Le niveau en fiscalité d'un dossier se calcule avec `permissionsMission(dossier.mission, role, dossier.etat).fiscalite` ; le rôle vient du membre connecté (`useCabinet`).
  - Pas de nouvelle dépendance. Mise en page cohérente avec `DossiersCabinet.tsx` : un tableau sur ordinateur, des cartes sur téléphone.
- [ ] **Étape 4 :** les tests de l'étape 1, puis `npx.cmd vitest run` en entier et `tsc` : tout vert.
- [ ] **Étape 5 :** commit « Mon cabinet : tableau de bord ».

### Tâche 4 : recette sur TEST

- [ ] **4.1** Avec les comptes de recette de l'étape 1 (Cabinet Test suit EBENE SERVICES - TEST) :
  - le responsable voit le tableau et la charge ;
  - OGA voit TEST, mais pas la charge ;
  - les échéances de la période d'octobre 2026 correspondent aux écritures de TEST : TVA d'octobre, salaires d'octobre ;
  - marquer une déclaration la fait passer à « Faite », et la ligne apparaît dans le Journal d'audit, signée « Cabinet Test — OGA » ;
  - le stagiaire en mission « Lecture » n'a aucun bouton.
- [ ] **4.2** Noter les objets créés dans `docs/recette/journal-creations.md` et les anomalies dans `docs/recette/bugs.md`. Rapport `docs/recette/rapport-etape-2.md`. Commit « Recette : espace cabinet, étape 2 ».
