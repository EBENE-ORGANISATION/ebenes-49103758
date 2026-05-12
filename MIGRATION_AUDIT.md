# MIGRATION_AUDIT.md — Inventaire & mapping de migration EBENE

> Produit le 2026-05-12 — à valider avant d'écrire la moindre ligne de code de prod.  
> Portée : **Chantier A** (URL comme source de vérité) + **Chantier B** (migration relationnelle).

---

## 1. Contexte architectural actuel

Toutes les données métier sont stockées dans la table Supabase `app_state` sous forme de clés JSONB  
scopées par société : `s:<societeId>:<entityKey>`.

Le hook central `useEbeneStoreRemote(societeId)` est instancié **une seule fois** dans `src/pages/Index.tsx`.  
Les composants enfants reçoivent les données et les callbacks **par props** — à l'exception de 4 fichiers  
qui appellent directement le store :

| Fichier | Usage direct |
|---|---|
| `src/pages/Index.tsx` | Point d'instanciation unique |
| `src/components/ebene/BulletinsPaie.tsx` | `useEbeneStore(societeId)` |
| `src/components/ebene/Header.tsx` | `useEbeneStore(societeId)` |
| `src/pages/Bulletins.tsx` | `useEbeneStore(societeId)` |
| `src/components/employe/PortailAdminView.tsx` | `useEbeneStore(societeId)` |

---

## 2. Inventaire des 9 clés `app_state`

### 2.1 `donneesMensuelles` — LA CLÉ MONOLITHE ⚠️

**Clé Supabase :** `s:<id>:donneesMensuelles`  
**Type TS :** `Record<moisKey, MoisData>` — objet indexé par `"YYYY-M"`.

Chaque `MoisData` contient 8 sous-entités :

| Sous-entité | Type TS | Table relationnelle cible | Statut |
|---|---|---|---|
| `transactions[]` | `Transaction` | **À créer** : `transactions` | ❌ manquante |
| `factures[]` | `Facture` | `factures` | ✅ existe |
| `primes` | `Record<empId, Prime[]>` | `primes` | ✅ existe |
| `absences[]` | `Absence` | `absences` | ✅ existe |
| `heuresSup` | `Record<empId, HeuresSup>` | `heures_sup` | ✅ existe |
| `retenues` | `Record<empId, number>` | **À créer** : `retenues` | ❌ manquante |
| `mouvementsStock[]` | `MouvementStock` | `mouvements_stock` | ✅ existe |
| `devis[]` | `Devis` | `devis` | ✅ existe |

**Composants consommateurs :**
- `Comptabilite` — transactions (affichage + add/remove/valider/rejeter)
- `Fiscalite` — transactions + primes + absences + données annuelles
- `Factures` — factures + devis (CRUD complet)
- `GRH` → `AbsencesPanel`, `HeuresSupPanel`, `BulletinPaie` — primes + absences + heuresSup + retenues
- `Dashboard` — lecture seule sur toute la map mensuelle
- `RecapAnnuelModal` — lecture seule sur toute la map annuelle
- `ArchivesModal` — lecture seule sur toute la map

**Complexité de migration :** ÉLEVÉE — nécessite 2 nouvelles tables + backfill de 6 tables existantes.

---

### 2.2 `employes`

**Clé Supabase :** `s:<id>:employes`  
**Type TS :** `Employe[]`  
**Table cible :** `employes` ✅

**Champs clés :** `id` (int), `nom`, `prenom`, `salaire`, `poste`, `dateEmbauche`, `typeContrat`,  
`statutValidation` (`en_validation | valide | rejete`), `user_id` (lien auth), `matricule`.

**RLS :** `societe_id` présent — politiques existantes via `has_societe_access()`.

**Composants consommateurs :**
- `GRH` (employesPaie filtré) + `EmployeForm`, `BulletinPaie`, `IndemnitesCalculator`, `ContratGenerator`
- `Comptabilite`, `Fiscalite` — liste filtrée (validés seulement)
- `Dashboard` — stats RH
- `BulletinsPaie` (appel direct du store)
- `PortailAdminView` (appel direct du store)

**Hook cible :** `src/hooks/data/useEmployes.ts`

---

### 2.3 `paramsAnnuels`

**Clé Supabase :** `s:<id>:paramsAnnuels`  
**Type TS :** `Record<number, ParamsAnnuels>` (indexé par année)  
**Table cible :** `params_annuels` ✅

**Champs :** `annee`, `th` (taux horaire), `rsl` (rémunération seuil), `activite` (secteur).

**RLS :** `societe_id` présent.

**Composants consommateurs :**
- `Fiscalite` — `store.getParamAnnuel(annee)` + `store.setParamAnnuel(annee, p)`

**Hook cible :** `src/hooks/data/useParamsAnnuels.ts`

---

### 2.4 `tauxHistorique`

**Clé Supabase :** `s:<id>:tauxHistorique`  
**Type TS :** `TauxFiscaux[]`  
**Table cible :** ⚠️ **GARDER dans `app_state`** — configuration fiscale globale de la société, pas une entité métier.

**Raison :** Les taux fiscaux changent rarement, sont lus par `tauxPourMois()` utilitaire, et n'ont pas  
besoin d'historique transactionnel. La migration n'apporterait pas de bénéfice de sécurité.

**Composants consommateurs :**
- `Fiscalite` — `ajouterTaux`, `supprimerTaux`
- `TauxHistoriqueDialog`
- `Index.tsx` — `tauxPourMois(store.tauxHistorique, annee, mois)`
- `Dashboard`, `RecapAnnuelModal`

**Décision :** Hors scope Chantier B.

---

### 2.5 `articles`

**Clé Supabase :** `s:<id>:articles`  
**Type TS :** `Article[]`  
**Table cible :** `articles` ✅

**Champs :** `id`, `designation`, `reference`, `stock`, `stockMin`, `prixAchat`, `prixVente`,  
`categorie`, `fournisseurId`, `unite`.

**RLS :** `societe_id` présent.

**Composants consommateurs :**
- `Stock` (props directes)
- `Index.tsx` — `alertes` (stock faible)

**Hook cible :** `src/hooks/data/useArticles.ts`

---

### 2.6 `fournisseurs`

**Clé Supabase :** `s:<id>:fournisseurs`  
**Type TS :** `Fournisseur[]`  
**Table cible :** `fournisseurs` ✅

**Champs :** `id`, `nom`, `contact`, `email`, `telephone`, `adresse`.

**RLS :** `societe_id` présent.

**Composants consommateurs :**
- `Stock` (props directes — select fournisseur dans les mouvements)

**Hook cible :** `src/hooks/data/useFournisseurs.ts`

---

### 2.7 `categoriesStock`

**Clé Supabase :** `s:<id>:categoriesStock`  
**Type TS :** `CategorieArticle[]`  
**Table cible :** `categories_stock` ✅

**Champs :** `id`, `nom`.

**RLS :** `societe_id` présent.

**Composants consommateurs :**
- `Stock` (props directes — filtre + tag articles)

**Hook cible :** `src/hooks/data/useCategoriesStock.ts`

---

### 2.8 `sanctions`

**Clé Supabase :** `s:<id>:sanctions`  
**Type TS :** `Sanction[]`  
**Table cible :** **À créer** : `sanctions` ❌

**Champs à prévoir :**
```sql
CREATE TABLE sanctions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  employe_id  text NOT NULL,       -- correspond au champ id (int) de Employe, à aligner
  date        date NOT NULL,
  type        text NOT NULL,       -- "avertissement" | "mise_a_pied" | "licenciement"
  motif       text,
  duree_jours integer,
  statut_validation text DEFAULT 'valide',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE sanctions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON sanctions
  USING (has_societe_access(societe_id));
```

**Composants consommateurs :**
- `GRH` → `DisciplinePanel`

**Hook cible :** `src/hooks/data/useSanctions.ts`

---

### 2.9 `immobilisations`

**Clé Supabase :** `s:<id>:immobilisations`  
**Type TS :** `Immobilisation[]`  
**Table cible :** `immobilisations` ✅

**Champs :** `id`, `libelle`, `valeurOrigine`, `dateAcquisition`, `dureeAmortissement`,  
`compteImmobilisation`, `compteAmortissement`, `compteDotatation`.

**RLS :** `societe_id` présent.

**Composants consommateurs :**
- `Immobilisations` tab (props directes)
- `RecapAnnuelModal` — calcul amortissements annuels

**Hook cible :** `src/hooks/data/useImmobilisations.ts`

---

## 3. Tables à créer (Chantier B — SQL migrations)

| Table | Priorité | Raison |
|---|---|---|
| `transactions` | HAUTE | Données de trésorerie — fuite potentielle critique |
| `sanctions` | MOYENNE | Données RH sensibles (sanctions disciplinaires) |
| `retenues` | MOYENNE | Retenues mensuelles par employé |

### DDL `transactions`
```sql
CREATE TABLE transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  annee           integer NOT NULL,
  mois            integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  libelle         text NOT NULL,
  montant         numeric(15,2) NOT NULL,
  type            text NOT NULL CHECK (type IN ('recette','depense')),
  source          text,           -- 'facture' | 'salaire' | 'manuel' | etc.
  statut_validation text DEFAULT 'valide',
  motif_rejet     text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON transactions
  USING (has_societe_access(societe_id));
CREATE INDEX ON transactions(societe_id, annee, mois);
```

### DDL `retenues`
```sql
CREATE TABLE retenues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  employe_id  text NOT NULL,
  annee       integer NOT NULL,
  mois        integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  montant     numeric(15,2) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (societe_id, employe_id, annee, mois)
);
ALTER TABLE retenues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON retenues
  USING (has_societe_access(societe_id));
```

---

## 4. Tables existantes — statut RLS confirmé

| Table | societe_id | RLS activé | Politique |
|---|---|---|---|
| `employes` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `absences` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `heures_sup` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `primes` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `factures` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `devis` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `articles` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `fournisseurs` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `categories_stock` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `mouvements_stock` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `immobilisations` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `params_annuels` | ✅ | ✅ | `has_societe_access(societe_id)` |
| `bulletins_paie` | ✅ | ✅ | `has_societe_access(societe_id)` |

---

## 5. Chantier A — Plan URL comme source de vérité

**Problème :** `useTenant` utilise `localStorage` pour mémoriser `currentSocieteId`. Deux onglets  
ouverts sur des sociétés différentes partagent le même `localStorage` → données croisées.

**Solution :** L'URL hash `/#/?sid=<uuid>` est la seule source de vérité. Chaque onglet a sa propre URL.

### 5.1 Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/hooks/useTenant.ts` | Remplacer la lecture LS par `useSyncExternalStore` sur `hashchange` |
| `src/components/SocieteSwitcher.tsx` | `navigate(\`/?sid=${id}\`)` au lieu de `setCurrentSocieteId(id)` |
| `src/App.tsx` | Aucun changement de routing nécessaire (HashRouter déjà en place) |
| `src/components/superadmin/SuperAdminPanel.tsx` | Déjà conforme (`<a href=".../>#/?sid=...">`) |

### 5.2 Nouveau `useTenant` — schéma

```typescript
// Lecture réactive du sid depuis l'URL — ne bloque JAMAIS sur localStorage
const getSnapshot = () => {
  const hash = window.location.hash;
  const m = hash.match(/[?&]sid=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
};

// Dans useTenant :
const currentId = useSyncExternalStore(subscribe, getSnapshot, () => null);
```

### 5.3 Supprimer

- Toutes les clés `ebene:current_societe_id*` de localStorage
- Toutes les clés `ebene:appli_mere*` de localStorage
- `setCurrentSocieteId` (remplacé par `navigate`)
- `sidReadRef`, Effet 1, Effet 2 dans `useTenant`

### 5.4 Naviguer vers une société

```typescript
// Hook utilitaire
export const useTenantNavigate = () => {
  return useCallback((societeId: string | null) => {
    const base = window.location.pathname;
    if (societeId) {
      window.history.pushState(null, "", `${base}#/?sid=${encodeURIComponent(societeId)}`);
    } else {
      window.history.pushState(null, "", `${base}#/`);
    }
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
};
```

---

## 6. Chantier B — Plan de migration relationnelle

### Phase B.1 (ce document) ✅ TERMINÉ

### Phase B.2 — Repos + hooks TanStack Query

Pour chaque entité migrable, créer :
1. `src/data/<entity>Repo.ts` — CRUD Supabase pur
2. `src/hooks/data/use<Entity>.ts` — TanStack Query avec `queryKey: [entity, societeId]`

**Ordre de priorité (impact isolation / complexité) :**

| Priorité | Entité | Complexité | Effort estimé |
|---|---|---|---|
| 1 | `employes` | FAIBLE | 4h |
| 2 | `articles` + `fournisseurs` + `categoriesStock` | FAIBLE | 6h |
| 3 | `immobilisations` | FAIBLE | 3h |
| 4 | `paramsAnnuels` | FAIBLE | 2h |
| 5 | `absences` + `heuresSup` + `primes` | MOYENNE | 8h |
| 6 | `factures` + `devis` + `mouvementsStock` | MOYENNE | 8h |
| 7 | `transactions` (nouvelle table) | HAUTE | 6h |
| 8 | `sanctions` + `retenues` (nouvelles tables) | HAUTE | 4h |

### Phase B.3 — Proxy de dépréciation dans `useEbeneStoreRemote`

Chaque entité migrée est remplacée dans le store par un proxy qui :
1. Lit depuis le hook TanStack Query (cache React Query)
2. Redirige les écritures vers le nouveau repo
3. Conserve la signature de l'interface publique existante (zéro changement dans les composants)
4. Affiche `console.warn("DEPRECATED: utiliser useEmployes directement")` en développement

### Phase B.4 — Suppression progressive de `app_state`

Une fois toutes les entités migrées et validées en production, supprimer les clés `s:*:*`  
de `app_state` + retirer le proxy + retirer `useEbeneStoreRemote`.

---

## 7. Risques identifiés

| Risque | Sévérité | Mitigation |
|---|---|---|
| ID mismatch : `Employe.id` est un `number` (local), `employes.id` est un `uuid` | HAUTE | Ajouter `legacy_id` int pendant la transition, migrer en double-write |
| `donneesMensuelles` est un blob atomique — lecture/écriture partielle délicate | HAUTE | Migrer sous-entité par sous-entité, garder le blob en lecture seule pendant la transition |
| `tauxHistorique` reste dans `app_state` — ne pas oublier de lui appliquer le triple defense Realtime | BASSE | Déjà fait dans la session précédente |
| `has_societe_access()` doit être vérifiée pour les 3 nouvelles tables | MOYENNE | Inclure dans le DDL avant tout INSERT |
| `SocieteSwitcher` navigue sans rechargement — les hooks TanStack Query doivent réagir au changement de `societeId` | MOYENNE | `queryKey: [entity, societeId]` invalide automatiquement |

---

## 8. Confirmation du mapping avant code

> ✅ = peut passer en Phase B.2 immédiatement (table confirmée dans types.ts)  
> ⏳ = nécessite migration SQL d'abord

| Entité | Statut | Bloquant |
|---|---|---|
| `employes` | ✅ Prêt | — |
| `articles` | ✅ Prêt | — |
| `fournisseurs` | ✅ Prêt | — |
| `categoriesStock` | ✅ Prêt | — |
| `immobilisations` | ✅ Prêt | — |
| `paramsAnnuels` | ✅ Prêt | — |
| `absences` | ✅ Prêt | — |
| `heuresSup` | ✅ Prêt | — |
| `primes` | ✅ Prêt | — |
| `factures` | ✅ Prêt | — |
| `devis` | ✅ Prêt | — |
| `mouvementsStock` | ✅ Prêt | — |
| `transactions` | ⏳ DDL requis | Appliquer migration SQL d'abord |
| `sanctions` | ⏳ DDL requis | Appliquer migration SQL d'abord |
| `retenues` | ⏳ DDL requis | Appliquer migration SQL d'abord |
| `tauxHistorique` | 🚫 Hors scope | Garder dans app_state |

---

*Document généré automatiquement — valider avec l'équipe avant d'ouvrir un PR.*
