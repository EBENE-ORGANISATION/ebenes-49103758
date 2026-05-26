import type { AppRole, CrossServiceGrant } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppModule =
  // ── Modules parents (8) ──────────────────────────────────────────────────
  | "dashboard"
  | "compta"
  | "factures"
  | "stock"
  | "immobilisations"
  | "fiscalite"
  | "parametres_sociaux"
  | "grh"
  // ── Sous-modules compta (4) ───────────────────────────────────────────────
  | "saisie_ecritures"
  | "validation_ecritures"
  | "journaux"
  | "rapports_compta"
  // ── Sous-modules factures (3) ─────────────────────────────────────────────
  | "devis"
  | "factures_vente"
  | "factures_achat"
  // ── Sous-modules stock (3) ────────────────────────────────────────────────
  | "articles"
  | "mouvements_stock"
  | "inventaire"
  // ── Sous-modules immobilisations (2) ─────────────────────────────────────
  | "fiches_immo"
  | "cessions_immo"
  // ── Sous-modules fiscalite (5) ────────────────────────────────────────────
  | "tva"
  | "is_impot"
  | "imf"
  | "patente"
  | "parafiscaux"
  // ── Sous-modules parametres_sociaux (2) ──────────────────────────────────
  | "grilles_salaire"
  | "baremes_cnss"
  // ── Sous-modules grh (5) ─────────────────────────────────────────────────
  | "employes"
  | "bulletins"
  | "conges_absences"
  | "sanctions"
  | "paie_virements";

export type AccessLevel = "none" | "read" | "write" | "validate";

// ─── Labels ───────────────────────────────────────────────────────────────────

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "📊 Dashboard",
  compta: "💰 Comptabilité",
  factures: "📄 Factures",
  stock: "📦 Stock",
  immobilisations: "🏢 Immobilisations",
  fiscalite: "🧮 Fiscalité",
  parametres_sociaux: "⚙️ Paramètres sociaux",
  grh: "👥 GRH",
};

export const SUBMODULE_LABELS: Partial<Record<AppModule, string>> = {
  // compta
  saisie_ecritures: "✏️ Saisie des écritures",
  validation_ecritures: "✅ Validation des écritures",
  journaux: "📋 Journaux",
  rapports_compta: "📈 Rapports & bilan",
  // factures
  devis: "📝 Devis",
  factures_vente: "📤 Factures de vente",
  factures_achat: "📥 Factures d'achat",
  // stock
  articles: "🏷️ Articles",
  mouvements_stock: "🔄 Mouvements de stock",
  inventaire: "📊 Inventaire",
  // immobilisations
  fiches_immo: "📁 Fiches d'immobilisations",
  cessions_immo: "💸 Cessions & retraits",
  // fiscalite
  tva: "🧾 TVA",
  is_impot: "🏦 Impôt sur les sociétés",
  imf: "📋 IMF",
  patente: "📜 Patente",
  parafiscaux: "💼 Parafiscaux",
  // parametres_sociaux
  grilles_salaire: "📊 Grilles de salaire",
  baremes_cnss: "🏥 Barèmes CNSS / AMU",
  // grh
  employes: "👤 Employés",
  bulletins: "📃 Bulletins de paie",
  conges_absences: "🏖️ Congés & absences",
  sanctions: "⚠️ Sanctions",
  paie_virements: "💳 Paie & virements",
};

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "Aucun accès",
  read: "Lecture seule",
  write: "Lecture + saisie",
  validate: "Lecture + saisie + validation",
};

// ─── Structure des modules ────────────────────────────────────────────────────

/** Les 8 modules parents (affichés comme entrées de menu). */
export const MODULES: AppModule[] = [
  "dashboard",
  "compta",
  "factures",
  "stock",
  "immobilisations",
  "fiscalite",
  "parametres_sociaux",
  "grh",
];

/** Arbre parent → enfants (seuls les parents ayant des enfants). */
export const MODULE_CHILDREN: Partial<Record<AppModule, AppModule[]>> = {
  compta:             ["saisie_ecritures", "validation_ecritures", "journaux", "rapports_compta"],
  factures:           ["devis", "factures_vente", "factures_achat"],
  stock:              ["articles", "mouvements_stock", "inventaire"],
  immobilisations:    ["fiches_immo", "cessions_immo"],
  fiscalite:          ["tva", "is_impot", "imf", "patente", "parafiscaux"],
  parametres_sociaux: ["grilles_salaire", "baremes_cnss"],
  grh:                ["employes", "bulletins", "conges_absences", "sanctions", "paie_virements"],
};

/** Tous les modules (parents + sous-modules) dans l'ordre d'affichage. */
export const ALL_MODULES: AppModule[] = [
  "dashboard",
  "compta",
  "saisie_ecritures", "validation_ecritures", "journaux", "rapports_compta",
  "factures",
  "devis", "factures_vente", "factures_achat",
  "stock",
  "articles", "mouvements_stock", "inventaire",
  "immobilisations",
  "fiches_immo", "cessions_immo",
  "fiscalite",
  "tva", "is_impot", "imf", "patente", "parafiscaux",
  "parametres_sociaux",
  "grilles_salaire", "baremes_cnss",
  "grh",
  "employes", "bulletins", "conges_absences", "sanctions", "paie_virements",
];

// ─── PermissionMap & helpers ──────────────────────────────────────────────────

export type PermissionMap = Record<AppModule, AccessLevel>;

export interface PermissionOverride {
  module: AppModule;
  level: AccessLevel;
}

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  validate: 3,
};

const EMPTY: PermissionMap = Object.fromEntries(
  ALL_MODULES.map((m) => [m, "none" as AccessLevel])
) as PermissionMap;

/** Niveau par défaut accordé pour chaque rôle (parents uniquement). */
const ROLE_DEFAULTS: Record<AppRole, Partial<PermissionMap>> = {
  admin: {
    dashboard: "validate",
    compta: "validate",
    factures: "validate",
    stock: "validate",
    immobilisations: "validate",
    fiscalite: "validate",
    parametres_sociaux: "validate",
    grh: "validate",
  },
  chef_compta: {
    dashboard: "validate",
    compta: "validate",
    factures: "validate",
    stock: "validate",
    immobilisations: "validate",
    fiscalite: "validate",
    parametres_sociaux: "read",
    grh: "read",
  },
  membre_compta: {
    compta: "write",
    factures: "write",
    stock: "write",
    immobilisations: "read",
    fiscalite: "read",
  },
  chef_grh: {
    dashboard: "validate",
    grh: "validate",
    parametres_sociaux: "write",
    fiscalite: "read",
    compta: "read",
    factures: "read",
    stock: "read",
    immobilisations: "read",
  },
  membre_grh: {
    grh: "write",
  },
  dashboard_viewer: {
    dashboard: "read",
  },
  employe: {},
  // Anciens rôles : compatibilité descendante
  rh:        { grh: "write" },
  comptable: { compta: "write", factures: "write", stock: "write", immobilisations: "read", fiscalite: "read" },
  saisie:    { compta: "write", factures: "write", stock: "write" },
};

const merge = (acc: PermissionMap, partial: Partial<PermissionMap>): PermissionMap => {
  const out = { ...acc };
  for (const k of ALL_MODULES) {
    const v = partial[k];
    if (v && LEVEL_RANK[v] > LEVEL_RANK[out[k]]) out[k] = v;
  }
  return out;
};

const grantToPartial = (g: CrossServiceGrant): Partial<PermissionMap> => {
  if (g.service === "compta") {
    return g.level === "chef"
      ? { compta: "validate", factures: "validate", stock: "validate", immobilisations: "validate", fiscalite: "validate", parametres_sociaux: "read" }
      : { compta: "write", factures: "write", stock: "write", immobilisations: "read", fiscalite: "read" };
  }
  if (g.service === "grh") {
    return g.level === "chef"
      ? { grh: "validate", parametres_sociaux: "write", fiscalite: "read", dashboard: "validate" }
      : { grh: "write" };
  }
  return {};
};

// ─── computePermissions ───────────────────────────────────────────────────────

export function computePermissions(
  roles: AppRole[],
  grants: CrossServiceGrant[],
  overrides: PermissionOverride[],
): PermissionMap {
  let perms: PermissionMap = { ...EMPTY };

  // Super-admin global : accès validate sur tous les modules parents
  const isSuper =
    (roles as string[]).includes("admin_general") ||
    (roles as string[]).includes("super_admin");
  if (isSuper) {
    perms = merge(perms, ROLE_DEFAULTS.admin);
  }

  for (const r of roles) {
    perms = merge(perms, ROLE_DEFAULTS[r] || {});
  }

  for (const g of grants) {
    perms = merge(perms, grantToPartial(g));
  }

  // Propagation parent → enfants (héritage) : chaque sous-module hérite
  // au minimum du niveau de son parent, sauf override explicite ci-dessous.
  for (const [parent, children] of Object.entries(MODULE_CHILDREN) as [AppModule, AppModule[]][]) {
    const parentLevel = perms[parent];
    for (const child of children) {
      if (LEVEL_RANK[parentLevel] > LEVEL_RANK[perms[child]]) {
        perms[child] = parentLevel;
      }
    }
  }

  // Les overrides admin REMPLACENT (ils peuvent abaisser ou monter)
  for (const o of overrides) {
    perms[o.module] = o.level;
  }

  return perms;
}

/** True si le niveau effectif est >= au niveau requis. */
export function can(level: AccessLevel | undefined, required: AccessLevel): boolean {
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}
